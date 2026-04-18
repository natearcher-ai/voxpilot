import { describe, it, expect } from 'vitest';
import { AdaptiveNoiseReduction } from '../adaptiveNoiseReduction';

/** Create a PCM 16-bit LE buffer with a constant amplitude */
function makePCM(amplitude: number, samples: number = 480): Buffer {
  const buf = Buffer.alloc(samples * 2);
  const value = Math.round(amplitude * 32767);
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(value, i * 2);
  }
  return buf;
}

/** Create a silent PCM buffer */
function makeSilence(samples: number = 480): Buffer {
  return Buffer.alloc(samples * 2);
}

describe('AdaptiveNoiseReduction', () => {
  it('starts uncalibrated with gate open (passes all audio)', () => {
    const anr = new AdaptiveNoiseReduction(3, 500, 30);
    expect(anr.isCalibrated).toBe(false);

    const audio = makePCM(0.01);
    const result = anr.process(audio);
    // During calibration, audio passes through unchanged
    expect(result).toBe(audio);
  });

  it('calibrates after collecting enough frames', () => {
    const anr = new AdaptiveNoiseReduction(3, 150, 30); // 5 frames to calibrate

    // Feed 5 low-noise frames
    for (let i = 0; i < 5; i++) {
      anr.process(makePCM(0.01));
    }

    expect(anr.isCalibrated).toBe(true);
    expect(anr.currentNoiseFloor).toBeGreaterThan(0);
    expect(anr.currentThreshold).toBeGreaterThan(anr.currentNoiseFloor);
  });

  it('gates low-level noise after calibration', () => {
    const anr = new AdaptiveNoiseReduction(3, 150, 30);

    // Calibrate with low noise
    for (let i = 0; i < 5; i++) {
      anr.process(makePCM(0.005));
    }
    expect(anr.isCalibrated).toBe(true);

    // Process noise at same level — should be gated (zeroed)
    const noise = makePCM(0.005);
    // Need to process enough frames for the gate to close (release frames)
    let gated = noise;
    for (let i = 0; i < 5; i++) {
      gated = anr.process(makePCM(0.005));
    }

    // Gated buffer should be all zeros
    const allZero = gated.every((b: number) => b === 0);
    expect(allZero).toBe(true);
  });

  it('passes speech-level audio after calibration', () => {
    const anr = new AdaptiveNoiseReduction(3, 150, 30);

    // Calibrate with low noise
    for (let i = 0; i < 5; i++) {
      anr.process(makePCM(0.005));
    }

    // Process loud audio (speech) — should pass through
    const speech = makePCM(0.3);
    // Process enough frames for gate to open (attack frames)
    let result = speech;
    for (let i = 0; i < 3; i++) {
      result = anr.process(makePCM(0.3));
    }

    const hasNonZero = result.some((b: number) => b !== 0);
    expect(hasNonZero).toBe(true);
  });

  it('reset clears calibration state', () => {
    const anr = new AdaptiveNoiseReduction(3, 150, 30);

    // Calibrate
    for (let i = 0; i < 5; i++) {
      anr.process(makePCM(0.01));
    }
    expect(anr.isCalibrated).toBe(true);

    anr.reset();
    expect(anr.isCalibrated).toBe(false);
    expect(anr.currentNoiseFloor).toBe(0);
  });

  it('recalibrate resets but preserves object', () => {
    const anr = new AdaptiveNoiseReduction(3, 150, 30);

    for (let i = 0; i < 5; i++) {
      anr.process(makePCM(0.01));
    }
    expect(anr.isCalibrated).toBe(true);

    anr.recalibrate();
    expect(anr.isCalibrated).toBe(false);

    // Can recalibrate with new noise level
    for (let i = 0; i < 5; i++) {
      anr.process(makePCM(0.05));
    }
    expect(anr.isCalibrated).toBe(true);
    expect(anr.currentNoiseFloor).toBeGreaterThan(0.01);
  });

  it('sensitivity affects threshold', () => {
    const aggressive = new AdaptiveNoiseReduction(1, 150, 30);
    const gentle = new AdaptiveNoiseReduction(5, 150, 30);

    // Calibrate both with same noise
    for (let i = 0; i < 5; i++) {
      aggressive.process(makePCM(0.01));
      gentle.process(makePCM(0.01));
    }

    // Aggressive should have higher threshold (gates more)
    expect(aggressive.currentThreshold).toBeGreaterThan(gentle.currentThreshold);
  });

  it('setSensitivity updates threshold dynamically', () => {
    const anr = new AdaptiveNoiseReduction(3, 150, 30);

    for (let i = 0; i < 5; i++) {
      anr.process(makePCM(0.01));
    }

    const thresholdBefore = anr.currentThreshold;
    anr.setSensitivity(1); // More aggressive
    expect(anr.currentThreshold).toBeGreaterThan(thresholdBefore);
  });

  it('handles silence gracefully', () => {
    const anr = new AdaptiveNoiseReduction(3, 150, 30);

    // Calibrate with silence
    for (let i = 0; i < 5; i++) {
      anr.process(makeSilence());
    }

    expect(anr.isCalibrated).toBe(true);
    expect(anr.currentNoiseFloor).toBe(0);
  });
});
