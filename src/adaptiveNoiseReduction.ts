/**
 * Adaptive noise reduction — automatically calibrates noise gate threshold
 * based on ambient noise levels.
 *
 * During the first few seconds of recording, measures the ambient noise floor
 * and sets the gate threshold just above it. Periodically re-calibrates to
 * adapt to changing environments (e.g. moving from quiet room to noisy café).
 *
 * This wraps the existing NoiseGate with auto-calibration logic:
 *   1. Calibration phase: collect RMS samples for calibrationMs (default 500ms)
 *   2. Set threshold = mean RMS * headroom multiplier (default 2.0)
 *   3. Ongoing: track noise floor with exponential moving average
 *   4. Re-calibrate if noise floor shifts significantly
 *
 * Enable via `voxpilot.noiseReduction` setting (default: true).
 * Sensitivity adjustable via `voxpilot.noiseReductionSensitivity` (1-5, default 3).
 */

import { NoiseGate } from './noiseGate';

/** Sensitivity presets: maps 1-5 to headroom multiplier */
const SENSITIVITY_MAP: Record<number, number> = {
  1: 3.5,  // Very aggressive — gates more, may clip quiet speech
  2: 2.5,  // Aggressive
  3: 2.0,  // Balanced (default)
  4: 1.6,  // Gentle
  5: 1.3,  // Very gentle — gates less, more background noise passes
};

export class AdaptiveNoiseReduction {
  private gate: NoiseGate;
  private readonly frameDurationMs: number;
  private readonly calibrationFrames: number;
  private readonly emaAlpha: number;

  // Calibration state
  private rmsSamples: number[] = [];
  private calibrated = false;
  private noiseFloor = 0;
  private headroom: number;

  // Ongoing adaptation
  private emaRms = 0;
  private silenceFrameCount = 0;
  private readonly recalibrationThreshold = 0.5; // 50% shift triggers recalibration
  private framesSinceCalibration = 0;
  private readonly minFramesBetweenRecalibrations: number;

  /**
   * @param sensitivity 1-5 (1=aggressive, 5=gentle). Default 3.
   * @param calibrationMs Duration of initial calibration phase. Default 500ms.
   * @param frameDurationMs Duration of each audio frame. Default 30ms.
   */
  constructor(
    sensitivity: number = 3,
    calibrationMs: number = 500,
    frameDurationMs: number = 30,
  ) {
    this.frameDurationMs = frameDurationMs;
    this.calibrationFrames = Math.ceil(calibrationMs / frameDurationMs);
    this.headroom = SENSITIVITY_MAP[Math.max(1, Math.min(5, Math.round(sensitivity)))] ?? 2.0;
    this.emaAlpha = 0.02; // Slow-moving average for noise floor tracking
    this.minFramesBetweenRecalibrations = Math.ceil(5000 / frameDurationMs); // 5s minimum

    // Start with gate disabled (threshold 0) until calibration completes
    this.gate = new NoiseGate(0, 5, 50, frameDurationMs);
  }

  /** Whether initial calibration is complete */
  get isCalibrated(): boolean {
    return this.calibrated;
  }

  /** Current noise floor estimate (RMS 0-1) */
  get currentNoiseFloor(): number {
    return this.noiseFloor;
  }

  /** Current gate threshold (RMS 0-1) */
  get currentThreshold(): number {
    return this.noiseFloor * this.headroom;
  }

  /** Whether the gate is currently passing audio */
  get isOpen(): boolean {
    return this.gate.isOpen;
  }

  /**
   * Process a PCM 16-bit LE audio frame.
   * During calibration, all audio passes through while noise floor is measured.
   * After calibration, the adaptive gate filters noise.
   */
  process(pcm16: Buffer): Buffer {
    const rms = this.computeRMS(pcm16);

    if (!this.calibrated) {
      // Calibration phase: collect samples
      this.rmsSamples.push(rms);

      if (this.rmsSamples.length >= this.calibrationFrames) {
        this.finishCalibration();
      }

      // Pass audio through during calibration
      return pcm16;
    }

    // Track ongoing noise floor with EMA (only during silence/low-energy frames)
    this.framesSinceCalibration++;
    if (rms < this.currentThreshold) {
      this.silenceFrameCount++;
      this.emaRms = this.emaAlpha * rms + (1 - this.emaAlpha) * this.emaRms;

      // Check for significant noise floor shift
      if (
        this.silenceFrameCount > this.calibrationFrames &&
        this.framesSinceCalibration > this.minFramesBetweenRecalibrations
      ) {
        const shift = Math.abs(this.emaRms - this.noiseFloor) / (this.noiseFloor || 0.001);
        if (shift > this.recalibrationThreshold) {
          this.noiseFloor = this.emaRms;
          this.gate.setThreshold(this.currentThreshold);
          this.framesSinceCalibration = 0;
        }
      }
    } else {
      this.silenceFrameCount = 0;
    }

    return this.gate.process(pcm16);
  }

  /** Force recalibration on next frames */
  recalibrate(): void {
    this.calibrated = false;
    this.rmsSamples = [];
    this.silenceFrameCount = 0;
    this.framesSinceCalibration = 0;
    this.gate.setThreshold(0);
    this.gate.reset();
  }

  /** Full reset (new recording session) */
  reset(): void {
    this.recalibrate();
    this.emaRms = 0;
    this.noiseFloor = 0;
  }

  /** Update sensitivity (1-5) */
  setSensitivity(sensitivity: number): void {
    this.headroom = SENSITIVITY_MAP[Math.max(1, Math.min(5, Math.round(sensitivity)))] ?? 2.0;
    if (this.calibrated) {
      this.gate.setThreshold(this.currentThreshold);
    }
  }

  private finishCalibration(): void {
    // Use median RMS as noise floor (more robust than mean against speech bursts)
    const sorted = [...this.rmsSamples].sort((a, b) => a - b);
    this.noiseFloor = sorted[Math.floor(sorted.length / 2)];
    this.emaRms = this.noiseFloor;

    // Set gate threshold
    const threshold = this.currentThreshold;
    this.gate.setThreshold(threshold);
    this.calibrated = true;
    this.framesSinceCalibration = 0;
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
