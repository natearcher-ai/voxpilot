/**
 * Noise Profile Calibration — one-time environment scan to optimize noise gate and VAD.
 *
 * Records a short sample of ambient noise and analyzes it to:
 *   - Set optimal noise gate threshold (just above ambient floor)
 *   - Configure VAD sensitivity for the environment
 *   - Detect periodic noise patterns (fans, HVAC, keyboard clicks)
 *   - Create a noise fingerprint for the environment
 *   - Suggest model selection based on noise level
 *
 * Calibration flow:
 *   1. User says "calibrate" or triggers via command palette
 *   2. System records 5 seconds of ambient noise (user stays silent)
 *   3. Analyzes frequency spectrum, energy distribution, periodicity
 *   4. Sets noise gate, VAD sensitivity, and neural denoiser params
 *   5. Stores profile for the environment (can have multiple)
 *
 * Enable via `voxpilot.noiseCalibration.enabled` setting (default: true).
 */

import * as vscode from 'vscode';

/** Noise environment classification */
export type NoiseEnvironment = 'quiet' | 'moderate' | 'noisy' | 'very-noisy';

/** Noise characteristics detected during calibration */
export interface NoiseProfile {
  /** Profile ID */
  id: string;
  /** User-given name (e.g., "Home Office", "Coffee Shop") */
  name: string;
  /** Average ambient noise level (RMS, 0-1) */
  ambientLevel: number;
  /** Peak noise level detected */
  peakLevel: number;
  /** Environment classification */
  environment: NoiseEnvironment;
  /** Dominant frequency bands (Hz) */
  dominantFrequencies: number[];
  /** Whether periodic noise was detected (fans, hum) */
  periodicNoise: boolean;
  /** Periodicity frequency if detected (Hz) */
  periodicityHz?: number;
  /** Recommended noise gate threshold */
  recommendedGateThreshold: number;
  /** Recommended VAD sensitivity (0-1) */
  recommendedVadSensitivity: number;
  /** Whether neural denoiser is recommended */
  recommendNeuralDenoise: boolean;
  /** Recommended ASR model based on noise */
  recommendedModel: string;
  /** Calibration timestamp */
  calibratedAt: number;
  /** Duration of calibration sample in ms */
  sampleDurationMs: number;
  /** Whether this profile is currently active */
  active: boolean;
}

/** Calibration result */
export interface CalibrationResult {
  /** Whether calibration succeeded */
  success: boolean;
  /** The generated noise profile */
  profile?: NoiseProfile;
  /** Error message if failed */
  error?: string;
  /** Recommendations for the user */
  recommendations: string[];
}

/** Audio analysis results from a noise sample */
export interface NoiseAnalysis {
  /** RMS energy level (0-1) */
  rmsLevel: number;
  /** Peak amplitude (0-1) */
  peakLevel: number;
  /** Zero-crossing rate (indicator of high-frequency content) */
  zeroCrossingRate: number;
  /** Spectral centroid (Hz) — brightness of the noise */
  spectralCentroid: number;
  /** Whether the signal has periodic components */
  hasPeriodicity: boolean;
  /** Dominant frequency if periodic */
  dominantFrequency?: number;
  /** Signal-to-noise ratio estimate (dB) */
  estimatedSnr: number;
}

/**
 * Analyze a noise sample to extract characteristics.
 */
export function analyzeNoiseSample(audioData: Float32Array, sampleRate: number): NoiseAnalysis {
  if (audioData.length === 0) {
    return { rmsLevel: 0, peakLevel: 0, zeroCrossingRate: 0, spectralCentroid: 0, hasPeriodicity: false, estimatedSnr: 60 };
  }

  // RMS level
  let sumSquares = 0;
  let peak = 0;
  let zeroCrossings = 0;

  for (let i = 0; i < audioData.length; i++) {
    const sample = audioData[i];
    sumSquares += sample * sample;
    const absSample = Math.abs(sample);
    if (absSample > peak) peak = absSample;
    if (i > 0 && Math.sign(audioData[i]) !== Math.sign(audioData[i - 1])) {
      zeroCrossings++;
    }
  }

  const rmsLevel = Math.sqrt(sumSquares / audioData.length);
  const zeroCrossingRate = zeroCrossings / audioData.length;

  // Spectral centroid approximation (using zero-crossing rate as proxy)
  const spectralCentroid = zeroCrossingRate * sampleRate / 2;

  // Periodicity detection via autocorrelation
  const { hasPeriodicity, dominantFrequency } = detectPeriodicity(audioData, sampleRate);

  // SNR estimate (assuming noise floor is the RMS)
  const estimatedSnr = rmsLevel > 0 ? 20 * Math.log10(1 / rmsLevel) : 60;

  return {
    rmsLevel,
    peakLevel: peak,
    zeroCrossingRate,
    spectralCentroid,
    hasPeriodicity,
    dominantFrequency,
    estimatedSnr,
  };
}

