import { describe, it, expect } from 'vitest';
import { estimatePitchFromZCR, computeEnergy, computeBrightness, classifySpeaker, buildProfile, VoiceProfile } from '../pairProgramming';

/** Generate a simple sine wave as Float32Array */
function makeSineWave(frequency: number, sampleRate: number, durationSec: number): Float32Array {
  const samples = Math.floor(sampleRate * durationSec);
  const wave = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    wave[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.5;
  }
  return wave;
}

function makeSilence(samples: number): Float32Array {
  return new Float32Array(samples);
}

describe('computeEnergy', () => {
  it('returns 0 for silence', () => {
    expect(computeEnergy(makeSilence(480))).toBe(0);
  });

  it('returns positive value for audio', () => {
    const wave = makeSineWave(200, 16000, 0.1);
    expect(computeEnergy(wave)).toBeGreaterThan(0);
  });

  it('returns 0 for empty array', () => {
    expect(computeEnergy(new Float32Array(0))).toBe(0);
  });

  it('louder audio has higher energy', () => {
    const quiet = new Float32Array([0.1, -0.1, 0.1, -0.1]);
    const loud = new Float32Array([0.5, -0.5, 0.5, -0.5]);
    expect(computeEnergy(loud)).toBeGreaterThan(computeEnergy(quiet));
  });
});

describe('estimatePitchFromZCR', () => {
  it('returns 0 for silence', () => {
    expect(estimatePitchFromZCR(makeSilence(480), 16000)).toBe(0);
  });

  it('estimates higher pitch for higher frequency', () => {
    const low = makeSineWave(100, 16000, 0.5);
    const high = makeSineWave(400, 16000, 0.5);
    const pitchLow = estimatePitchFromZCR(low, 16000);
    const pitchHigh = estimatePitchFromZCR(high, 16000);
    expect(pitchHigh).toBeGreaterThan(pitchLow);
  });

  it('returns reasonable estimate for known frequency', () => {
    const wave = makeSineWave(200, 16000, 1.0);
    const pitch = estimatePitchFromZCR(wave, 16000);
    // ZCR-based pitch is approximate, allow 20% tolerance
    expect(pitch).toBeGreaterThan(160);
    expect(pitch).toBeLessThan(240);
  });
});

describe('computeBrightness', () => {
  it('returns 0 for silence', () => {
    expect(computeBrightness(makeSilence(480), 16000)).toBe(0);
  });

  it('returns positive for audio', () => {
    const wave = makeSineWave(300, 16000, 0.1);
    expect(computeBrightness(wave, 16000)).toBeGreaterThan(0);
  });
});

describe('buildProfile', () => {
  it('creates a profile from audio', () => {
    const wave = makeSineWave(200, 16000, 1.0);
    const profile = buildProfile('Alice', wave, 16000, 'editor');
    expect(profile.name).toBe('Alice');
    expect(profile.target).toBe('editor');
    expect(profile.avgEnergy).toBeGreaterThan(0);
    expect(profile.avgPitch).toBeGreaterThan(0);
  });
});

describe('classifySpeaker', () => {
  it('classifies audio closer to matching profile', () => {
    // Speaker A: low pitch (150 Hz)
    const profileA = buildProfile('Alice', makeSineWave(150, 16000, 1.0), 16000, 'editor');
    // Speaker B: high pitch (350 Hz)
    const profileB = buildProfile('Bob', makeSineWave(350, 16000, 1.0), 16000, 'chat');

    // Test with low-pitch audio → should match Alice
    const lowPitch = makeSineWave(160, 16000, 0.5);
    const resultLow = classifySpeaker(lowPitch, 16000, [profileA, profileB]);
    expect(resultLow.speaker).toBe('Alice');
    expect(resultLow.confidence).toBeGreaterThan(0);

    // Test with high-pitch audio → should match Bob
    const highPitch = makeSineWave(340, 16000, 0.5);
    const resultHigh = classifySpeaker(highPitch, 16000, [profileA, profileB]);
    expect(resultHigh.speaker).toBe('Bob');
  });

  it('returns confidence between 0 and 1', () => {
    const profileA = buildProfile('A', makeSineWave(200, 16000, 1.0), 16000);
    const profileB = buildProfile('B', makeSineWave(400, 16000, 1.0), 16000);
    const test = makeSineWave(300, 16000, 0.5);
    const result = classifySpeaker(test, 16000, [profileA, profileB]);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
