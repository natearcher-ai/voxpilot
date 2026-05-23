/**
 * Multi-model Ensemble — run multiple ASR models and pick best result per segment.
 *
 * Runs 2-3 ASR models in parallel on the same audio and selects the best
 * transcription using confidence scoring, language model perplexity, and
 * consensus voting.
 *
 * Selection strategies:
 *   - "confidence" — Pick the result with highest model confidence score
 *   - "consensus"  — Pick the result that most models agree on (majority vote)
 *   - "perplexity" — Pick the result with lowest language model perplexity
 *   - "hybrid"     — Weighted combination of all three signals
 *
 * Use cases:
 *   - Critical dictation where accuracy matters more than speed
 *   - Mixed-language environments where different models excel
 *   - Noisy environments where model disagreement signals uncertainty
 *   - Benchmarking models against each other on real workloads
 *
 * Performance: adds ~50-200ms latency depending on model sizes.
 * Enable via `voxpilot.ensemble.enabled` setting (default: false).
 */

import * as vscode from 'vscode';

/** Ensemble selection strategy */
export type SelectionStrategy = 'confidence' | 'consensus' | 'perplexity' | 'hybrid';

/** Result from a single model */
export interface ModelResult {
  /** Model ID */
  modelId: string;
  /** Transcribed text */
  text: string;
  /** Model confidence score (0-1) */
  confidence: number;
  /** Processing time in ms */
  processingMs: number;
  /** Language detected */
  language?: string;
  /** Word-level timestamps if available */
  wordTimestamps?: Array<{ word: string; start: number; end: number }>;
}

/** Ensemble result after selection */
export interface EnsembleResult {
  /** Selected transcription */
  text: string;
  /** Which model was selected */
  selectedModel: string;
  /** Selection strategy used */
  strategy: SelectionStrategy;
  /** Confidence in the selection (0-1) */
  selectionConfidence: number;
  /** Agreement ratio (how many models agreed) */
  agreementRatio: number;
  /** All individual model results */
  modelResults: ModelResult[];
  /** Total processing time (parallel, so max of individual times) */
  totalMs: number;
}

/** Ensemble configuration */
export interface EnsembleConfig {
  /** Models to run in the ensemble */
  models: string[];
  /** Selection strategy */
  strategy: SelectionStrategy;
  /** Minimum confidence threshold (below this, flag for review) */
  minConfidence: number;
  /** Whether to run models in parallel */
  parallel: boolean;
  /** Weights for hybrid strategy [confidence, consensus, perplexity] */
  hybridWeights: [number, number, number];
}

/** Default ensemble configuration */
export const DEFAULT_ENSEMBLE_CONFIG: EnsembleConfig = {
  models: ['moonshine-base', 'whisper-small'],
  strategy: 'hybrid',
  minConfidence: 0.7,
  parallel: true,
  hybridWeights: [0.4, 0.35, 0.25],
};

/**
 * Compute text similarity between two strings (normalized Levenshtein).
 */
export function textSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();

  if (la === lb) return 1;

  const maxLen = Math.max(la.length, lb.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(la, lb);
  return 1 - (distance / maxLen);
}

/**
 * Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Compute consensus score for a result against all other results.
 */
export function consensusScore(result: ModelResult, allResults: ModelResult[]): number {
  if (allResults.length <= 1) return 1;

  const others = allResults.filter(r => r.modelId !== result.modelId);
  const similarities = others.map(r => textSimilarity(result.text, r.text));
  return similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
}

/**
 * Estimate perplexity using simple bigram frequency (lightweight proxy).
 * Lower is better (more natural language).
 */
export function estimatePerplexity(text: string): number {
  if (!text || text.length < 2) return 100;

  const words = text.toLowerCase().split(/\s+/);
  if (words.length < 2) return 50;

  // Simple heuristics for "naturalness"
  let score = 0;

  // Penalize repeated words
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1]) score += 10;
  }

  // Penalize very short words in sequence
  const shortWordRuns = words.filter(w => w.length <= 1).length;
  score += shortWordRuns * 5;

  // Penalize lack of common English patterns
  const commonBigrams = ['the ', 'in ', 'to ', 'and ', 'of ', 'is ', 'it ', 'for '];
  const textLower = text.toLowerCase();
  const bigramHits = commonBigrams.filter(b => textLower.includes(b)).length;
  score += Math.max(0, 3 - bigramHits) * 5;

  // Normalize by length
  return Math.max(1, score / Math.sqrt(words.length));
}

