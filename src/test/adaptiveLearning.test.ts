import { describe, it, expect } from 'vitest';
import { AdaptiveLearningStore } from '../adaptiveLearning';

// This suite drives the real AdaptiveLearningStore.importJson path. It builds a
// minimal in-memory ExtensionContext (globalState backed by a Map) so the store
// runs exactly as it does in production; it does not stub importJson itself.
// The focus is malformed-input handling: importing a syntactically invalid JSON
// file must surface the store's controlled "Invalid correction database format"
// error, identical to a structurally-invalid (but syntactically valid) payload.
function makeStore(): AdaptiveLearningStore {
  const state = new Map<string, unknown>();
  const context = {
    globalState: {
      get: <T>(key: string): T | undefined => state.get(key) as T | undefined,
      update: async (key: string, value: unknown): Promise<void> => {
        state.set(key, value);
      },
    },
  };
  return new AdaptiveLearningStore(context as any);
}

describe('AdaptiveLearningStore.importJson — malformed input handling', () => {
  it('rejects syntactically malformed JSON with the controlled friendly error', async () => {
    const store = makeStore();
    // Not valid JSON at all — JSON.parse would throw a raw SyntaxError.
    await expect(store.importJson('{ this is not valid json')).rejects.toThrow(
      'Invalid correction database format',
    );
  });

  it('rejects empty / whitespace input with the controlled friendly error', async () => {
    const store = makeStore();
    await expect(store.importJson('')).rejects.toThrow('Invalid correction database format');
  });

  it('rejects structurally-invalid (but syntactically valid) JSON with the same error', async () => {
    const store = makeStore();
    // Valid JSON, wrong shape — exercises the existing structural guard so both
    // failure modes are proven to produce an identical message.
    await expect(store.importJson('{"version":999,"entries":[]}')).rejects.toThrow(
      'Invalid correction database format',
    );
  });

  it('imports a well-formed correction database and returns the count added', async () => {
    const store = makeStore();
    const now = new Date().toISOString();
    const payload = JSON.stringify({
      version: 1,
      entries: [
        {
          original: 'recieve',
          corrected: 'receive',
          occurrences: 3,
          firstSeen: now,
          lastSeen: now,
          strength: 0.8,
        },
      ],
      totalCorrections: 3,
      lastDecay: now,
    });
    const added = await store.importJson(payload);
    expect(added).toBe(1);
  });
});
