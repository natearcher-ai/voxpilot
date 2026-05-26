import { describe, it, expect } from 'vitest';
import { resample, pcm16ToFloat32, float32ToPcm16, NeuralNoiseReduction } from '../neuralNoiseReduction';

describe('resample', () => {
  it('returns same array when rates are equal', () => {
    const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const output = resample(input, 16000, 16000);
    expect(output).toBe(input);
  });

  it('upsamples correctly (doubles length for 2x rate)', () => {
    const input = new Float32Array([0.0, 1.0]);
    const output = resample(input, 16000, 32000);
    expect(output.length).toBe(4); // doubled
    expect(output[0]).toBeCloseTo(0.0);
    expect(output[output.length - 1]).toBeCloseTo(1.0, 0);
  });

  it('downsamples correctly (halves length for 0.5x rate)', () => {
    const input = new Float32Array([0.0, 0.25, 0.5, 0.75]);
    const output = resample(input, 32000, 16000);
    expect(output.length).toBe(2);
  });

  it('handles empty input', () => {
    const input = new Float32Array(0);
    const output = resample(input, 16000, 48000);
    expect(output.length).toBe(0);
  });
});

describe('pcm16ToFloat32', () => {
  it('converts silence (zeros) correctly', () => {
    const pcm = Buffer.alloc(4); // 2 samples of silence
    const result = pcm16ToFloat32(pcm);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
  });

  it('converts max positive sample', () => {
    const pcm = Buffer.alloc(2);
    pcm.writeInt16LE(32767, 0); // max positive
    const result = pcm16ToFloat32(pcm);
    expect(result[0]).toBeCloseTo(1.0, 3);
  });

  it('converts max negative sample', () => {
    const pcm = Buffer.alloc(2);
    pcm.writeInt16LE(-32768, 0); // max negative
    const result = pcm16ToFloat32(pcm);
    expect(result[0]).toBe(-1.0);
  });
});

describe('float32ToPcm16', () => {
  it('converts zeros correctly', () => {
    const float = new Float32Array([0, 0]);
    const result = float32ToPcm16(float);
    expect(result.length).toBe(4);
    expect(result.readInt16LE(0)).toBe(0);
    expect(result.readInt16LE(2)).toBe(0);
  });

  it('clamps values above 1.0', () => {
    const float = new Float32Array([1.5]);
    const result = float32ToPcm16(float);
    expect(result.readInt16LE(0)).toBe(32767);
  });

  it('clamps values below -1.0', () => {
    const float = new Float32Array([-1.5]);
    const result = float32ToPcm16(float);
    expect(result.readInt16LE(0)).toBe(-32767);
  });

  it('round-trips with pcm16ToFloat32', () => {
    const original = Buffer.alloc(6);
    original.writeInt16LE(1000, 0);
    original.writeInt16LE(-5000, 2);
    original.writeInt16LE(15000, 4);

    const floats = pcm16ToFloat32(original);
    const roundTripped = float32ToPcm16(floats);

    expect(roundTripped.readInt16LE(0)).toBe(1000);
    expect(roundTripped.readInt16LE(2)).toBe(-5000);
    expect(roundTripped.readInt16LE(4)).toBe(15000);
  });
});

describe('NeuralNoiseReduction', () => {
  it('passes through audio when not loaded', () => {
    const nnr = new NeuralNoiseReduction();
    const input = Buffer.alloc(1920); // 960 samples
    input.writeInt16LE(1000, 0);

    const output = nnr.process(input);
    expect(output).toBe(input); // should return same buffer
  });

  it('isLoaded is false before initialize', () => {
    const nnr = new NeuralNoiseReduction();
    expect(nnr.isLoaded).toBe(false);
  });

  it('isLoaded is true after initialize', () => {
    const nnr = new NeuralNoiseReduction();
    const mockModule = {
      createState: () => 1,
      destroyState: () => {},
      processFrame: (_state: number, buffer: Float32Array) => {
        // Pass through (no denoising)
        return 0.5;
      },
    };
    nnr.initialize(mockModule);
    expect(nnr.isLoaded).toBe(true);
  });

  it('dispose cleans up state', () => {
    const nnr = new NeuralNoiseReduction();
    const destroyFn = vi.fn();
    const mockModule = {
      createState: () => 42,
      destroyState: destroyFn,
      processFrame: () => 0,
    };
    nnr.initialize(mockModule);
    nnr.dispose();

    expect(destroyFn).toHaveBeenCalledWith(42);
    expect(nnr.isLoaded).toBe(false);
  });

  it('reset recreates state', () => {
    const createFn = vi.fn().mockReturnValue(1);
    const destroyFn = vi.fn();
    const nnr = new NeuralNoiseReduction();
    nnr.initialize({
      createState: createFn,
      destroyState: destroyFn,
      processFrame: () => 0,
    });

    expect(createFn).toHaveBeenCalledTimes(1);

    nnr.reset();

    expect(destroyFn).toHaveBeenCalledTimes(1);
    expect(createFn).toHaveBeenCalledTimes(2);
  });
});

// Need to import vi for mocks
import { vi } from 'vitest';