/**
 * Multi-model ensemble engine.
 */
export class ModelEnsemble {
  private config: EnsembleConfig;
  private stats = {
    totalRuns: 0,
    modelWins: new Map<string, number>(),
    avgAgreement: 0,
    totalAgreement: 0,
  };

  constructor(config: EnsembleConfig = DEFAULT_ENSEMBLE_CONFIG) {
    this.config = { ...config };
  }

  /** Get current configuration */
  getConfig(): EnsembleConfig {
    return { ...this.config };
  }

  /** Update configuration */
  setConfig(config: Partial<EnsembleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Get ensemble statistics */
  getStats(): { totalRuns: number; modelWins: Record<string, number>; avgAgreement: number } {
    return {
      totalRuns: this.stats.totalRuns,
      modelWins: Object.fromEntries(this.stats.modelWins),
      avgAgreement: this.stats.totalRuns > 0 ? this.stats.totalAgreement / this.stats.totalRuns : 0,
    };
  }

  /**
   * Select the best result from multiple model outputs.
   */
  selectBest(results: ModelResult[]): EnsembleResult {
    if (results.length === 0) {
      return {
        text: '',
        selectedModel: 'none',
        strategy: this.config.strategy,
        selectionConfidence: 0,
        agreementRatio: 0,
        modelResults: [],
        totalMs: 0,
      };
    }

    if (results.length === 1) {
      return {
        text: results[0].text,
        selectedModel: results[0].modelId,
        strategy: this.config.strategy,
        selectionConfidence: results[0].confidence,
        agreementRatio: 1,
        modelResults: results,
        totalMs: results[0].processingMs,
      };
    }

    let selected: ModelResult;
    let selectionConfidence: number;

    switch (this.config.strategy) {
      case 'confidence':
        selected = this.selectByConfidence(results);
        selectionConfidence = selected.confidence;
        break;
      case 'consensus':
        selected = this.selectByConsensus(results);
        selectionConfidence = consensusScore(selected, results);
        break;
      case 'perplexity':
        selected = this.selectByPerplexity(results);
        selectionConfidence = selected.confidence;
        break;
      case 'hybrid':
      default:
        ({ selected, selectionConfidence } = this.selectByHybrid(results));
        break;
    }

    const agreementRatio = consensusScore(selected, results);
    const totalMs = Math.max(...results.map(r => r.processingMs));

    // Update stats
    this.stats.totalRuns++;
    this.stats.modelWins.set(selected.modelId, (this.stats.modelWins.get(selected.modelId) || 0) + 1);
    this.stats.totalAgreement += agreementRatio;

    return {
      text: selected.text,
      selectedModel: selected.modelId,
      strategy: this.config.strategy,
      selectionConfidence,
      agreementRatio,
      modelResults: results,
      totalMs,
    };
  }

  /** Check if results meet minimum confidence threshold */
  meetsThreshold(result: EnsembleResult): boolean {
    return result.selectionConfidence >= this.config.minConfidence;
  }

  private selectByConfidence(results: ModelResult[]): ModelResult {
    return results.reduce((best, r) => r.confidence > best.confidence ? r : best);
  }

  private selectByConsensus(results: ModelResult[]): ModelResult {
    let bestResult = results[0];
    let bestScore = 0;

    for (const result of results) {
      const score = consensusScore(result, results);
      if (score > bestScore) {
        bestScore = score;
        bestResult = result;
      }
    }

    return bestResult;
  }

  private selectByPerplexity(results: ModelResult[]): ModelResult {
    return results.reduce((best, r) => {
      const bestPpl = estimatePerplexity(best.text);
      const rPpl = estimatePerplexity(r.text);
      return rPpl < bestPpl ? r : best;
    });
  }

  private selectByHybrid(results: ModelResult[]): { selected: ModelResult; selectionConfidence: number } {
    const [wConf, wCons, wPpl] = this.config.hybridWeights;
    let bestResult = results[0];
    let bestScore = -Infinity;

    for (const result of results) {
      const confScore = result.confidence;
      const consScore = consensusScore(result, results);
      const pplScore = 1 / (1 + estimatePerplexity(result.text)); // Invert: lower perplexity = higher score

      const totalScore = (wConf * confScore) + (wCons * consScore) + (wPpl * pplScore);

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestResult = result;
      }
    }

    return { selected: bestResult, selectionConfidence: Math.min(1, bestScore) };
  }
}

/** Singleton instance */
export const modelEnsemble = new ModelEnsemble();
