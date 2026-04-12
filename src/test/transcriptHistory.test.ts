import { describe, it, expect } from 'vitest';
import { TranscriptHistory } from '../transcriptHistory';

function createMockContext() {
  const state: Record<string, any> = {};
  return {
    globalState: {
      get: (key: string, defaultValue?: any) => state[key] ?? defaultValue,
      update: (key: string, value: any) => { state[key] = value; return Promise.resolve(); },
    },
  } as any;
}

describe('TranscriptHistory', () => {
  it('should truncate entries exceeding MAX_ENTRY_LENGTH', () => {
    const ctx = createMockContext();
    const history = new TranscriptHistory(ctx);
    const longText = 'a'.repeat(15000);
    history.add(longText);
    const entries = history.getAll();
    expect(entries[0].text.length).toBeLessThanOrEqual(10003); // 10000 + '...'
    expect(entries[0].text.endsWith('...')).toBe(true);
  });

  it('should not truncate entries under MAX_ENTRY_LENGTH', () => {
    const ctx = createMockContext();
    const history = new TranscriptHistory(ctx);
    history.add('short text');
    const entries = history.getAll();
    expect(entries[0].text).toBe('short text');
  });

  it('should cap entries at 10', () => {
    const ctx = createMockContext();
    const history = new TranscriptHistory(ctx);
    for (let i = 0; i < 15; i++) {
      history.add(`entry ${i}`);
    }
    expect(history.getAll().length).toBe(10);
  });
});
