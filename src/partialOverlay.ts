import * as vscode from 'vscode';

/**
 * Real-time partial transcript overlay — shows floating live-caption text
 * at the top of the active editor as the user speaks.
 * Uses editor decorations with a semi-transparent background for a
 * non-intrusive caption bar effect.
 */
export class PartialOverlay implements vscode.Disposable {
  private decorationType: vscode.TextEditorDecorationType | null = null;
  private hideTimeout: ReturnType<typeof setTimeout> | undefined;
  private currentText = '';
  private enabled: boolean;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    const config = vscode.workspace.getConfiguration('voxpilot');
    this.enabled = config.get<boolean>('partialOverlay', true);

    const watcher = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('voxpilot.partialOverlay')) {
        this.enabled = vscode.workspace.getConfiguration('voxpilot').get<boolean>('partialOverlay', true);
        if (!this.enabled) {
          this.hide();
        }
      }
    });
    this.disposables.push(watcher);
  }

  /**
   * Show or update the partial transcript overlay in the active editor.
   */
  show(text: string): void {
    if (!this.enabled || !text.trim()) { return; }

    this.clearHideTimeout();
    this.currentText = text.trim();

    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    // Dispose previous decoration type to update content
    this.decorationType?.dispose();

    const displayText = this.currentText.length > 120
      ? '… ' + this.currentText.slice(-120)
      : this.currentText;

    // Create a new decoration type with the current text as after-content
    this.decorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      after: {
        contentText: `  🎙️ ${displayText}`,
        color: new vscode.ThemeColor('editorInfo.foreground'),
        backgroundColor: new vscode.ThemeColor('editorWidget.background'),
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editorWidget.border'),
        margin: '0 0 0 1em',
        fontStyle: 'italic',
      },
    });

    // Place decoration on the first visible line of the editor
    const visibleRange = editor.visibleRanges[0];
    const line = visibleRange ? visibleRange.start.line : 0;
    const range = new vscode.Range(line, 0, line, 0);

    editor.setDecorations(this.decorationType, [{ range }]);
  }

  /**
   * Hide the overlay, optionally after a short delay to let the user read the final text.
   */
  hide(delayMs = 0): void {
    this.clearHideTimeout();

    if (delayMs > 0) {
      this.hideTimeout = setTimeout(() => this.clearDecoration(), delayMs);
    } else {
      this.clearDecoration();
    }
  }

  /**
   * Flash the final transcript briefly, then hide.
   */
  showFinal(text: string): void {
    if (!this.enabled) { return; }
    this.show(text);
    this.hide(2000);
  }

  private clearDecoration(): void {
    this.decorationType?.dispose();
    this.decorationType = null;
    this.currentText = '';
  }

  private clearHideTimeout(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = undefined;
    }
  }

  dispose(): void {
    this.clearHideTimeout();
    this.clearDecoration();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
