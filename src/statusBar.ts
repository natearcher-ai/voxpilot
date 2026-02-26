import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'voxpilot.toggleListening';
    this.item.show();
  }

  setIdle() {
    this.item.text = '$(mic) VoxPilot';
    this.item.tooltip = 'Click to start voice input';
    this.item.backgroundColor = undefined;
  }

  setListening() {
    this.item.text = '$(mic-filled) VoxPilot';
    this.item.tooltip = 'Listening... click to stop';
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  setProcessing() {
    this.item.text = '$(loading~spin) VoxPilot';
    this.item.tooltip = 'Transcribing...';
  }

  setError(msg: string) {
    this.item.text = '$(error) VoxPilot';
    this.item.tooltip = msg;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }

  dispose() {
    this.item.dispose();
  }
}
