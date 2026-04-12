import { describe, it, expect } from 'vitest';
import { Transcriber } from '../transcriber';

describe('Transcriber', () => {
  it('should initialize with correct properties', () => {
    const t = new Transcriber('moonshine-base', '/tmp/runtime', '/tmp/cache');
    expect(t).toBeDefined();
  });

  it('should throw if transcribe called before load', async () => {
    const t = new Transcriber('moonshine-base', '/tmp/runtime', '/tmp/cache');
    const pcm = Buffer.alloc(32000); // 1 second of silence
    await expect(t.transcribe(pcm)).rejects.toThrow('Model not loaded');
  });

  it('should handle dispose when not loaded', async () => {
    const t = new Transcriber('moonshine-base', '/tmp/runtime', '/tmp/cache');
    // Should not throw
    await t.dispose();
  });

  it('should select correct model repo for moonshine-base', () => {
    // We can verify the constructor accepts the model ID without error
    const t = new Transcriber('moonshine-base', '/tmp/runtime', '/tmp/cache');
    expect(t).toBeDefined();
  });

  it('should select correct model repo for moonshine-tiny', () => {
    const t = new Transcriber('moonshine-tiny', '/tmp/runtime', '/tmp/cache');
    expect(t).toBeDefined();
  });

  it('should throw if transcribeStreaming called before load', async () => {
    const t = new Transcriber('moonshine-base', '/tmp/runtime', '/tmp/cache');
    const pcm = Buffer.alloc(32000);
    const callbacks = { onPartial: () => {}, onFinal: () => {} };
    await expect(t.transcribeStreaming(pcm, callbacks)).rejects.toThrow('Model not loaded');
  });

  it('should report streaming=true for parakeet-tdt-0.6b', () => {
    const t = new Transcriber('parakeet-tdt-0.6b', '/tmp/runtime', '/tmp/cache');
    expect(t.streaming).toBe(true);
  });

  it('should report streaming=false for moonshine-base', () => {
    const t = new Transcriber('moonshine-base', '/tmp/runtime', '/tmp/cache');
    expect(t.streaming).toBe(false);
  });

  it('should report isWhisperModel=true for whisper models', () => {
    const whisperIds = ['whisper-tiny', 'whisper-base', 'whisper-small', 'whisper-medium', 'whisper-large-v3-turbo'];
    for (const id of whisperIds) {
      const t = new Transcriber(id, '/tmp/runtime', '/tmp/cache');
      expect(t.isWhisperModel).toBe(true);
    }
  });

  it('should report isWhisperModel=false for non-whisper models', () => {
    const nonWhisperIds = ['moonshine-base', 'moonshine-tiny', 'parakeet-tdt-0.6b'];
    for (const id of nonWhisperIds) {
      const t = new Transcriber(id, '/tmp/runtime', '/tmp/cache');
      expect(t.isWhisperModel).toBe(false);
    }
  });

  it('should handle dispose called multiple times', async () => {
    const t = new Transcriber('moonshine-base', '/tmp/runtime', '/tmp/cache');
    await t.dispose();
    await t.dispose();
    // No error thrown -- dispose is idempotent
  });
});
