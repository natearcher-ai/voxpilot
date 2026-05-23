import { describe, it, expect, beforeEach } from 'vitest';
import { ModelEnsemble, textSimilarity, consensusScore, estimatePerplexity, ModelResult } from '../modelEnsemble';

describe('textSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(textSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 1 for case-insensitive match', () => {
    expect(textSimilarity('Hello World', 'hello world')).toBe(1);
  });

  it('returns 0 for empty vs non-empty', () => {
    expect(textSimilarity('', 'hello')).toBe(0);
  });

  it('returns high similarity for similar strings', () => {
    const sim = textSimilarity('hello world', 'hello worl');
    expect(sim).toBeGreaterThan(0.8);
  });

  it('returns low similarity for different strings', () => {
    const sim = textSimilarity('hello world', 'goodbye universe');
    expect(sim).toBeLessThan(0.5);
  });
});

describe('consensusScore', () => {
  it('returns 1 when all models agree', () => {
    const results: ModelResult[] = [
      { modelId: 'a', text: 'hello world', confidence: 0.9, processingMs: 100 },
      { modelId: 'b', text: 'hello world', confidence: 0.8, processingMs: 150 },
      { modelId: 'c', text: 'hello world', confidence: 0.85, processingMs: 120 },
    ];
    expect(consensusScore(results[0], results)).toBe(1);
  });

  it('returns lower score when models disagree', () => {
    const results: ModelResult[] = [
      { modelId: 'a', text: 'hello world', confidence: 0.9, processingMs: 100 },
      { modelId: 'b', text: 'goodbye universe', confidence: 0.8, processingMs: 150 },
    ];
    const score = consensusScore(results[0], results);
    expect(score).toBeLessThan(0.5);
  });

  it('returns 1 for single result', () => {
    const results: ModelResult[] = [
      { modelId: 'a', text: 'hello', confidence: 0.9, processingMs: 100 },
    ];
    expect(consensusScore(results[0], results)).toBe(1);
  });
});

describe('estimatePerplexity', () => {
  it('returns lower score for natural text', () => {
    const natural = estimatePerplexity('the quick brown fox jumps over the lazy dog');
    const garbled = estimatePerplexity('x x x q q q z z z');
    expect(natural).toBeLessThan(garbled);
  });

  it('penalizes repeated words', () => {
    const normal = estimatePerplexity('hello world today');
    const repeated = estimatePerplexity('hello hello hello');
    expect(repeated).toBeGreaterThan(normal);
  });

  it('returns high value for empty/short text', () => {
    expect(estimatePerplexity('')).toBe(100);
    expect(estimatePerplexity('a')).toBe(100);
  });
});

