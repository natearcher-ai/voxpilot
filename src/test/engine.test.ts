import { describe, it, expect } from 'vitest';
import { Transcriber } from '../transcriber';

/**
 * Engine integration tests — verify the module structure and exports.
 * Full engine tests require VS Code extension host, so we test
 * the composable pieces (VAD, voice commands, noise gate, transcriber)
 * individually and verify engine wiring here.
 */
describe('Engine module', () => {
  it('should export VoxPilotEngine class', async () => {
    const mod = await import('../engine');
    expect(mod.VoxPilotEngine).toBeDefined();
    expect(typeof mod.VoxPilotEngine).toBe('function');
  });
});

describe('Extension module', () => {
  it('should export activate and deactivate functions', async () => {
    const mod = await import('../extension');
    expect(mod.activate).toBeDefined();
    expect(mod.deactivate).toBeDefined();
    expect(typeof mod.activate).toBe('function');
    expect(typeof mod.deactivate).toBe('function');
  });

  it('should not throw when calling deactivate()', async () => {
    const mod = await import('../extension');
    expect(() => mod.deactivate()).not.toThrow();
  });
});

describe('Transcriber error before load', () => {
  it('should throw Model not loaded for transcribe() before load()', async () => {
    const t = new Transcriber('moonshine-base', '/tmp/runtime', '/tmp/cache');
    const pcm = Buffer.alloc(32000);
    await expect(t.transcribe(pcm)).rejects.toThrow('Model not loaded');
  });

  it('should throw Model not loaded for transcribeStreaming() before load()', async () => {
    const t = new Transcriber('moonshine-base', '/tmp/runtime', '/tmp/cache');
    const pcm = Buffer.alloc(32000);
    const callbacks = { onPartial: () => {}, onFinal: () => {} };
    await expect(t.transcribeStreaming(pcm, callbacks)).rejects.toThrow('Model not loaded');
  });
});
