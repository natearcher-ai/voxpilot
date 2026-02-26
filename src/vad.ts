/**
 * Adaptive energy-based Voice Activity Detection.
 * Calibrates to the ambient noise floor, then detects speech as a multiple above it.
 */
export class VoiceActivityDetector {
  private sensitivityMultiplier: number;
  private speechFrames = 0;
  private silenceFrames = 0;
  private isSpeaking = false;

  // Adaptive noise floor
  private noiseFloor = 0;
  private calibrationFrames = 0;
  private readonly calibrationTarget = 30; // ~1s of audio at 30ms frames
  private calibrated = false;
  private rmsSum = 0;

  // Require N consecutive frames to trigger state change (debounce)
  private readonly speechOnsetFrames = 3;
  private readonly silenceOnsetFrames: number;

  // Minimum absolute threshold to avoid triggering on pure digital silence
  private readonly minThreshold = 0.002;

  constructor(sensitivity: number = 0.5, silenceTimeoutMs: number = 1500, frameDurationMs: number = 30) {
    // Higher sensitivity = lower multiplier = easier to trigger
    // sensitivity 0.5 → multiplier ~3x noise floor
    // sensitivity 0.9 → multiplier ~1.5x noise floor
    // sensitivity 0.1 → multiplier ~6x noise floor
    this.sensitivityMultiplier = 1.5 + (1 - sensitivity) * 5;
    this.silenceOnsetFrames = Math.ceil(silenceTimeoutMs / frameDurationMs);
  }

  /**
   * Process a frame of PCM 16-bit LE audio.
   * Returns: { isSpeech, speechStarted, speechEnded, rms, threshold }
   */
  process(pcm16: Buffer): { isSpeech: boolean; speechStarted: boolean; speechEnded: boolean; rms: number; threshold: number } {
    const rms = this.computeRMS(pcm16);

    // Calibration phase: measure ambient noise floor
    if (!this.calibrated) {
      this.rmsSum += rms;
      this.calibrationFrames++;
      if (this.calibrationFrames >= this.calibrationTarget) {
        this.noiseFloor = this.rmsSum / this.calibrationFrames;
        this.calibrated = true;
      }
      return { isSpeech: false, speechStarted: false, speechEnded: false, rms, threshold: 0 };
    }

    // Slowly adapt noise floor during silence (exponential moving average)
    if (!this.isSpeaking) {
      this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05;
    }

    const threshold = Math.max(this.noiseFloor * this.sensitivityMultiplier, this.minThreshold);
    const frameIsSpeech = rms > threshold;

    let speechStarted = false;
    let speechEnded = false;

    if (frameIsSpeech) {
      this.speechFrames++;
      this.silenceFrames = 0;

      if (!this.isSpeaking && this.speechFrames >= this.speechOnsetFrames) {
        this.isSpeaking = true;
        speechStarted = true;
      }
    } else {
      this.silenceFrames++;
      this.speechFrames = 0;

      if (this.isSpeaking && this.silenceFrames >= this.silenceOnsetFrames) {
        this.isSpeaking = false;
        speechEnded = true;
      }
    }

    return { isSpeech: this.isSpeaking, speechStarted, speechEnded, rms, threshold };
  }

  reset(): void {
    this.speechFrames = 0;
    this.silenceFrames = 0;
    this.isSpeaking = false;
    this.calibrated = false;
    this.calibrationFrames = 0;
    this.rmsSum = 0;
    this.noiseFloor = 0;
  }

  private computeRMS(pcm16: Buffer): number {
    const samples = pcm16.length / 2;
    if (samples === 0) { return 0; }

    let sumSq = 0;
    for (let i = 0; i < pcm16.length; i += 2) {
      const sample = pcm16.readInt16LE(i) / 32768;
      sumSq += sample * sample;
    }
    return Math.sqrt(sumSq / samples);
  }
}
