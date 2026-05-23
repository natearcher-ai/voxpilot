/**
 * Custom Wake Words — train personalized wake word detection locally.
 *
 * Allows users to define and train custom wake words that activate VoxPilot:
 *   - Record 3-5 samples of the wake word
 *   - Local MFCC feature extraction + DTW matching
 *   - No cloud processing — all training and detection runs on-device
 *   - Multiple wake words supported (e.g., "Hey Vox", "Computer", custom name)
 *   - Adjustable sensitivity (false positive vs false negative tradeoff)
 *
 * Built-in wake words:
 *   - "Hey VoxPilot" (default)
 *   - "Hey Vox"
 *   - "Computer"
 *   - "Start listening"
 *
 * Training flow:
 *   1. User says "train wake word <phrase>"
 *   2. System prompts for 5 recordings of the phrase
 *   3. MFCC features extracted from each sample
 *   4. Template stored locally in workspace state
 *   5. Detection runs against incoming audio using DTW similarity
 *
 * Enable via `voxpilot.customWakeWords.enabled` setting (default: true).
 */

import * as vscode from 'vscode';

/** Wake word configuration */
export interface WakeWordConfig {
  /** The wake word phrase */
  phrase: string;
  /** Whether this wake word is active */
  enabled: boolean;
  /** Detection sensitivity (0.0 = strict, 1.0 = loose). Default: 0.5 */
  sensitivity: number;
  /** Whether this is a built-in or custom wake word */
  builtIn: boolean;
  /** Number of training samples recorded */
  sampleCount: number;
  /** MFCC feature templates (serialized) */
  templates?: number[][];
}

/** Wake word detection result */
export interface DetectionResult {
  /** Whether a wake word was detected */
  detected: boolean;
  /** Which wake word was detected */
  phrase?: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Detection timestamp */
  timestamp: number;
}

/** Training session state */
export interface TrainingSession {
  /** Phrase being trained */
  phrase: string;
  /** Samples collected so far */
  samplesCollected: number;
  /** Target number of samples */
  targetSamples: number;
  /** Whether training is in progress */
  active: boolean;
  /** Collected MFCC templates */
  templates: number[][];
}

/** Built-in wake word definitions */
const BUILTIN_WAKE_WORDS: WakeWordConfig[] = [
  { phrase: 'hey voxpilot', enabled: true, sensitivity: 0.5, builtIn: true, sampleCount: 0 },
  { phrase: 'hey vox', enabled: false, sensitivity: 0.5, builtIn: true, sampleCount: 0 },
  { phrase: 'computer', enabled: false, sensitivity: 0.4, builtIn: true, sampleCount: 0 },
  { phrase: 'start listening', enabled: false, sensitivity: 0.5, builtIn: true, sampleCount: 0 },
];

/**
 * Compute MFCC-like features from audio samples (simplified).
 * In production, this would use a proper MFCC implementation.
 */
export function extractFeatures(audioData: Float32Array, sampleRate: number): number[] {
  const frameSize = Math.floor(sampleRate * 0.025); // 25ms frames
  const hopSize = Math.floor(sampleRate * 0.010);   // 10ms hop
  const numFrames = Math.floor((audioData.length - frameSize) / hopSize) + 1;
  const features: number[] = [];

  for (let i = 0; i < Math.min(numFrames, 100); i++) {
    const start = i * hopSize;
    const frame = audioData.slice(start, start + frameSize);

    // Simplified: compute energy and zero-crossing rate per frame
    let energy = 0;
    let zeroCrossings = 0;
    for (let j = 0; j < frame.length; j++) {
      energy += frame[j] * frame[j];
      if (j > 0 && Math.sign(frame[j]) !== Math.sign(frame[j - 1])) {
        zeroCrossings++;
      }
    }
    features.push(energy / frame.length);
    features.push(zeroCrossings / frame.length);
  }

  return features;
}

/**
 * Dynamic Time Warping distance between two feature sequences.
 */
export function dtwDistance(seq1: number[], seq2: number[]): number {
  const n = seq1.length;
  const m = seq2.length;

  if (n === 0 || m === 0) return Infinity;

  // Use a simplified 1D DTW
  const dtw: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  dtw[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(seq1[i - 1] - seq2[j - 1]);
      dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
    }
  }

  return dtw[n][m] / Math.max(n, m); // Normalize by length
}

/**
 * Custom Wake Word manager — handles training, storage, and detection.
 */
export class CustomWakeWordManager {
  private wakeWords: WakeWordConfig[] = [];
  private trainingSession: TrainingSession | null = null;
  private context: vscode.ExtensionContext | undefined;
  private onDetectionCallbacks: ((result: DetectionResult) => void)[] = [];

  constructor() {
    this.wakeWords = BUILTIN_WAKE_WORDS.map(w => ({ ...w }));
  }

  /** Initialize with extension context */
  init(extensionContext: vscode.ExtensionContext): void {
    this.context = extensionContext;
    this.loadWakeWords();
  }

  /** Get all configured wake words */
  getWakeWords(): WakeWordConfig[] {
    return [...this.wakeWords];
  }

  /** Get only enabled wake words */
  getEnabledWakeWords(): WakeWordConfig[] {
    return this.wakeWords.filter(w => w.enabled);
  }

