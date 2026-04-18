import { describe, it, expect } from 'vitest';
import { resample, pcm16ToFloat32, float32ToPcm16 } from '../neuralNoiseReduction';

describe('pcm16ToFloat32', () => {
  it('converts silence to zeros', () => {
    const pcm = Buffer.alloc(4); // 2 samples of silence
    const result = pcm16ToFloat32(pcm);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
  });

  it('converts max positive to ~1.0', () => {
    const pcm = Buffer.alloc(2);
    pcm.writeInt16LE(32767, 0);
    const result = pcm16ToFloat32(pcm);
    expect(result[0]).toBeCloseTo(1.0, 3);
  });

  it('converts max negative to ~-1.0', () => {
    const pcm = Buffer.alloc(2);
    pcm.writeInt16LE(-32768, 0);
    const result = pcm16ToFloat32(pcm);
    expect(result[0]).toBeCloseTo(-1.0, 3);
  });
});

describe('float32ToPcm16', () => {
  it('converts zeros to silence', () => {
    const float32 = new Float32Array([0, 0]);
    const result = float32ToPcm16(float32);
    expect(result.length).toBe(4);
    expect(result.readInt16LE(0)).toBe(0);
    expect(result.readInt16LE(2)).toBe(0);
  });

  it('converts 1.0 to max positive', () => {
    const float32 = new Float32Array([1.0]);
    const result = float32ToPcm16(float32);
    expect(result.readInt16LE(0)).toBe(32767);
  });

  it('clamps values beyond -1 to 1', () => {
    const float32 = new Float32Array([1.5, -1.5]);
    const result = float32ToPcm16(float32);
    expect(result.readInt16LE(0)).toBe(32767);
    expect(result.readInt16LE(2)).toBe(-32767);
  });

  it('round-trips with pcm16ToFloat32', () => {
    const original = Buffer.alloc(6);
    original.writeInt16LE(1000, 0);
    original.writeInt16LE(-5000, 2);
    original.writeInt16LE(16000, 4);

    const float32 = pcm16ToFloat32(original);
    const roundTripped = float32ToPcm16(float32);

    expect(roundTripped.readInt16LE(0)).toBe(1000);
    expect(roundTripped.readInt16LE(2)).toBe(-5000);
    expect(roundTripped.readInt16LE(4)).toBe(16000);
  });
});

describe('resample', () => {
  it('returns same array when rates match', () => {
    const input = new Float32Array([1, 2, 3, 4]);
    const result = resample(input, 16000, 16000);
    expect(result).toBe(input);
  });

  it('upsamples (doubles length for 2x rate)', () => {
    const input = new Float32Array([0, 1, 0, -1]);
    const result = resample(input, 16000, 32000);
    expect(result.length).toBe(8);
  });

  it('downsamples (halves length for 0.5x rate)', () => {
    const input = new Float32Array([0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5]);
    const result = resample(input, 48000, 16000);
    // 8 samples at 48k → ~2.67 samples at 16k → 3 samples
    expect(result.length).toBe(3);
  });

  it('preserves DC offset', () => {
    const input = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const result = resample(input, 16000, 48000);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(0.5, 5);
    }
  });

  it('handles single sample', () => {
    const input = new Float32Array([0.7]);
    const result = resample(input, 16000, 48000);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toBeCloseTo(0.7, 5);
  });
});
