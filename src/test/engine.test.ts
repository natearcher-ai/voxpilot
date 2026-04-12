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
