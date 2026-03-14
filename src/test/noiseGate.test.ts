import { describe, it, expect, beforeEach } from 'vitest';
import { NoiseGate } from '../noiseGate';

/** Helper: create a PCM 16-bit LE buffer with a constant amplitude */
function makePCM(amplitude: number, samples: number = 480): Buffer {
  const buf = Buffer.alloc(samples * 2);
  const val = Math.round(amplitude * 32767);
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(val, i * 2);
  }
  return buf;
}

describe('NoiseGate', () => {
  it('should pass all audio when threshold is 0 (disabled)', () => {
    const gate = new NoiseGate(0);
    const frame = makePCM(0.001);
    const result = gate.process(frame);
    expect(result).toBe(frame); // Same reference — no processing
  });

  it('should gate (zero out) frames below threshold', () => {
    const gate = new NoiseGate(0.05, 0, 0, 30); // instant attack/release
    // Quiet frame below threshold
    const quiet = makePCM(0.01);
    const result = gate.process(quiet);

    // Result should be all zeros
    const allZero = Buffer.alloc(quiet.length);
    expect(result.equals(allZero)).toBe(true);
  });

  it('should pass frames above threshold', () => {
    // attackMs=0 won't work because Math.max(1, ...) ensures at least 1 frame
    // Use attackMs=30 (1 frame at 30ms frame duration)
    const gate = new NoiseGate(0.01, 30, 50, 30);

    // First loud frame opens the gate (attack = 1 frame)
    const loud = makePCM(0.5);
    const result = gate.process(loud);
    expect(result).toBe(loud);
    expect(gate.isOpen).toBe(true);
  });

  it('should respect attack time', () => {
    // Attack = 2 frames (60ms / 30ms)
    const gate = new NoiseGate(0.01, 60, 50, 30);

    const loud = makePCM(0.5);

    // First frame: not yet open
    gate.process(loud);
    expect(gate.isOpen).toBe(false);

    // Second frame: opens
    gate.process(loud);
    expect(gate.isOpen).toBe(true);
  });

  it('should respect release time', () => {
    // Release = 2 frames (60ms / 30ms)
    const gate = new NoiseGate(0.01, 30, 60, 30);

    // Open the gate
    gate.process(makePCM(0.5));
    expect(gate.isOpen).toBe(true);

    // First quiet frame: still open
    gate.process(makePCM(0.001));
    expect(gate.isOpen).toBe(true);

    // Second quiet frame: closes
    gate.process(makePCM(0.001));
    expect(gate.isOpen).toBe(false);
  });

  it('should reset state', () => {
    const gate = new NoiseGate(0.01, 30, 50, 30);

    // Open the gate
    gate.process(makePCM(0.5));
    expect(gate.isOpen).toBe(true);

    gate.reset();
    expect(gate.isOpen).toBe(false);
  });

  it('should allow threshold to be updated', () => {
    const gate = new NoiseGate(0.5); // Very high threshold

    // Moderate audio — gated
    const frame = makePCM(0.1);
    const result = gate.process(frame);
    const allZero = Buffer.alloc(frame.length);
    expect(result.equals(allZero)).toBe(true);

    // Lower threshold — should pass
    gate.setThreshold(0.01);
    gate.reset();
    const loud = makePCM(0.1);
    gate.process(loud); // attack frame
    const result2 = gate.process(loud);
    expect(result2).toBe(loud);
  });

  it('should clamp threshold to 0-1 range', () => {
    const gate = new NoiseGate(-0.5);
    // Negative threshold clamped to 0 = disabled, should pass through
    const frame = makePCM(0.001);
    expect(gate.process(frame)).toBe(frame);
  });

  it('should handle empty buffer', () => {
    const gate = new NoiseGate(0.05);
    const empty = Buffer.alloc(0);
    const result = gate.process(empty);
    // RMS of empty = 0, below threshold, should return zeroed buffer
    expect(result.length).toBe(0);
  });
});
