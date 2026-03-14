import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceActivityDetector } from '../vad';

/** Helper: create a PCM 16-bit LE buffer with a constant amplitude */
function makePCM(amplitude: number, samples: number = 480): Buffer {
  const buf = Buffer.alloc(samples * 2);
  const val = Math.round(amplitude * 32767);
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(val, i * 2);
  }
  return buf;
}

/** Feed N identical frames and return the last result */
function feedFrames(vad: VoiceActivityDetector, amplitude: number, count: number) {
  let result: any;
  for (let i = 0; i < count; i++) {
    result = vad.process(makePCM(amplitude));
  }
  return result;
}

describe('VoiceActivityDetector', () => {
  let vad: VoiceActivityDetector;

  beforeEach(() => {
    // Default: sensitivity 0.5, silence timeout 1500ms, 30ms frames
    vad = new VoiceActivityDetector(0.5, 1500, 30);
  });

  it('should not detect speech during calibration phase', () => {
    // Calibration needs 30 frames
    for (let i = 0; i < 29; i++) {
      const result = vad.process(makePCM(0.001));
      expect(result.isSpeech).toBe(false);
      expect(result.speechStarted).toBe(false);
      expect(result.threshold).toBe(0);
    }
  });

  it('should complete calibration after 30 frames', () => {
    // Feed 30 calibration frames
    feedFrames(vad, 0.01, 30);
    // 31st frame is the first post-calibration frame — threshold should be set
    const result = vad.process(makePCM(0.01));
    expect(result.threshold).toBeGreaterThan(0);
  });

  it('should detect speech when amplitude exceeds threshold', () => {
    // Calibrate with quiet audio
    feedFrames(vad, 0.005, 30);

    // Feed loud frames — need 3 consecutive for speech onset
    const r1 = vad.process(makePCM(0.3));
    const r2 = vad.process(makePCM(0.3));
    const r3 = vad.process(makePCM(0.3));

    expect(r3.isSpeech).toBe(true);
    expect(r3.speechStarted).toBe(true);
  });

  it('should detect speech end after silence timeout', () => {
    // Calibrate
    feedFrames(vad, 0.005, 30);

    // Start speech (3 frames onset)
    feedFrames(vad, 0.3, 5);

    // Silence timeout = 1500ms / 30ms = 50 frames
    let speechEnded = false;
    for (let i = 0; i < 55; i++) {
      const result = vad.process(makePCM(0.001));
      if (result.speechEnded) {
        speechEnded = true;
        break;
      }
    }
    expect(speechEnded).toBe(true);
  });

  it('should not trigger on silence after calibration', () => {
    // Calibrate with quiet audio
    feedFrames(vad, 0.005, 30);

    // Continue with same quiet level
    for (let i = 0; i < 20; i++) {
      const result = vad.process(makePCM(0.005));
      expect(result.isSpeech).toBe(false);
      expect(result.speechStarted).toBe(false);
    }
  });

  it('should respect sensitivity — high sensitivity triggers easier', () => {
    const highSens = new VoiceActivityDetector(0.9, 1500, 30);
    const lowSens = new VoiceActivityDetector(0.1, 1500, 30);

    // Calibrate both with same quiet audio
    // noise floor = 0.005
    // high sens multiplier = 1.3 + 0.1*2 = 1.5 → threshold ~0.0075
    // low sens multiplier  = 1.3 + 0.9*2 = 3.1 → threshold ~0.0155
    feedFrames(highSens, 0.005, 30);
    feedFrames(lowSens, 0.005, 30);

    // Amplitude 0.012: above high-sens threshold (0.0075) but below low-sens (0.0155)
    feedFrames(highSens, 0.012, 5);
    feedFrames(lowSens, 0.012, 5);

    const highResult = highSens.process(makePCM(0.012));
    const lowResult = lowSens.process(makePCM(0.012));

    // High sensitivity should be speaking, low should not
    expect(highResult.isSpeech).toBe(true);
    expect(lowResult.isSpeech).toBe(false);
  });

  it('should reset state correctly', () => {
    // Calibrate and start speech
    feedFrames(vad, 0.005, 30);
    feedFrames(vad, 0.3, 5);

    vad.reset();

    // After reset, should be back in calibration
    const result = vad.process(makePCM(0.3));
    expect(result.isSpeech).toBe(false);
    expect(result.threshold).toBe(0);
  });

  it('should handle empty buffer gracefully', () => {
    const result = vad.process(Buffer.alloc(0));
    expect(result.isSpeech).toBe(false);
    expect(result.rms).toBe(0);
  });

  it('should adapt noise floor during silence', () => {
    // Calibrate with moderate noise
    feedFrames(vad, 0.01, 30);

    // Get initial threshold
    let result = vad.process(makePCM(0.001));
    const initialThreshold = result.threshold;

    // Feed many quiet frames — noise floor should adapt down
    feedFrames(vad, 0.001, 200);
    result = vad.process(makePCM(0.001));

    expect(result.threshold).toBeLessThan(initialThreshold);
  });

  it('should enforce minimum threshold', () => {
    // Calibrate with digital silence
    feedFrames(vad, 0, 30);

    const result = vad.process(makePCM(0));
    // minThreshold is 0.002
    expect(result.threshold).toBeGreaterThanOrEqual(0.002);
  });
});
