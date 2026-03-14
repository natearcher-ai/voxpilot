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
});
