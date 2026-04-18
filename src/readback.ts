/**
 * Text-to-speech readback — hear your transcription read back for verification.
 *
 * After transcription completes, optionally read the result aloud so the user
 * can verify accuracy without reading the screen. Especially useful for:
 *   - Accessibility (screen reader users)
 *   - Hands-free workflows
 *   - Catching transcription errors before inserting
 *
 * Uses VS Code's built-in speech synthesis when available, or falls back
 * to the Web Speech API via a lightweight webview.
 *
 * Modes:
 *   - "off" — no readback (default)
 *   - "always" — read back every transcription
 *   - "on-error" — read back only when confidence is low
 *   - "on-demand" — add a "Read Back" button to the notification
 *
 * Enable via `voxpilot.readback` setting (default: "off").
 * Voice selection via `voxpilot.readbackVoice` (default: system default).
 * Speed via `voxpilot.readbackRate` (0.5-2.0, default: 1.2).
 */

import * as vscode from 'vscode';

export type ReadbackMode = 'off' | 'always' | 'on-error' | 'on-demand';

export interface ReadbackOptions {
  /** Text to read aloud */
  text: string;
  /** Speech rate (0.5-2.0) */
  rate?: number;
  /** Voice name (platform-dependent) */
  voice?: string;
  /** Callback when readback completes */
  onComplete?: () => void;
  /** Callback when readback is cancelled */
  onCancel?: () => void;
}

/**
 * Manages text-to-speech readback of transcriptions.
 * Uses a hidden webview panel with the Web Speech API for cross-platform TTS.
 */
export class ReadbackManager {
  private panel: vscode.WebviewPanel | null = null;
  private _isPlaying = false;
  private _mode: ReadbackMode;
  private _rate: number;
  private _voice: string;

  constructor() {
    const config = vscode.workspace.getConfiguration('voxpilot');
    this._mode = config.get<ReadbackMode>('readback', 'off');
    this._rate = config.get<number>('readbackRate', 1.2);
    this._voice = config.get<string>('readbackVoice', '');
  }

  get mode(): ReadbackMode { return this._mode; }
  get isPlaying(): boolean { return this._isPlaying; }
  get rate(): number { return this._rate; }

  /** Update settings from VS Code config */
  reload(): void {
    const config = vscode.workspace.getConfiguration('voxpilot');
    this._mode = config.get<ReadbackMode>('readback', 'off');
    this._rate = config.get<number>('readbackRate', 1.2);
    this._voice = config.get<string>('readbackVoice', '');
  }

  /**
   * Check if readback should be triggered for this transcription.
   */
  shouldReadBack(confidence?: number): boolean {
    switch (this._mode) {
      case 'off': return false;
      case 'always': return true;
      case 'on-error': return (confidence ?? 1.0) < 0.7;
      case 'on-demand': return false; // Triggered manually via button
      default: return false;
    }
  }

  /**
   * Read text aloud using Web Speech API via webview.
   */
  async speak(options: ReadbackOptions): Promise<void> {
    if (this._isPlaying) {
      this.stop();
    }

    const { text, rate, voice, onComplete, onCancel } = options;
    const speechRate = Math.max(0.5, Math.min(2.0, rate ?? this._rate));
    const speechVoice = voice ?? this._voice;

    this._isPlaying = true;

    // Create or reuse hidden webview panel for TTS
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'voxpilot-readback',
        'VoxPilot Readback',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true },
      );

      this.panel.onDidDispose(() => {
        this.panel = null;
        this._isPlaying = false;
      });

      // Listen for messages from webview
      this.panel.webview.onDidReceiveMessage((msg: { type: string }) => {
        if (msg.type === 'ended') {
          this._isPlaying = false;
          onComplete?.();
        } else if (msg.type === 'cancelled') {
          this._isPlaying = false;
          onCancel?.();
        }
      });
    }

    // Set webview HTML with speech synthesis
    this.panel.webview.html = this.getWebviewHtml(text, speechRate, speechVoice);
  }

  /** Stop current readback */
  stop(): void {
    if (this.panel) {
      this.panel.webview.postMessage({ type: 'stop' });
    }
    this._isPlaying = false;
  }

  /** Dispose the webview panel */
  dispose(): void {
    this.stop();
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }

  private getWebviewHtml(text: string, rate: number, voice: string): string {
    const escapedText = text.replace(/'/g, "\\'").replace(/\n/g, ' ');
    const voiceSelector = voice
      ? `const voices = speechSynthesis.getVoices();
         const selected = voices.find(v => v.name.includes('${voice.replace(/'/g, "\\'")}'));
         if (selected) utterance.voice = selected;`
      : '';

    return `<!DOCTYPE html>
<html><body>
<script>
  const vscode = acquireVsCodeApi();
  const utterance = new SpeechSynthesisUtterance('${escapedText}');
  utterance.rate = ${rate};
  ${voiceSelector}
  utterance.onend = () => vscode.postMessage({ type: 'ended' });
  utterance.onerror = () => vscode.postMessage({ type: 'cancelled' });
  speechSynthesis.speak(utterance);

  window.addEventListener('message', (e) => {
    if (e.data.type === 'stop') {
      speechSynthesis.cancel();
      vscode.postMessage({ type: 'cancelled' });
    }
  });
</script>
</body></html>`;
  }
}

/**
 * Format readback text — clean up for natural speech.
 * Expands abbreviations, adds pauses at punctuation, etc.
 */
export function formatForReadback(text: string): string {
  let result = text;

  // Expand common code abbreviations for natural speech
  const expansions: Array<[RegExp, string]> = [
    [/\bfn\b/gi, 'function'],
    [/\bvar\b/gi, 'variable'],
    [/\bconst\b/gi, 'constant'],
    [/\bparam\b/gi, 'parameter'],
    [/\bargs\b/gi, 'arguments'],
    [/\bretval\b/gi, 'return value'],
    [/\berr\b/gi, 'error'],
    [/\bmsg\b/gi, 'message'],
    [/\bctx\b/gi, 'context'],
    [/\breq\b/gi, 'request'],
    [/\bres\b/gi, 'response'],
  ];

  for (const [pattern, expansion] of expansions) {
    result = result.replace(pattern, expansion);
  }

  // Add slight pauses at code boundaries
  result = result.replace(/\./g, '. ');
  result = result.replace(/;/g, '; ');

  return result.trim();
}
