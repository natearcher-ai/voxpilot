import * as vscode from 'vscode';
import { VoxPilotEngine } from './engine';
import { StatusBarManager } from './statusBar';
import { ModelManager } from './modelManager';

let engine: VoxPilotEngine | undefined;
let statusBar: StatusBarManager;

export async function activate(context: vscode.ExtensionContext) {
  statusBar = new StatusBarManager();

  // Check for audio capture tool early
  const audioCheck = ModelManager.checkAudioTool();
  if (!audioCheck.available) {
    statusBar.setError('No audio tool found');
    vscode.window.showWarningMessage(
      `VoxPilot: No audio capture tool found. Install ${audioCheck.installHint}`,
    );
  }

  engine = new VoxPilotEngine(context, statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('voxpilot.toggleListening', () => engine?.toggle()),
    vscode.commands.registerCommand('voxpilot.pushToTalk', () => engine?.quickCapture()),
    vscode.commands.registerCommand('voxpilot.selectModel', () => engine?.selectModel()),
    vscode.commands.registerCommand('voxpilot.sendToChat', () => engine?.sendLastToChat()),
    statusBar,
    { dispose: () => engine?.dispose() },
  );

  if (audioCheck.available) {
    statusBar.setIdle();
  }
}

export function deactivate() {
  // Handled by disposables
}
