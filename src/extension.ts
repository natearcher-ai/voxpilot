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
import { OfflineModelManagerPanel } from './offlineModelManagerPanel';
import { DictationProfileManager, DictationProfileStatusBar } from './dictationProfiles';
import { ConfidenceIndicatorManager } from './confidenceIndicators';
import { initializeTeamVocabulary, exportToTeamVocabulary } from './teamVocabularySync';
import { registerAiCodeGenerationCommand } from './aiCodeGeneration';
import { privacyDashboard } from './privacyDashboard';
import { aiVoiceShortcuts } from './aiVoiceShortcuts';
import { remotePairVoice } from './remotePairVoice';
import { voiceTemplates } from './voiceTemplates';
import { transcriptionExporter, ExportFormat, TranscriptEntry } from './transcriptionExport';

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
  privacyDashboard.init(context);
  remotePairVoice.init(context);

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
    vscode.commands.registerCommand('voxpilot.openOfflineModelManager', () => OfflineModelManagerPanel.create(context)),
    vscode.commands.registerCommand('voxpilot.switchDictationProfile', () => engine?.switchDictationProfile()),
    vscode.commands.registerCommand('voxpilot.dismissConfidenceIndicator', (docUri: string, index: number) => engine?.dismissConfidenceIndicator(docUri, index)),
    vscode.commands.registerCommand('voxpilot.clearConfidenceIndicators', () => engine?.clearConfidenceIndicators()),
    vscode.commands.registerCommand('voxpilot.manageAdaptiveLearning', () => engine?.manageAdaptiveLearning()),
    vscode.commands.registerCommand('voxpilot.recordCorrection', () => engine?.recordCorrection()),
    vscode.commands.registerCommand('voxpilot.initTeamVocabulary', () => initializeTeamVocabulary()),
    vscode.commands.registerCommand('voxpilot.exportToTeamVocabulary', () => exportToTeamVocabulary()),
    vscode.commands.registerCommand('voxpilot.showPrivacyDashboard', () => privacyDashboard.show()),
    vscode.commands.registerCommand('voxpilot.exportTranscript', () => exportTranscript(context)),
    vscode.commands.registerCommand('voxpilot.exportTranscriptAs', () => exportTranscriptAs(context)),
    vscode.commands.registerCommand('voxpilot.exportTranscriptToClipboard', () => exportTranscriptToClipboard(context)),
    vscode.commands.registerCommand('voxpilot.listVoiceTemplates', () => listVoiceTemplates()),
    registerAiCodeGenerationCommand(context),
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

function getTranscriptEntries(context: vscode.ExtensionContext): TranscriptEntry[] {
  const history = context.globalState.get<Array<{ text: string; timestamp: number }>>('voxpilot.transcriptHistory', []);
  return history.map(e => ({
    text: e.text,
    timestamp: e.timestamp,
  }));
}

async function exportTranscript(context: vscode.ExtensionContext): Promise<void> {
  const entries = getTranscriptEntries(context);
  if (entries.length === 0) {
    vscode.window.showInformationMessage('VoxPilot: No transcripts to export.');
    return;
  }
  await transcriptionExporter.exportToFile(entries, { format: 'markdown', includeTimestamps: true, includeConfidence: false, includeFileInfo: true, groupByFile: false, fromDate: 0, toDate: 0, languageFilter: '' });
}

async function exportTranscriptAs(context: vscode.ExtensionContext): Promise<void> {
  const entries = getTranscriptEntries(context);
  if (entries.length === 0) {
    vscode.window.showInformationMessage('VoxPilot: No transcripts to export.');
    return;
  }

  const formats = transcriptionExporter.getFormats();
  const picked = await vscode.window.showQuickPick(
    formats.map(f => ({ label: f.label, description: f.description, format: f.format })),
    { placeHolder: 'Select export format' },
  );
  if (!picked) return;

  const config = {
    format: picked.format as ExportFormat,
    includeTimestamps: true,
    includeConfidence: false,
    includeFileInfo: true,
    groupByFile: false,
    fromDate: 0,
    toDate: 0,
    languageFilter: '',
  };

  await transcriptionExporter.exportToFile(entries, config);
}

async function exportTranscriptToClipboard(context: vscode.ExtensionContext): Promise<void> {
  const entries = getTranscriptEntries(context);
  if (entries.length === 0) {
    vscode.window.showInformationMessage('VoxPilot: No transcripts to export.');
    return;
  }

  const formats = transcriptionExporter.getFormats();
  const picked = await vscode.window.showQuickPick(
    formats.map(f => ({ label: f.label, description: f.description, format: f.format })),
    { placeHolder: 'Select export format for clipboard' },
  );
  if (!picked) return;

  const config = {
    format: picked.format as ExportFormat,
    includeTimestamps: true,
    includeConfidence: false,
    includeFileInfo: true,
    groupByFile: false,
    fromDate: 0,
    toDate: 0,
    languageFilter: '',
  };

  await transcriptionExporter.exportToClipboard(entries, config);
}

async function listVoiceTemplates(): Promise<void> {
  const templates = voiceTemplates.getTemplates();
  const items = templates.map(t => ({
    label: t.phrases[0],
    description: t.description,
    detail: t.languages.length > 0 ? `Languages: ${t.languages.join(', ')}` : 'All languages',
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Available voice templates — say the phrase to scaffold code',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (picked) {
    vscode.window.showInformationMessage(`Say "${picked.label} <name>" to scaffold: ${picked.description}`);
  }
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
