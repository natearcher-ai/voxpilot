/**
 * Live rewriting zone — show partial transcript with a visual indicator
 * that updates in real-time as recognition improves.
 *
 * When streaming transcription is active, the "live zone" shows the current
 * partial result with a dotted underline decoration. As the ASR model refines
 * its output, the text in the zone updates in place rather than appending.
 *
 * Once speech ends and final transcription is delivered, the live zone
 * decoration is removed and the final text replaces the partial.
 *
 * This gives users immediate visual feedback and reduces the jarring
 * experience of text appearing all at once after silence.
 *
 * Enable via `voxpilot.liveRewriting` setting (default: true when streaming is on).
 */

import * as vscode from 'vscode';

/** Lazy-initialized decoration type for the live rewriting zone */
let _liveZoneDecoration: vscode.TextEditorDecorationType | null = null;

function getLiveZoneDecoration(): vscode.TextEditorDecorationType {
  if (!_liveZoneDecoration) {
    _liveZoneDecoration = vscode.window.createTextEditorDecorationType({
      textDecoration: 'underline dotted',
      opacity: '0.7',
      after: {
        contentText: ' ◉',
        color: new vscode.ThemeColor('editorInfo.foreground'),
        fontStyle: 'normal',
      },
    });
  }
  return _liveZoneDecoration;
}

export class LiveRewritingZone {
  private editor: vscode.TextEditor | null = null;
  private startPosition: vscode.Position | null = null;
  private currentText = '';
  private _isActive = false;

  get isActive(): boolean { return this._isActive; }
  get text(): string { return this.currentText; }

  /**
   * Begin a live rewriting zone at the current cursor position.
   */
  start(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    this.editor = editor;
    this.startPosition = editor.selection.active;
    this.currentText = '';
    this._isActive = true;
  }

  /**
   * Update the live zone with new partial text.
   * Replaces the previous partial text in-place.
   */
  async update(partialText: string): Promise<void> {
    if (!this._isActive || !this.editor || !this.startPosition) { return; }

    const newText = partialText.trim();
    if (newText === this.currentText) { return; }

    // Calculate the range of the current live zone text
    const startOffset = this.editor.document.offsetAt(this.startPosition);
    const endOffset = startOffset + this.currentText.length;
    const endPosition = this.editor.document.positionAt(endOffset);
    const range = new vscode.Range(this.startPosition, endPosition);

    // Replace the live zone text
    await this.editor.edit(editBuilder => {
      editBuilder.replace(range, newText);
    }, { undoStopBefore: false, undoStopAfter: false });

    this.currentText = newText;

    // Apply decoration to the live zone
    this.applyDecoration();
  }

  /**
   * Finalize the live zone — remove decoration and commit the text.
   * Optionally replace with final text if different from current partial.
   */
  async finalize(finalText?: string): Promise<void> {
    if (!this._isActive || !this.editor || !this.startPosition) {
      this.reset();
      return;
    }

    if (finalText && finalText.trim() !== this.currentText) {
      // Replace partial with final text
      const startOffset = this.editor.document.offsetAt(this.startPosition);
      const endOffset = startOffset + this.currentText.length;
      const endPosition = this.editor.document.positionAt(endOffset);
      const range = new vscode.Range(this.startPosition, endPosition);

      await this.editor.edit(editBuilder => {
        editBuilder.replace(range, finalText.trim());
      });
    }

    // Remove decoration
    this.clearDecoration();
    this.reset();
  }

  /**
   * Cancel the live zone — remove the partial text and decoration.
   */
  async cancel(): Promise<void> {
    if (!this._isActive || !this.editor || !this.startPosition) {
      this.reset();
      return;
    }

    if (this.currentText.length > 0) {
      const startOffset = this.editor.document.offsetAt(this.startPosition);
      const endOffset = startOffset + this.currentText.length;
      const endPosition = this.editor.document.positionAt(endOffset);
      const range = new vscode.Range(this.startPosition, endPosition);

      await this.editor.edit(editBuilder => {
        editBuilder.delete(range);
      });
    }

    this.clearDecoration();
    this.reset();
  }

  private applyDecoration(): void {
    if (!this.editor || !this.startPosition || this.currentText.length === 0) { return; }

    const startOffset = this.editor.document.offsetAt(this.startPosition);
    const endOffset = startOffset + this.currentText.length;
    const endPosition = this.editor.document.positionAt(endOffset);
    const range = new vscode.Range(this.startPosition, endPosition);

    this.editor.setDecorations(getLiveZoneDecoration(), [range]);
  }

  private clearDecoration(): void {
    if (this.editor) {
      this.editor.setDecorations(getLiveZoneDecoration(), []);
    }
  }

  private reset(): void {
    this.editor = null;
    this.startPosition = null;
    this.currentText = '';
    this._isActive = false;
  }
}

/**
 * Diff two strings to find the minimal change for smooth rewriting.
 * Returns the common prefix length and the differing suffix.
 */
export function findTextDiff(oldText: string, newText: string): { commonPrefix: number; changed: string } {
  let i = 0;
  while (i < oldText.length && i < newText.length && oldText[i] === newText[i]) {
    i++;
  }
  return {
    commonPrefix: i,
    changed: newText.slice(i),
  };
}
