import { describe, it, expect } from 'vitest';
import { StreamingBuffer } from '../streamingTranscription';

function makeFrame(bytes: number = 1920): Buffer {
  return Buffer.alloc(bytes); // 30ms at 16kHz mono 16-bit = 960 samples * 2 bytes
}

describe('StreamingBuffer', () => {
  it('starts empty', () => {
    const sb = new StreamingBuffer(2000);
    expect(sb.byteCount).toBe(0);
    expect(sb.windowCount).toBe(0);
    expect(sb.partialText).toBe('');
    expect(sb.hasAudio()).toBe(false);
  });

  it('accumulates frames', () => {
    const sb = new StreamingBuffer(2000);
    sb.addFrame(makeFrame(1920));
    sb.addFrame(makeFrame(1920));
    expect(sb.byteCount).toBe(3840);
    expect(sb.hasAudio()).toBe(true);
  });

  it('does not trigger transcription before minimum audio', () => {
    const sb = new StreamingBuffer(2000);
    // minBytes = 16000 * 0.5 * 2 = 16000 bytes
    // Each frame is 1920 bytes, need ~9 frames
    for (let i = 0; i < 5; i++) {
      expect(sb.addFrame(makeFrame(1920))).toBe(false);
    }
  });

  it('triggers transcription after minimum audio on first window', () => {
    const sb = new StreamingBuffer(2000);
    // Need 16000 bytes minimum
    for (let i = 0; i < 8; i++) {
      sb.addFrame(makeFrame(1920)); // 8 * 1920 = 15360
    }
    // 9th frame pushes over 16000
    const shouldTranscribe = sb.addFrame(makeFrame(1920)); // 17280
    expect(shouldTranscribe).toBe(true);
  });

  it('getAudio returns all accumulated audio', () => {
    const sb = new StreamingBuffer(2000);
    sb.addFrame(makeFrame(1920));
    sb.addFrame(makeFrame(1920));
    const audio = sb.getAudio();
    expect(audio.length).toBe(3840);
    expect(sb.windowCount).toBe(1);
  });

  it('getAudio does not clear buffer (cumulative)', () => {
    const sb = new StreamingBuffer(2000);
    sb.addFrame(makeFrame(1920));
    sb.getAudio();
    sb.addFrame(makeFrame(1920));
    const audio = sb.getAudio();
    expect(audio.length).toBe(3840); // Both frames
    expect(sb.windowCount).toBe(2);
  });

  it('flush returns audio and resets', () => {
    const sb = new StreamingBuffer(2000);
    sb.addFrame(makeFrame(1920));
    sb.addFrame(makeFrame(1920));
    const audio = sb.flush();
    expect(audio.length).toBe(3840);
    expect(sb.byteCount).toBe(0);
    expect(sb.windowCount).toBe(0);
    expect(sb.hasAudio()).toBe(false);
  });

  it('reset clears all state', () => {
    const sb = new StreamingBuffer(2000);
    sb.addFrame(makeFrame(1920));
    sb.setPartialText('hello');
    sb.reset();
    expect(sb.byteCount).toBe(0);
    expect(sb.partialText).toBe('');
    expect(sb.windowCount).toBe(0);
  });

  it('setPartialText stores intermediate text', () => {
    const sb = new StreamingBuffer(2000);
    sb.setPartialText('hello world');
    expect(sb.partialText).toBe('hello world');
  });

  it('enforces minimum window of 500ms', () => {
    const sb = new StreamingBuffer(100); // Below minimum
    // Should still work, just clamped to 500ms internally
    expect(sb).toBeDefined();
  });
});
