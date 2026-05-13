import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { VoxPilotEngine } from './engine';
import { StatusBarManager } from './statusBar';
import { ModelManager } from './modelManager';
import { ModelManagerPanel, ModelTreeItem } from './modelManagerPanel';
import { showPipelineSettings } from './pipelineSettingsUI';
import { showLanguageSelector } from './languageSelector';
import { createAPI, VoxPilotAPI } from './extensionApi';

let engine: VoxPilotEngine | undefined;
let statusBar: StatusBarManager;

export async function activate(context: vscode.ExtensionContext): Promise<VoxPilotAPI | undefined> {
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

  // Model manager sidebar panel
  const modelPanel = new ModelManagerPanel(context);
  const treeView = vscode.window.createTreeView('voxpilot.modelManager', {
    treeDataProvider: modelPanel,
    showCollapseAll: false,
  });

  // Refresh panel when model setting changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('voxpilot.model')) {
      modelPanel.refresh();
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('voxpilot.toggleListening', () => engine?.toggle()),
    vscode.commands.registerCommand('voxpilot.toggleDictation', () => engine?.toggleDictation()),
    vscode.commands.registerCommand('voxpilot.pushToTalk', () => engine?.quickCapture()),
    vscode.commands.registerCommand('voxpilot.pushToTalkKeyDown', () => engine?.walkyTalkyKeyDown()),
    vscode.commands.registerCommand('voxpilot.pushToTalkKeyUp', () => engine?.walkyTalkyKeyUp()),
    vscode.commands.registerCommand('voxpilot.selectModel', () => engine?.selectModel()),
    vscode.commands.registerCommand('voxpilot.selectAudioDevice', () => engine?.selectAudioDevice()),
    vscode.commands.registerCommand('voxpilot.inlineVoiceInput', () => engine?.inlineVoiceInput()),
    vscode.commands.registerCommand('voxpilot.transcriptHistory', () => engine?.showTranscriptHistory()),
    vscode.commands.registerCommand('voxpilot.openHistoryPanel', () => engine?.openHistoryPanel()),
    vscode.commands.registerCommand('voxpilot.recordMacro', () => engine?.recordMacro()),
    vscode.commands.registerCommand('voxpilot.listMacros', () => engine?.listMacros()),
    vscode.commands.registerCommand('voxpilot.sendToChat', () => engine?.sendLastToChat()),
    vscode.commands.registerCommand('voxpilot.selectLanguage', () => engine?.selectLanguage()),
    vscode.commands.registerCommand('voxpilot.quickToggleLanguage', () => engine?.quickToggleLanguage()),
    vscode.commands.registerCommand('voxpilot.applyLanguageProfile', () => engine?.applyLanguageProfile()),
    vscode.commands.registerCommand('voxpilot.saveLanguageProfile', () => engine?.saveLanguageProfile()),
    vscode.commands.registerCommand('voxpilot.clearCache', () => clearCache(context)),
    vscode.commands.registerCommand('voxpilot.pipelineSettings', () => engine ? showPipelineSettings(engine.pipeline) : undefined),
    vscode.commands.registerCommand('voxpilot.modelManager.download', (item: ModelTreeItem) => modelPanel.downloadModel(item)),
    vscode.commands.registerCommand('voxpilot.modelManager.switch', (item: ModelTreeItem) => modelPanel.switchModel(item)),
    vscode.commands.registerCommand('voxpilot.modelManager.delete', (item: ModelTreeItem) => modelPanel.deleteModel(item)),
    vscode.commands.registerCommand('voxpilot.modelManager.refresh', () => modelPanel.refresh()),
    vscode.commands.registerCommand('voxpilot.showPerformanceDashboard', () => engine?.showPerformanceDashboard()),
    vscode.commands.registerCommand('voxpilot.browseSnippetMarketplace', () => engine?.browseSnippetMarketplace()),
    treeView,
    configWatcher,
    statusBar,
    { dispose: () => { engine?.dispose(); modelPanel.dispose(); } },
  );

  if (audioCheck.available) {
    statusBar.setIdle();
  }

  // Expose public API for other extensions
  const config = vscode.workspace.getConfiguration('voxpilot');
  if (config.get<boolean>('extensionApi', true) && engine) {
    const pkg = context.extension.packageJSON;
    const api = createAPI(
      engine.eventEmitter,
      () => ({
        isRecording: engine?.recording ?? false,
        model: engine?.model ?? 'moonshine-base',
        language: engine?.language ?? 'auto',
        lastTranscript: engine?.transcript,
      }),
      {
        start: async () => { await engine?.apiStartRecording(); },
        stop: async () => { await engine?.apiStopRecording(); },
      },
      pkg.version,
    );
    return api;
  }

  return undefined;
}

async function clearCache(context: vscode.ExtensionContext): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    'VoxPilot: Clear all cached models and runtime? You\'ll need to re-download on next use.',
    { modal: true },
    'Clear Cache',
  );
  if (confirm !== 'Clear Cache') { return; }

  // Dispose transcriber first
  engine?.dispose();
  engine = undefined;

  const storageDir = context.globalStorageUri.fsPath;
  const dirs = ['runtime', 'models', 'hf-cache'];
  let freedBytes = 0;

  for (const dir of dirs) {
    const fullPath = path.join(storageDir, dir);
    if (fs.existsSync(fullPath)) {
      freedBytes += getDirSize(fullPath);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }

  const freedMB = (freedBytes / (1024 * 1024)).toFixed(0);
  vscode.window.showInformationMessage(`VoxPilot: Cache cleared (${freedMB}MB freed). Reload window to re-initialize.`);
}

function getDirSize(dir: string): number {
  let size = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else {
        size += fs.statSync(fullPath).size;
      }
    }
  } catch {}
  return size;
}

export function deactivate() {
  try {
    if (engine) {
      engine.dispose();
      engine = undefined;
    }
    if (statusBar) {
      statusBar.dispose();
    }
  } catch {
    // Safety net -- never throw during deactivation
  }
}