describe('ModelEnsemble', () => {
  let ensemble: ModelEnsemble;

  beforeEach(() => {
    ensemble = new ModelEnsemble();
  });

  it('returns empty result for no inputs', () => {
    const result = ensemble.selectBest([]);
    expect(result.text).toBe('');
    expect(result.selectedModel).toBe('none');
    expect(result.selectionConfidence).toBe(0);
  });

  it('returns single result directly', () => {
    const results: ModelResult[] = [
      { modelId: 'moonshine-base', text: 'hello world', confidence: 0.95, processingMs: 50 },
    ];
    const result = ensemble.selectBest(results);
    expect(result.text).toBe('hello world');
    expect(result.selectedModel).toBe('moonshine-base');
    expect(result.selectionConfidence).toBe(0.95);
    expect(result.agreementRatio).toBe(1);
  });

  it('selects highest confidence with confidence strategy', () => {
    ensemble.setConfig({ strategy: 'confidence' });
    const results: ModelResult[] = [
      { modelId: 'a', text: 'hello world', confidence: 0.8, processingMs: 100 },
      { modelId: 'b', text: 'hello worlds', confidence: 0.95, processingMs: 150 },
    ];
    const result = ensemble.selectBest(results);
    expect(result.selectedModel).toBe('b');
    expect(result.text).toBe('hello worlds');
  });

  it('selects consensus winner with consensus strategy', () => {
    ensemble.setConfig({ strategy: 'consensus' });
    const results: ModelResult[] = [
      { modelId: 'a', text: 'hello world', confidence: 0.7, processingMs: 100 },
      { modelId: 'b', text: 'hello world', confidence: 0.8, processingMs: 150 },
      { modelId: 'c', text: 'goodbye universe', confidence: 0.9, processingMs: 120 },
    ];
    const result = ensemble.selectBest(results);
    // a and b agree, c disagrees — consensus should pick a or b
    expect(result.text).toBe('hello world');
  });

  it('selects by perplexity with perplexity strategy', () => {
    ensemble.setConfig({ strategy: 'perplexity' });
    const results: ModelResult[] = [
      { modelId: 'a', text: 'the function returns a value', confidence: 0.8, processingMs: 100 },
      { modelId: 'b', text: 'x x x x x x', confidence: 0.85, processingMs: 150 },
    ];
    const result = ensemble.selectBest(results);
    expect(result.selectedModel).toBe('a'); // More natural text
  });

  it('hybrid strategy considers all signals', () => {
    ensemble.setConfig({ strategy: 'hybrid' });
    const results: ModelResult[] = [
      { modelId: 'a', text: 'create a function that sorts the array', confidence: 0.85, processingMs: 100 },
      { modelId: 'b', text: 'create a function that sorts the array', confidence: 0.80, processingMs: 150 },
      { modelId: 'c', text: 'great a function that sorts array', confidence: 0.90, processingMs: 120 },
    ];
    const result = ensemble.selectBest(results);
    // a and b agree (high consensus), a has decent confidence
    expect(result.text).toContain('create a function');
  });

  it('tracks statistics', () => {
    const results: ModelResult[] = [
      { modelId: 'a', text: 'hello', confidence: 0.9, processingMs: 100 },
      { modelId: 'b', text: 'hello', confidence: 0.8, processingMs: 150 },
    ];
    ensemble.selectBest(results);
    ensemble.selectBest(results);

    const stats = ensemble.getStats();
    expect(stats.totalRuns).toBe(2);
    expect(Object.values(stats.modelWins).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('meetsThreshold checks minimum confidence', () => {
    ensemble.setConfig({ minConfidence: 0.5, strategy: 'confidence' });
    const results: ModelResult[] = [
      { modelId: 'a', text: 'hello', confidence: 0.9, processingMs: 100 },
      { modelId: 'b', text: 'hello', confidence: 0.85, processingMs: 150 },
    ];
    const result = ensemble.selectBest(results);
    expect(ensemble.meetsThreshold(result)).toBe(true);
  });

  it('meetsThreshold returns false for low confidence', () => {
    ensemble.setConfig({ minConfidence: 0.95, strategy: 'confidence' });
    const results: ModelResult[] = [
      { modelId: 'a', text: 'hello', confidence: 0.5, processingMs: 100 },
      { modelId: 'b', text: 'world', confidence: 0.6, processingMs: 150 },
    ];
    const result = ensemble.selectBest(results);
    expect(ensemble.meetsThreshold(result)).toBe(false);
  });

  it('totalMs is max of individual times (parallel)', () => {
    const results: ModelResult[] = [
      { modelId: 'a', text: 'hello', confidence: 0.9, processingMs: 100 },
      { modelId: 'b', text: 'hello', confidence: 0.8, processingMs: 250 },
      { modelId: 'c', text: 'hello', confidence: 0.85, processingMs: 180 },
    ];
    const result = ensemble.selectBest(results);
    expect(result.totalMs).toBe(250);
  });

  it('getConfig returns current config', () => {
    const config = ensemble.getConfig();
    expect(config.strategy).toBe('hybrid');
    expect(config.models).toContain('moonshine-base');
  });

  it('setConfig updates config', () => {
    ensemble.setConfig({ strategy: 'confidence', minConfidence: 0.9 });
    const config = ensemble.getConfig();
    expect(config.strategy).toBe('confidence');
    expect(config.minConfidence).toBe(0.9);
  });
});
