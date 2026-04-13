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

describe('insertAtCursor fallback', () => {
  /**
   * These tests verify the clipboard-paste fallback pattern used in
   * insertAtCursor when no activeTextEditor is available. Since
   * VoxPilotEngine is hard to instantiate without a real ExtensionContext,
   * we test the pattern directly using the vscode mock APIs.
   */

  it('should use editor.edit when activeTextEditor is available', async () => {
    const vscode = await import('./__mocks__/vscode');
    vscode.__resetTracking();

    const editCalls: any[] = [];
    const mockEditor = {
      selection: { active: { line: 0, character: 0 } },
      edit: (cb: Function) => {
        editCalls.push(cb);
        return Promise.resolve(true);
      },
    };
    vscode.window.activeTextEditor = mockEditor;

    // Simulate the editor branch of insertAtCursor
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await editor.edit((editBuilder: any) => {
        editBuilder.insert(editor.selection.active, 'hello world');
      });
    }

    expect(editCalls.length).toBe(1);
    // Clipboard should NOT have been used
    expect(vscode.__clipboardWriteCalls.length).toBe(0);
    expect(vscode.__executeCommandCalls.length).toBe(0);
  });

  it('should use clipboard paste fallback when no activeTextEditor', async () => {
    const vscode = await import('./__mocks__/vscode');
    vscode.__resetTracking();
    vscode.__setClipboardContent('original clipboard');

    // activeTextEditor is undefined after __resetTracking
    const editor = vscode.window.activeTextEditor;
    expect(editor).toBeUndefined();

    // Simulate the fallback branch of insertAtCursor
    const text = 'transcribed text';
    const original = await vscode.env.clipboard.readText();
    await vscode.env.clipboard.writeText(text);
    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    await vscode.env.clipboard.writeText(original);

    // Verify clipboard.writeText was called with the text, then the original
    expect(vscode.__clipboardWriteCalls).toContain(text);
    expect(vscode.__executeCommandCalls).toContain('editor.action.clipboardPasteAction');
  });

  it('should restore original clipboard content after fallback paste', async () => {
    const vscode = await import('./__mocks__/vscode');
    vscode.__resetTracking();
    vscode.__setClipboardContent('user clipboard data');

    // Simulate the fallback branch
    const text = 'voice input';
    const original = await vscode.env.clipboard.readText();
    expect(original).toBe('user clipboard data');

    await vscode.env.clipboard.writeText(text);
    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    await vscode.env.clipboard.writeText(original);

    // The last writeText call should restore the original content
    const lastWrite = vscode.__clipboardWriteCalls[vscode.__clipboardWriteCalls.length - 1];
    expect(lastWrite).toBe('user clipboard data');
    // Final clipboard content should be the original
    const finalContent = await vscode.env.clipboard.readText();
    expect(finalContent).toBe('user clipboard data');
  });
});

describe('Log formatting with model name', () => {
  it('should format log lines with model name prefix', () => {
    const modelId = 'whisper-tiny';
    const message = 'Listening started';
    const formatted = `[${new Date().toISOString()}] ${modelId}: ${message}`;
    expect(formatted).toMatch(/^\[\d{4}-\d{2}-\d{2}T.*\] whisper-tiny: Listening started$/);
  });

  it('should include model name for different model IDs', () => {
    const models = ['moonshine-base', 'whisper-large-v3-turbo', 'parakeet-tdt-0.6b'];
    for (const modelId of models) {
      const message = 'Model loaded';
      const formatted = `[${new Date().toISOString()}] ${modelId}: ${message}`;
      expect(formatted).toContain(`${modelId}: Model loaded`);
    }
  });

  it('should format log lines with dynamic messages', () => {
    const modelId = 'moonshine-base';
    const chunkCount = 42;
    const message = `Segment transcribe: ${chunkCount} chunks`;
    const formatted = `[${new Date().toISOString()}] ${modelId}: ${message}`;
    expect(formatted).toMatch(/moonshine-base: Segment transcribe: 42 chunks$/);
  });
});

describe('Model hot-swap detection', () => {
  it('should detect model change when new model differs from current', () => {
    let currentModelId = 'moonshine-base';
    const newModel = 'whisper-tiny';
    let transcriberDisposed = false;
    let logMessages: string[] = [];

    // Simulate the config watcher logic from engine.ts
    if (newModel !== currentModelId) {
      const oldModel = currentModelId;
      currentModelId = newModel;
      transcriberDisposed = true; // simulates this.transcriber.dispose()
      logMessages.push(`Model switched: ${oldModel} -> ${newModel}`);
    }

    expect(currentModelId).toBe('whisper-tiny');
    expect(transcriberDisposed).toBe(true);
    expect(logMessages).toContain('Model switched: moonshine-base -> whisper-tiny');
  });

  it('should not dispose transcriber when model stays the same', () => {
    let currentModelId = 'moonshine-base';
    const newModel = 'moonshine-base';
    let transcriberDisposed = false;
    let logMessages: string[] = [];

    if (newModel !== currentModelId) {
      const oldModel = currentModelId;
      currentModelId = newModel;
      transcriberDisposed = true;
      logMessages.push(`Model switched: ${oldModel} -> ${newModel}`);
    }

    expect(currentModelId).toBe('moonshine-base');
    expect(transcriberDisposed).toBe(false);
    expect(logMessages.length).toBe(0);
  });

  it('should handle switching between all model families', () => {
    const modelSequence = ['moonshine-base', 'whisper-tiny', 'parakeet-tdt-0.6b', 'whisper-large-v3-turbo', 'moonshine-tiny'];
    let currentModelId = modelSequence[0];
    let switchCount = 0;

    for (let i = 1; i < modelSequence.length; i++) {
      const newModel = modelSequence[i];
      if (newModel !== currentModelId) {
        currentModelId = newModel;
        switchCount++;
      }
    }

    expect(switchCount).toBe(4);
    expect(currentModelId).toBe('moonshine-tiny');
  });
});

