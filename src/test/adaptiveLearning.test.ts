import { describe, it, expect } from 'vitest';
import { AdaptiveLearningStore, showAdaptiveLearningPanel } from '../adaptiveLearning';
import * as vscode from './__mocks__/vscode';

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

  it('rejects a syntactically/top-level-valid payload that contains a malformed entry', async () => {
    const store = makeStore();
    // Valid JSON, correct version, entries is an array — but the single entry is
    // an empty object, so entry.original is undefined. Before the per-entry guard
    // the merge loop did `entry.original.toLowerCase()` and leaked a raw
    // `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`.
    await expect(store.importJson('{"version":1,"entries":[{}]}')).rejects.toThrow(
      'Invalid correction database format',
    );
  });

  it('rejects an entry whose original/corrected fields are non-strings', async () => {
    const store = makeStore();
    // original is a number: `entry.original.toLowerCase` is not a function — a
    // different raw TypeError shape that must also map to the friendly error.
    const payload = JSON.stringify({
      version: 1,
      entries: [{ original: 42, corrected: 'x', occurrences: 1 }],
      totalCorrections: 1,
      lastDecay: new Date().toISOString(),
    });
    await expect(store.importJson(payload)).rejects.toThrow('Invalid correction database format');
  });

  it('does not import any entries when one entry in the batch is malformed', async () => {
    const store = makeStore();
    // A batch with one valid and one malformed entry must be rejected wholesale,
    // leaving the store untouched (no partial merge before the throw).
    const now = new Date().toISOString();
    const payload = JSON.stringify({
      version: 1,
      entries: [
        { original: 'recieve', corrected: 'receive', occurrences: 2, firstSeen: now, lastSeen: now, strength: 0.7 },
        {},
      ],
      totalCorrections: 2,
      lastDecay: now,
    });
    await expect(store.importJson(payload)).rejects.toThrow('Invalid correction database format');
    // The valid entry must NOT have been merged before the malformed one was hit.
    expect(store.getStats().totalEntries).toBe(0);
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

// This suite drives the REAL "Import corrections" command path in
// showAdaptiveLearningPanel. It mutates the shared in-memory vscode mock's
// dialog/fs/quickpick surface at runtime (restoring it afterwards) so the
// command handler executes exactly as in production. The focus is delivery: a
// failing import must be routed through vscode.window.showErrorMessage as a
// graceful toast, not propagated as an unhandled command-failure rejection
// (matching the offlineModelHub import command's precedent).
describe('showAdaptiveLearningPanel — Import corrections error delivery', () => {
  it('routes an import failure through showErrorMessage instead of throwing', async () => {
    const store = makeStore();

    const win = vscode.window as any;
    const ws = vscode.workspace as any;
    const saved = {
      showQuickPick: win.showQuickPick,
      showOpenDialog: win.showOpenDialog,
      showInformationMessage: win.showInformationMessage,
      showErrorMessage: win.showErrorMessage,
      fs: ws.fs,
    };

    const errorMessages: string[] = [];
    const infoMessages: string[] = [];
    try {
      win.showQuickPick = async () => ({
        label: '$(import) Import corrections',
        description: 'Load from file',
      });
      win.showOpenDialog = async () => [vscode.Uri.file('/tmp/voxpilot-corrections.json')];
      // A syntactically malformed file — importJson rejects with the friendly
      // 'Invalid correction database format' error.
      ws.fs = {
        readFile: async () => Buffer.from('{ this is not valid json', 'utf-8'),
        writeFile: async () => {},
      };
      win.showErrorMessage = async (msg: string) => {
        errorMessages.push(msg);
        return undefined;
      };
      win.showInformationMessage = async (msg: string) => {
        infoMessages.push(msg);
        return undefined;
      };

      // Must resolve (not reject): the handler is expected to catch.
      await expect(showAdaptiveLearningPanel(store)).resolves.toBeUndefined();

      // The failure must have been surfaced as a graceful error toast...
      expect(errorMessages.length).toBe(1);
      expect(errorMessages[0]).toContain('Invalid correction database format');
      // ...and the success message must NOT have been shown.
      expect(infoMessages.some(m => m.includes('Imported'))).toBe(false);
    } finally {
      win.showQuickPick = saved.showQuickPick;
      win.showOpenDialog = saved.showOpenDialog;
      win.showInformationMessage = saved.showInformationMessage;
      win.showErrorMessage = saved.showErrorMessage;
      ws.fs = saved.fs;
    }
  });
});
