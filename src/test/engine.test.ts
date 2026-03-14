import { describe, it, expect } from 'vitest';

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
});