/**
 * Detect periodicity in audio using simplified autocorrelation.
 */
function detectPeriodicity(audioData: Float32Array, sampleRate: number): { hasPeriodicity: boolean; dominantFrequency?: number } {
  // Look for periodicity in the 50-500 Hz range (common for fans, hum)
  const minLag = Math.floor(sampleRate / 500); // 500 Hz
  const maxLag = Math.floor(sampleRate / 50);  // 50 Hz
  const frameSize = Math.min(audioData.length, sampleRate); // Max 1 second

  if (frameSize < maxLag * 2) {
    return { hasPeriodicity: false };
  }

  let maxCorrelation = 0;
  let bestLag = 0;

  for (let lag = minLag; lag <= maxLag && lag < frameSize / 2; lag++) {
    let correlation = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < frameSize - lag; i++) {
      correlation += audioData[i] * audioData[i + lag];
      norm1 += audioData[i] * audioData[i];
      norm2 += audioData[i + lag] * audioData[i + lag];
    }

    const normalizedCorr = (norm1 > 0 && norm2 > 0)
      ? correlation / Math.sqrt(norm1 * norm2)
      : 0;

    if (normalizedCorr > maxCorrelation) {
      maxCorrelation = normalizedCorr;
      bestLag = lag;
    }
  }

  // Threshold for periodicity detection
  const hasPeriodicity = maxCorrelation > 0.3;
  const dominantFrequency = hasPeriodicity && bestLag > 0 ? sampleRate / bestLag : undefined;

  return { hasPeriodicity, dominantFrequency };
}

/**
 * Classify noise environment based on RMS level.
 */
export function classifyEnvironment(rmsLevel: number): NoiseEnvironment {
  if (rmsLevel < 0.005) return 'quiet';
  if (rmsLevel < 0.02) return 'moderate';
  if (rmsLevel < 0.05) return 'noisy';
  return 'very-noisy';
}

/**
 * Generate recommendations based on noise analysis.
 */
export function generateRecommendations(analysis: NoiseAnalysis): {
  gateThreshold: number;
  vadSensitivity: number;
  neuralDenoise: boolean;
  model: string;
  tips: string[];
} {
  const tips: string[] = [];

  // Noise gate: set just above ambient level with margin
  const gateThreshold = Math.min(0.1, analysis.rmsLevel * 2.5);

  // VAD sensitivity: higher in noisy environments (more aggressive filtering)
  const vadSensitivity = analysis.rmsLevel < 0.01 ? 0.3 : analysis.rmsLevel < 0.03 ? 0.5 : 0.7;

  // Neural denoise: recommend for moderate+ noise
  const neuralDenoise = analysis.rmsLevel > 0.015;

  // Model recommendation
  let model = 'moonshine-base';
  if (analysis.rmsLevel > 0.03) {
    model = 'whisper-small'; // Better noise robustness
    tips.push('Noisy environment detected. Whisper models handle noise better than Moonshine.');
  }

  if (analysis.hasPeriodicity) {
    tips.push(`Periodic noise detected (~${Math.round(analysis.dominantFrequency || 0)} Hz). Neural denoiser will help.`);
  }

  if (analysis.rmsLevel < 0.003) {
    tips.push('Very quiet environment. You can use lower VAD sensitivity for faster response.');
  }

  if (analysis.peakLevel > 0.5) {
    tips.push('Loud transients detected. Consider using push-to-talk mode to avoid false triggers.');
  }

  if (analysis.spectralCentroid > 3000) {
    tips.push('High-frequency noise present (keyboard, mouse clicks). Noise gate will filter these.');
  }

  return { gateThreshold, vadSensitivity, neuralDenoise, model, tips };
}