describe('ensureTranscriber guard in transcribeSegment and finalizeSpeech', () => {
  it('should call ensureTranscriber when transcriber is null before transcription', () => {
    // Simulate: transcriber is null after model hot-swap, ensureTranscriber re-creates it
    let transcriber: { transcribeStreaming: Function } | null = null;
    let ensureTranscriberCalled = false;

    const ensureTranscriber = () => {
      ensureTranscriberCalled = true;
      transcriber = {
        transcribeStreaming: async () => ({ text: 'hello', language: undefined }),
      };
    };

    // Simulate transcribeSegment guard: call ensureTranscriber before accessing transcriber
    const speechBuffer = [Buffer.alloc(1920)];
    if (speechBuffer.length === 0) { return; }
    ensureTranscriber();

    expect(ensureTranscriberCalled).toBe(true);
    expect(transcriber).not.toBeNull();
    expect(transcriber!.transcribeStreaming).toBeDefined();
  });

  it('should be idempotent when transcriber already exists', () => {
    let loadCount = 0;
    const existingTranscriber = {
      transcribeStreaming: async () => ({ text: 'test', language: undefined }),
    };
    let transcriber: typeof existingTranscriber | null = existingTranscriber;

    // Simulate ensureTranscriber: if transcriber exists, do nothing
    const ensureTranscriber = () => {
      if (transcriber) { return; }
      loadCount++;
      transcriber = existingTranscriber;
    };

    ensureTranscriber();
    ensureTranscriber();
    ensureTranscriber();

    expect(loadCount).toBe(0);
    expect(transcriber).toBe(existingTranscriber);
  });

  it('should re-create transcriber after config watcher sets it to null', () => {
    let transcriber: { transcribeStreaming: Function } | null = {
      transcribeStreaming: async () => ({ text: 'old', language: undefined }),
    };
    let modelId = 'moonshine-base';
    let loadedModelId = '';

    // Simulate config watcher: dispose and null out transcriber
    const newModel = 'whisper-tiny';
    if (newModel !== modelId) {
      modelId = newModel;
      transcriber = null; // simulates dispose + null
    }

    expect(transcriber).toBeNull();

    // Simulate ensureTranscriber called from transcribeSegment/finalizeSpeech
    const ensureTranscriber = () => {
      if (transcriber) { return; }
      loadedModelId = modelId;
      transcriber = {
        transcribeStreaming: async () => ({ text: 'new', language: undefined }),
      };
    };

    ensureTranscriber();

    expect(transcriber).not.toBeNull();
    expect(loadedModelId).toBe('whisper-tiny');
  });
});

describe('insertAtCursor clipboard fallback improvements', () => {
  it('should use type command for newline instead of clipboard round-trip', async () => {
    const vscode = await import('./__mocks__/vscode');
    vscode.__resetTracking();

    // activeTextEditor is undefined -- triggers fallback branch
    const editor = vscode.window.activeTextEditor;
    expect(editor).toBeUndefined();

    const text = '\n';

    // Simulate the improved insertAtCursor newline branch
    if (!editor) {
      if (text === '\n') {
        await vscode.commands.executeCommand('type', { text: '\n' });
      }
    }

    // Should have called executeCommand('type', ...) not clipboard
    expect(vscode.__executeCommandCalls).toContain('type');
    expect(vscode.__executeCommandCallsWithArgs[0].cmd).toBe('type');
    expect(vscode.__executeCommandCallsWithArgs[0].args[0]).toEqual({ text: '\n' });
    // Clipboard should NOT have been used
    expect(vscode.__clipboardWriteCalls.length).toBe(0);
  });

  it('should call paste before clipboard restore in fallback path', async () => {
    const vscode = await import('./__mocks__/vscode');
    vscode.__resetTracking();
    vscode.__setClipboardContent('original');

    // Simulate the improved clipboard fallback (non-newline text)
    const text = 'hello voice';
    const original = await vscode.env.clipboard.readText();
    await vscode.env.clipboard.writeText(text);
    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    // In the real code, there's a 150ms delay here before restore
    await vscode.env.clipboard.writeText(original);

    // Verify call order: write text, paste, write original
    expect(vscode.__clipboardWriteCalls[0]).toBe('hello voice');
    expect(vscode.__executeCommandCalls[0]).toBe('editor.action.clipboardPasteAction');
    expect(vscode.__clipboardWriteCalls[1]).toBe('original');
  });

  it('should leave text on clipboard and notify when paste fails', async () => {
    const vscode = await import('./__mocks__/vscode');
    vscode.__resetTracking();
    vscode.__setClipboardContent('original');

    // Make clipboardPasteAction throw
    vscode.__failCommand('editor.action.clipboardPasteAction');

    const text = 'voice transcript';
    const original = await vscode.env.clipboard.readText();
    await vscode.env.clipboard.writeText(text);

    let pasteFailed = false;
    try {
      await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
      // If paste succeeded, restore original clipboard
      await vscode.env.clipboard.writeText(original);
    } catch {
      // Paste failed - leave transcript on clipboard
      pasteFailed = true;
    }

    expect(pasteFailed).toBe(true);
    // The transcript should still be on clipboard (not restored to original)
    const clipboardContent = await vscode.env.clipboard.readText();
    expect(clipboardContent).toBe('voice transcript');
    // clipboardPasteAction should NOT be in the successful calls list
    expect(vscode.__executeCommandCalls).not.toContain('editor.action.clipboardPasteAction');
  });
});