  /** Enable a wake word by phrase */
  enableWakeWord(phrase: string): boolean {
    const ww = this.wakeWords.find(w => w.phrase === phrase.toLowerCase());
    if (ww) {
      ww.enabled = true;
      this.saveWakeWords();
      return true;
    }
    return false;
  }

  /** Disable a wake word by phrase */
  disableWakeWord(phrase: string): boolean {
    const ww = this.wakeWords.find(w => w.phrase === phrase.toLowerCase());
    if (ww) {
      ww.enabled = false;
      this.saveWakeWords();
      return true;
    }
    return false;
  }

  /** Set sensitivity for a wake word */
  setSensitivity(phrase: string, sensitivity: number): boolean {
    const ww = this.wakeWords.find(w => w.phrase === phrase.toLowerCase());
    if (ww) {
      ww.sensitivity = Math.max(0, Math.min(1, sensitivity));
      this.saveWakeWords();
      return true;
    }
    return false;
  }

  /** Start training a new custom wake word */
  startTraining(phrase: string, targetSamples: number = 5): TrainingSession {
    this.trainingSession = {
      phrase: phrase.toLowerCase(),
      samplesCollected: 0,
      targetSamples,
      active: true,
      templates: [],
    };
    return this.trainingSession;
  }

  /** Add a training sample */
  addTrainingSample(audioData: Float32Array, sampleRate: number): TrainingSession | null {
    if (!this.trainingSession || !this.trainingSession.active) return null;

    const features = extractFeatures(audioData, sampleRate);
    this.trainingSession.templates.push(features);
    this.trainingSession.samplesCollected++;

    // Check if training is complete
    if (this.trainingSession.samplesCollected >= this.trainingSession.targetSamples) {
      this.finalizeTraining();
    }

    return this.trainingSession;
  }

  /** Cancel current training session */
  cancelTraining(): void {
    this.trainingSession = null;
  }

  /** Get current training session */
  getTrainingSession(): TrainingSession | null {
    return this.trainingSession;
  }

  /** Check audio against all enabled wake words */
  detect(audioData: Float32Array, sampleRate: number): DetectionResult {
    const features = extractFeatures(audioData, sampleRate);
    const enabled = this.getEnabledWakeWords();

    let bestMatch: DetectionResult = {
      detected: false,
      confidence: 0,
      timestamp: Date.now(),
    };

    for (const ww of enabled) {
      if (!ww.templates || ww.templates.length === 0) continue;

      // Compare against all templates, take best match
      let minDistance = Infinity;
      for (const template of ww.templates) {
        const distance = dtwDistance(features, template);
        if (distance < minDistance) {
          minDistance = distance;
        }
      }

      // Convert distance to confidence (lower distance = higher confidence)
      const threshold = 1.0 - ww.sensitivity; // Higher sensitivity = lower threshold
      const confidence = Math.max(0, 1 - minDistance);

      if (confidence > threshold && confidence > bestMatch.confidence) {
        bestMatch = {
          detected: true,
          phrase: ww.phrase,
          confidence,
          timestamp: Date.now(),
        };
      }
    }

    if (bestMatch.detected) {
      this.notifyDetection(bestMatch);
    }

    return bestMatch;
  }

  /** Register a detection callback */
  onDetection(callback: (result: DetectionResult) => void): vscode.Disposable {
    this.onDetectionCallbacks.push(callback);
    return {
      dispose: () => {
        const idx = this.onDetectionCallbacks.indexOf(callback);
        if (idx >= 0) this.onDetectionCallbacks.splice(idx, 1);
      },
    };
  }

  /** Delete a custom wake word */
  deleteWakeWord(phrase: string): boolean {
    const idx = this.wakeWords.findIndex(w => w.phrase === phrase.toLowerCase() && !w.builtIn);
    if (idx >= 0) {
      this.wakeWords.splice(idx, 1);
      this.saveWakeWords();
      return true;
    }
    return false;
  }

  private finalizeTraining(): void {
    if (!this.trainingSession) return;

    const existing = this.wakeWords.find(w => w.phrase === this.trainingSession!.phrase);
    if (existing) {
      existing.templates = this.trainingSession.templates;
      existing.sampleCount = this.trainingSession.samplesCollected;
      existing.enabled = true;
    } else {
      this.wakeWords.push({
        phrase: this.trainingSession.phrase,
        enabled: true,
        sensitivity: 0.5,
        builtIn: false,
        sampleCount: this.trainingSession.samplesCollected,
        templates: this.trainingSession.templates,
      });
    }

    this.trainingSession.active = false;
    this.saveWakeWords();
  }

  private notifyDetection(result: DetectionResult): void {
    for (const cb of this.onDetectionCallbacks) {
      try { cb(result); } catch { /* swallow */ }
    }
  }

  private loadWakeWords(): void {
    if (!this.context) {
      this.wakeWords = BUILTIN_WAKE_WORDS.map(w => ({ ...w }));
      return;
    }
    const saved = this.context.globalState.get<WakeWordConfig[]>('customWakeWords');
    this.wakeWords = saved ?? BUILTIN_WAKE_WORDS.map(w => ({ ...w }));
  }

  private saveWakeWords(): void {
    if (!this.context) return;
    this.context.globalState.update('customWakeWords', this.wakeWords);
  }
}

/** Singleton instance */
export const customWakeWordManager = new CustomWakeWordManager();