/**
 * Noise Profile Calibration manager.
 */
export class NoiseCalibrationManager {
  private profiles: Map<string, NoiseProfile> = new Map();
  private activeProfileId: string | null = null;
  private context: vscode.ExtensionContext | undefined;

  /** Initialize with extension context */
  init(extensionContext: vscode.ExtensionContext): void {
    this.context = extensionContext;
    this.loadProfiles();
  }

  /** Get all profiles */
  getProfiles(): NoiseProfile[] {
    return [...this.profiles.values()];
  }

  /** Get active profile */
  getActiveProfile(): NoiseProfile | undefined {
    return this.activeProfileId ? this.profiles.get(this.activeProfileId) : undefined;
  }

  /** Get profile count */
  get count(): number {
    return this.profiles.size;
  }

  /**
   * Run calibration on an audio sample.
   */
  calibrate(audioData: Float32Array, sampleRate: number, name: string = 'Default'): CalibrationResult {
    if (audioData.length < sampleRate) {
      return { success: false, error: 'Audio sample too short (need at least 1 second)', recommendations: [] };
    }

    const analysis = analyzeNoiseSample(audioData, sampleRate);
    const environment = classifyEnvironment(analysis.rmsLevel);
    const recs = generateRecommendations(analysis);

    const profile: NoiseProfile = {
      id: `noise-${Date.now()}`,
      name,
      ambientLevel: analysis.rmsLevel,
      peakLevel: analysis.peakLevel,
      environment,
      dominantFrequencies: analysis.dominantFrequency ? [analysis.dominantFrequency] : [],
      periodicNoise: analysis.hasPeriodicity,
      periodicityHz: analysis.dominantFrequency,
      recommendedGateThreshold: recs.gateThreshold,
      recommendedVadSensitivity: recs.vadSensitivity,
      recommendNeuralDenoise: recs.neuralDenoise,
      recommendedModel: recs.model,
      calibratedAt: Date.now(),
      sampleDurationMs: (audioData.length / sampleRate) * 1000,
      active: true,
    };

    // Deactivate previous active profile
    for (const p of this.profiles.values()) {
      p.active = false;
    }

    this.profiles.set(profile.id, profile);
    this.activeProfileId = profile.id;
    this.saveProfiles();

    return {
      success: true,
      profile,
      recommendations: recs.tips,
    };
  }

  /** Activate a profile by ID */
  activateProfile(id: string): boolean {
    if (!this.profiles.has(id)) return false;

    for (const p of this.profiles.values()) {
      p.active = false;
    }
    this.profiles.get(id)!.active = true;
    this.activeProfileId = id;
    this.saveProfiles();
    return true;
  }

  /** Delete a profile */
  deleteProfile(id: string): boolean {
    if (!this.profiles.has(id)) return false;
    this.profiles.delete(id);
    if (this.activeProfileId === id) {
      this.activeProfileId = null;
    }
    this.saveProfiles();
    return true;
  }

  /** Rename a profile */
  renameProfile(id: string, name: string): boolean {
    const profile = this.profiles.get(id);
    if (!profile) return false;
    profile.name = name;
    this.saveProfiles();
    return true;
  }

  private loadProfiles(): void {
    if (!this.context) return;
    const saved = this.context.globalState.get<{ profiles: Record<string, NoiseProfile>; activeId: string | null }>('noiseCalibration');
    if (saved) {
      this.profiles = new Map(Object.entries(saved.profiles));
      this.activeProfileId = saved.activeId;
    }
  }

  private saveProfiles(): void {
    if (!this.context) return;
    this.context.globalState.update('noiseCalibration', {
      profiles: Object.fromEntries(this.profiles),
      activeId: this.activeProfileId,
    });
  }
}

/** Singleton instance */
export const noiseCalibration = new NoiseCalibrationManager();
