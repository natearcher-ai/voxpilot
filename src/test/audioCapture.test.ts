import { describe, it, expect } from 'vitest';
import { AudioCapture } from '../audioCapture';

describe('AudioCapture PCM validation', () => {
  it('should reject empty buffer', () => {
    const capture = new AudioCapture();
    const result = (capture as any).isLikelyPCM(Buffer.alloc(0));
    expect(result).toBe(false);
    capture.dispose();
  });

  it('should reject odd-length buffer', () => {
    const capture = new AudioCapture();
    const result = (capture as any).isLikelyPCM(Buffer.from([0x00, 0x01, 0x02]));
    expect(result).toBe(false);
    capture.dispose();
  });

  it('should reject buffer starting with 8+ bytes of printable ASCII text', () => {
    const capture = new AudioCapture();
    const result = (capture as any).isLikelyPCM(Buffer.from('ffmpeg version 6.0'));
    expect(result).toBe(false);
    capture.dispose();
  });

  it('should accept valid PCM silence data', () => {
    const capture = new AudioCapture();
    const result = (capture as any).isLikelyPCM(Buffer.alloc(960, 0));
    expect(result).toBe(true);
    capture.dispose();
  });

  it('should accept PCM data with binary content', () => {
    const capture = new AudioCapture();
    const buf = Buffer.from([0x00, 0x80, 0xff, 0x01, 0x10, 0x7f, 0x03, 0x90, 0xab, 0xcd]);
    const result = (capture as any).isLikelyPCM(buf);
    expect(result).toBe(true);
    capture.dispose();
  });

  it('should accept short valid PCM buffers under 8 bytes', () => {
    const capture = new AudioCapture();
    const result = (capture as any).isLikelyPCM(Buffer.from([0x00, 0x80]));
    expect(result).toBe(true);
    capture.dispose();
  });
});
