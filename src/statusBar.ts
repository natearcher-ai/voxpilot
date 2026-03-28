import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private sentTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'voxpilot.toggleListening';
    this.item.show();
  }

  setIdle() {
    this.clearSentTimeout();
    this.item.text = '$(mic) VoxPilot';
    this.item.tooltip = 'Click to start voice input';
    this.item.backgroundColor = undefined;
  }

  setCalibrating() {
    this.item.text = '$(pulse) Calibrating...';
    this.item.tooltip = 'Measuring ambient noise level';
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  setListening() {
    this.item.text = '$(mic-filled) Listening...';
    this.item.tooltip = 'Speak now — click to stop';
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  setListeningWithLevel(dB: number) {
    const display = isFinite(dB) ? `${dB.toFixed(0)} dB` : '—∞ dB';
    this.item.text = `$(mic-filled) ${display}`;
    this.item.tooltip = `Voice level: ${display} — click to stop`;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  setSpeechDetected() {
    this.item.text = '$(record) Speaking...';
    this.item.tooltip = 'Speech detected — recording';
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  setSpeechDetectedWithLevel(dB: number) {
    const display = isFinite(dB) ? `${dB.toFixed(0)} dB` : '—∞ dB';
    this.item.text = `$(record) ${display}`;
    this.item.tooltip = `Recording — voice level: ${display}`;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  setProcessing() {
    this.item.text = '$(loading~spin) Transcribing...';
    this.item.tooltip = 'Processing speech';
    this.item.backgroundColor = undefined;
  }

  setStreamingPartial(text: string) {
    const truncated = text.length > 40 ? '…' + text.slice(-40) : text;
    this.item.text = `$(pulse) ${truncated}`;
    this.item.tooltip = `Streaming: ${text}`;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  setSent(text: string) {
    this.clearSentTimeout();
    const truncated = text.length > 30 ? text.slice(0, 30) + '…' : text;
    this.item.text = `$(check) ${truncated}`;
    this.item.tooltip = `Sent: ${text}`;
    this.item.backgroundColor = undefined;
    // Revert to idle or listening after 3 seconds
    this.sentTimeout = setTimeout(() => {
      this.item.text = '$(mic) VoxPilot';
      this.item.tooltip = 'Click to start voice input';
    }, 3000);
  }

  setError(msg: string) {
    this.item.text = '$(error) VoxPilot';
    this.item.tooltip = msg;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }

  private clearSentTimeout() {
    if (this.sentTimeout) {
      clearTimeout(this.sentTimeout);
      this.sentTimeout = undefined;
    }
  }

  dispose() {
    this.clearSentTimeout();
    this.item.dispose();
  }
}
