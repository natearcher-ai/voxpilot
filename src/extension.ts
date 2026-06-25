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
import { accessibilityAudit, executeAuditCommand, clearAuditDiagnostics, runFullAudit, showAuditResults, isAuditable, disposeAuditDiagnostics } from './accessibilityAudit';
import { customWakeWordManager, CustomWakeWordManager } from './customWakeWords';
import { voiceJournal } from './voiceJournal';
import { registerOfflineModelHubCommands } from './offlineModelHub';
import { performanceProfiler } from './performanceProfiler';
import { enterpriseSSO } from './enterpriseSSO';
import { telemetryBridge } from './telemetryBridge';
import { showUsageAnalyticsDashboard } from './usageAnalyticsDashboard';
import { usageAnalytics } from './usageAnalytics';
import { marketplaceClient } from './marketplaceV2';
import { modelEnsemble } from './modelEnsemble';
import { speakerProfileManager } from './speakerProfiles';
import { voiceCodeReview } from './voiceCodeReview';
import { batchTranscription } from './batchTranscription';
import { performanceAudit, PerformanceAudit } from './performanceAudit';

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
  customWakeWordManager.init(context);
  voiceJournal.init(context);
  enterpriseSSO.init(context);
  telemetryBridge.init(context);
  usageAnalytics.init(context);
  marketplaceClient.init(context);
  speakerProfileManager.init(context);
  batchTranscription.init(context);
  performanceAudit.init(context);
  // Voice code review is registered as a pipeline processor (auto-active via setting)

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
    vscode.commands.registerCommand('voxpilot.toggleAmbientListening', () => engine?.toggleAmbientListening()),
    vscode.commands.registerCommand('voxpilot.runAccessibilityAudit', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { vscode.window.showWarningMessage('VoxPilot: No active editor.'); return; }
      if (!isAuditable(editor.document)) { vscode.window.showWarningMessage('VoxPilot: Current file is not markup.'); return; }
      const issues = runFullAudit(editor.document.getText());
      showAuditResults(editor.document, issues);
      if (issues.length === 0) { vscode.window.showInformationMessage('VoxPilot: No accessibility issues found. ✅'); }
      else { vscode.window.showInformationMessage(`VoxPilot: Found ${issues.length} accessibility issue(s).`); }
      vscode.commands.executeCommand('workbench.actions.view.problems');
    }),
    vscode.commands.registerCommand('voxpilot.clearAccessibilityAudit', () => clearAuditDiagnostics()),
    vscode.commands.registerCommand('voxpilot.openJournalPanel', () => openJournalPanel(context)),
    vscode.commands.registerCommand('voxpilot.exportJournal', () => exportJournal()),
    vscode.commands.registerCommand('voxpilot.clearJournal', () => clearJournal()),
    vscode.commands.registerCommand('voxpilot.trainWakeWord', () => trainCustomWakeWord(context)),
    vscode.commands.registerCommand('voxpilot.manageWakeWords', () => manageWakeWords()),
    vscode.commands.registerCommand('voxpilot.deleteWakeWord', () => deleteCustomWakeWord()),
    ...registerOfflineModelHubCommands(context),
    vscode.commands.registerCommand('voxpilot.startProfiling', () => performanceProfiler.startCpuProfile()),
    vscode.commands.registerCommand('voxpilot.stopProfiling', () => performanceProfiler.stopCpuProfile()),
    vscode.commands.registerCommand('voxpilot.showProfilingResults', () => performanceProfiler.showResults()),
    vscode.commands.registerCommand('voxpilot.exportProfile', () => performanceProfiler.exportProfile()),
    vscode.commands.registerCommand('voxpilot.enterpriseSSOLogin', () => enterpriseSSO.login()),
    vscode.commands.registerCommand('voxpilot.enterpriseSSOLogout', () => enterpriseSSO.logout()),
    vscode.commands.registerCommand('voxpilot.enterpriseSSOStatus', () => showSSOStatus()),
    vscode.commands.registerCommand('voxpilot.telemetryStatus', () => showTelemetryStatus()),
    vscode.commands.registerCommand('voxpilot.showUsageAnalytics', () => showUsageAnalyticsDashboard(context)),
    vscode.commands.registerCommand('voxpilot.browseMarketplaceV2', () => browseMarketplaceV2()),
    vscode.commands.registerCommand('voxpilot.marketplaceCheckUpdates', () => marketplaceCheckUpdates()),
    vscode.commands.registerCommand('voxpilot.configureEnsemble', () => configureEnsemble()),
    vscode.commands.registerCommand('voxpilot.manageSpeakerProfiles', () => manageSpeakerProfiles()),
    vscode.commands.registerCommand('voxpilot.switchSpeakerProfile', () => switchSpeakerProfile()),
    vscode.commands.registerCommand('voxpilot.createSpeakerProfile', () => createSpeakerProfileCommand()),
    vscode.commands.registerCommand('voxpilot.exportSpeakerProfile', () => exportSpeakerProfileCommand()),
    vscode.commands.registerCommand('voxpilot.importSpeakerProfile', () => importSpeakerProfileCommand()),
    vscode.commands.registerCommand('voxpilot.runPerformanceAudit', () => runPerformanceAuditCommand()),
    vscode.commands.registerCommand('voxpilot.showPerformanceAuditReport', () => showPerformanceAuditReport()),
    vscode.commands.registerCommand('voxpilot.clearPerformanceAudit', () => { performanceAudit.clear(); vscode.window.showInformationMessage('VoxPilot: Performance audit data cleared.'); }),
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

async function trainCustomWakeWord(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('voxpilot');
  if (!config.get<boolean>('customWakeWords', true)) {
    vscode.window.showWarningMessage('VoxPilot: Custom wake words are disabled. Enable via voxpilot.customWakeWords setting.');
    return;
  }

  const phrase = await vscode.window.showInputBox({
    prompt: 'Enter the wake word or phrase to train (e.g., "hey assistant", "start coding")',
    placeHolder: 'Wake word phrase',
    validateInput: (value) => {
      if (!value || value.trim().length < 2) return 'Phrase must be at least 2 characters';
      if (value.trim().length > 50) return 'Phrase must be under 50 characters';
      return undefined;
    },
  });

  if (!phrase) return;

  const targetSamples = config.get<number>('customWakeWords.trainingSamples', 5);
  customWakeWordManager.init(context);
  const session = customWakeWordManager.startTraining(phrase.trim(), targetSamples);

  vscode.window.showInformationMessage(
    `VoxPilot: Training "${phrase.trim()}". Say the phrase ${targetSamples} times when prompted. ` +
    `Use "VoxPilot: Toggle Voice Input" to record each sample.`
  );

  // Show progress notification
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Training wake word "${phrase.trim()}"`,
      cancellable: true,
    },
    async (progress, token) => {
      token.onCancellationRequested(() => {
        customWakeWordManager.cancelTraining();
        vscode.window.showInformationMessage('VoxPilot: Wake word training cancelled.');
      });

      progress.report({ message: `Say "${phrase.trim()}" — sample 0/${targetSamples} collected` });

      // Wait for training to complete (poll session state)
      let lastCount = 0;
      while (customWakeWordManager.getTrainingSession()?.active && !token.isCancellationRequested) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const current = customWakeWordManager.getTrainingSession();
        if (current && current.samplesCollected > lastCount) {
          lastCount = current.samplesCollected;
          progress.report({
            message: `Say "${phrase.trim()}" — sample ${lastCount}/${targetSamples} collected`,
            increment: (100 / targetSamples),
          });
        }
      }

      if (!token.isCancellationRequested) {
        vscode.window.showInformationMessage(
          `VoxPilot: Wake word "${phrase.trim()}" trained successfully! It's now active.`
        );
      }
    }
  );
}

async function manageWakeWords(): Promise<void> {
  const wakeWords = customWakeWordManager.getWakeWords();
  const items = wakeWords.map(ww => ({
    label: `${ww.enabled ? '$(check)' : '$(circle-slash)'} ${ww.phrase}`,
    description: ww.builtIn ? 'Built-in' : `Custom (${ww.sampleCount} samples)`,
    detail: `Sensitivity: ${(ww.sensitivity * 100).toFixed(0)}% | ${ww.enabled ? 'Enabled' : 'Disabled'}`,
    phrase: ww.phrase,
    enabled: ww.enabled,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a wake word to toggle or adjust',
    matchOnDescription: true,
  });

  if (!picked) return;

  const action = await vscode.window.showQuickPick(
    [
      { label: picked.enabled ? '$(circle-slash) Disable' : '$(check) Enable', action: 'toggle' },
      { label: '$(settings-gear) Adjust Sensitivity', action: 'sensitivity' },
    ],
    { placeHolder: `Action for "${picked.phrase}"` }
  );

  if (!action) return;

  if (action.action === 'toggle') {
    if (picked.enabled) {
      customWakeWordManager.disableWakeWord(picked.phrase);
      vscode.window.showInformationMessage(`VoxPilot: Wake word "${picked.phrase}" disabled.`);
    } else {
      customWakeWordManager.enableWakeWord(picked.phrase);
      vscode.window.showInformationMessage(`VoxPilot: Wake word "${picked.phrase}" enabled.`);
    }
  } else if (action.action === 'sensitivity') {
    const input = await vscode.window.showInputBox({
      prompt: `Sensitivity for "${picked.phrase}" (0-100, higher = more sensitive)`,
      value: String(Math.round(customWakeWordManager.getWakeWords().find(w => w.phrase === picked.phrase)!.sensitivity * 100)),
      validateInput: (v) => {
        const n = parseInt(v, 10);
        if (isNaN(n) || n < 0 || n > 100) return 'Enter a number between 0 and 100';
        return undefined;
      },
    });
    if (input) {
      customWakeWordManager.setSensitivity(picked.phrase, parseInt(input, 10) / 100);
      vscode.window.showInformationMessage(`VoxPilot: Sensitivity for "${picked.phrase}" set to ${input}%.`);
    }
  }
}

async function deleteCustomWakeWord(): Promise<void> {
  const wakeWords = customWakeWordManager.getWakeWords().filter(w => !w.builtIn);
  if (wakeWords.length === 0) {
    vscode.window.showInformationMessage('VoxPilot: No custom wake words to delete.');
    return;
  }

  const items = wakeWords.map(ww => ({
    label: ww.phrase,
    description: `${ww.sampleCount} training samples`,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a custom wake word to delete',
  });

  if (!picked) return;

  const confirm = await vscode.window.showWarningMessage(
    `Delete wake word "${picked.label}"? Training data will be lost.`,
    { modal: true },
    'Delete'
  );

  if (confirm === 'Delete') {
    customWakeWordManager.deleteWakeWord(picked.label);
    vscode.window.showInformationMessage(`VoxPilot: Wake word "${picked.label}" deleted.`);
  }
}

async function openJournalPanel(context: vscode.ExtensionContext): Promise<void> {
  const entries = voiceJournal.getEntries();
  if (entries.length === 0) {
    vscode.window.showInformationMessage('VoxPilot: No journal entries yet. Say "note", "todo", "bug", "idea", or "question" followed by your text.');
    return;
  }

  const items = entries.slice().reverse().map(e => {
    const time = new Date(e.timestamp).toLocaleString();
    const emoji = getJournalTagEmoji(e.tag);
    const ctx = e.context.file ? ` (${e.context.file}${e.context.line ? ':' + e.context.line : ''})` : '';
    return {
      label: `${emoji} [${e.tag.toUpperCase()}] ${e.text}`,
      description: time,
      detail: `${ctx}${e.context.branch ? ' | branch: ' + e.context.branch : ''}`,
      id: e.id,
    };
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Voice Journal — ${entries.length} entries`,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (picked) {
    const entry = entries.find(e => e.id === picked.id);
    if (entry?.context.file) {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        const filePath = path.join(workspaceFolders[0].uri.fsPath, entry.context.file);
        try {
          const doc = await vscode.workspace.openTextDocument(filePath);
          const editor = await vscode.window.showTextDocument(doc);
          if (entry.context.line) {
            const pos = new vscode.Position(entry.context.line - 1, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos));
          }
        } catch {
          // File may not exist anymore
        }
      }
    }
  }
}

async function exportJournal(): Promise<void> {
  const entries = voiceJournal.getEntries();
  if (entries.length === 0) {
    vscode.window.showInformationMessage('VoxPilot: No journal entries to export.');
    return;
  }

  const markdown = voiceJournal.exportAsMarkdown();
  const doc = await vscode.workspace.openTextDocument({ content: markdown, language: 'markdown' });
  await vscode.window.showTextDocument(doc);
}

async function clearJournal(): Promise<void> {
  const entries = voiceJournal.getEntries();
  if (entries.length === 0) {
    vscode.window.showInformationMessage('VoxPilot: Journal is already empty.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `VoxPilot: Clear all ${entries.length} journal entries? This cannot be undone.`,
    { modal: true },
    'Clear All',
  );
  if (confirm === 'Clear All') {
    voiceJournal.clearAll();
    vscode.window.showInformationMessage('VoxPilot: Voice journal cleared.');
  }
}

function getJournalTagEmoji(tag: string): string {
  switch (tag) {
    case 'todo': return '📋';
    case 'bug': return '🐛';
    case 'idea': return '💡';
    case 'question': return '❓';
    case 'decision': return '⚖️';
    case 'review': return '👀';
    default: return '📝';
  }
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
    telemetryBridge.dispose();
  } catch {
    // Safety net -- never throw during deactivation
  }
}

async function showSSOStatus(): Promise<void> {
  const state = enterpriseSSO.getState();
  if (!state.configured) {
    vscode.window.showInformationMessage('VoxPilot Enterprise SSO: Not configured. Set voxpilot.enterprise.enabled to true and configure your provider.');
    return;
  }
  if (state.authenticated && state.user) {
    const expiry = new Date(state.user.expiresAt).toLocaleString();
    vscode.window.showInformationMessage(`VoxPilot SSO: Authenticated as ${state.user.name} (${state.user.email}) | Org: ${state.user.orgId} | Expires: ${expiry}`);
  } else {
    vscode.window.showInformationMessage(`VoxPilot SSO: Not authenticated.${state.error ? ' Error: ' + state.error : ''}`);
  }
}

async function showTelemetryStatus(): Promise<void> {
  const enabled = telemetryBridge.isEnabled();
  const size = telemetryBridge.bufferSize;
  if (!enabled) {
    vscode.window.showInformationMessage('VoxPilot Telemetry: Disabled. Respects VS Code telemetry settings and voxpilot.telemetry.optIn.');
  } else {
    const summary = telemetryBridge.getBufferSummary();
    const types = Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join(', ');
    vscode.window.showInformationMessage(`VoxPilot Telemetry: Active | Buffered: ${size} events${types ? ' (' + types + ')' : ''}`);
  }
}

async function browseMarketplaceV2(): Promise<void> {
  const actions = ['🔍 Search Packs', '⭐ Featured', '📦 Installed', '🔄 Check Updates'];
  const choice = await vscode.window.showQuickPick(actions, { placeHolder: 'Voice Command Marketplace v2' });
  if (!choice) return;

  if (choice.startsWith('🔍')) {
    const query = await vscode.window.showInputBox({ prompt: 'Search voice command packs', placeHolder: 'e.g. react, python, productivity' });
    if (!query) return;
    const result = await marketplaceClient.search({ query });
    if (result.packs.length === 0) {
      vscode.window.showInformationMessage(`No packs found for "${query}".`);
      return;
    }
    const items = result.packs.map(p => ({
      label: `${p.publisher.verification === 'verified' ? '✓ ' : ''}${p.name}`,
      description: `v${p.version} by ${p.publisher.displayName} — ⭐${p.rating.toFixed(1)} (${p.ratingCount}) — ${p.downloads} downloads`,
      detail: p.description,
      packId: p.id,
    }));
    const selected = await vscode.window.showQuickPick(items, { placeHolder: `${result.total} results` });
    if (selected) {
      const installed = await marketplaceClient.install(selected.packId);
      if (installed) vscode.window.showInformationMessage(`Installed "${selected.label}" from marketplace.`);
      else vscode.window.showErrorMessage(`Failed to install "${selected.label}".`);
    }
  } else if (choice.startsWith('⭐')) {
    const featured = await marketplaceClient.getFeatured();
    if (featured.length === 0) {
      vscode.window.showInformationMessage('No featured packs available.');
      return;
    }
    const items = featured.map(p => ({
      label: `🌟 ${p.name}`,
      description: `v${p.version} — ⭐${p.rating.toFixed(1)} — ${p.downloads} downloads`,
      detail: p.description,
      packId: p.id,
    }));
    const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Featured Packs' });
    if (selected) {
      const installed = await marketplaceClient.install(selected.packId);
      if (installed) vscode.window.showInformationMessage(`Installed "${selected.label}" from marketplace.`);
      else vscode.window.showErrorMessage(`Failed to install "${selected.label}".`);
    }
  } else if (choice.startsWith('📦')) {
    const installed = marketplaceClient.getInstalled();
    if (installed.length === 0) {
      vscode.window.showInformationMessage('No marketplace packs installed.');
      return;
    }
    const items = installed.map(p => ({
      label: `${p.enabled ? '✅' : '⏸️'} ${p.id}`,
      description: `v${p.version} — installed ${new Date(p.installedAt).toLocaleDateString()}`,
      packId: p.id,
      enabled: p.enabled,
    }));
    const selected = await vscode.window.showQuickPick(items, { placeHolder: `${installed.length} installed pack(s)` });
    if (selected) {
      const action = await vscode.window.showQuickPick(
        [selected.enabled ? '⏸️ Disable' : '▶️ Enable', '🗑️ Uninstall'],
        { placeHolder: selected.packId },
      );
      if (action?.includes('Disable')) marketplaceClient.setEnabled(selected.packId, false);
      else if (action?.includes('Enable')) marketplaceClient.setEnabled(selected.packId, true);
      else if (action?.includes('Uninstall')) marketplaceClient.uninstall(selected.packId);
    }
  } else if (choice.startsWith('🔄')) {
    await marketplaceCheckUpdates();
  }
}

async function marketplaceCheckUpdates(): Promise<void> {
  const updates = await marketplaceClient.checkUpdates();
  if (updates.length === 0) {
    vscode.window.showInformationMessage('All marketplace packs are up to date.');
    return;
  }
  const items = updates.map(u => ({
    label: `${u.id}`,
    description: `${u.currentVersion} → ${u.latestVersion}`,
    id: u.id,
  }));
  const selected = await vscode.window.showQuickPick(items, { placeHolder: `${updates.length} update(s) available`, canPickMany: true });
  if (selected && selected.length > 0) {
    for (const item of selected) {
      await marketplaceClient.install(item.id);
    }
    vscode.window.showInformationMessage(`Updated ${selected.length} pack(s).`);
  }
}

async function configureEnsemble(): Promise<void> {
  const config = vscode.workspace.getConfiguration('voxpilot.ensemble');
  const enabled = config.get<boolean>('enabled', false);

  const action = await vscode.window.showQuickPick([
    { label: enabled ? '$(debug-pause) Disable Ensemble' : '$(play) Enable Ensemble', id: 'toggle' },
    { label: '$(list-unordered) Select Models', id: 'models' },
    { label: '$(settings-gear) Selection Strategy', id: 'strategy' },
    { label: '$(graph-line) View Statistics', id: 'stats' },
  ], { placeHolder: 'Configure Multi-Model Ensemble' });

  if (!action) return;

  switch (action.id) {
    case 'toggle':
      await config.update('enabled', !enabled, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Multi-model ensemble ${!enabled ? 'enabled' : 'disabled'}.`);
      break;
    case 'models': {
      const current = config.get<string[]>('models', ['moonshine-base', 'whisper-small']);
      const input = await vscode.window.showInputBox({
        prompt: 'Enter model IDs (comma-separated)',
        value: current.join(', '),
        validateInput: (v) => v.split(',').filter(s => s.trim()).length < 2 ? 'At least 2 models required' : undefined,
      });
      if (input) {
        const models = input.split(',').map(s => s.trim()).filter(Boolean);
        await config.update('models', models, vscode.ConfigurationTarget.Global);
        modelEnsemble.setConfig({ models });
        vscode.window.showInformationMessage(`Ensemble models: ${models.join(', ')}`);
      }
      break;
    }
    case 'strategy': {
      const strategies = ['confidence', 'consensus', 'perplexity', 'hybrid'];
      const picked = await vscode.window.showQuickPick(
        strategies.map(s => ({ label: s, description: s === 'hybrid' ? '(default — weighted combination)' : '' })),
        { placeHolder: 'Select ensemble strategy' },
      );
      if (picked) {
        await config.update('strategy', picked.label, vscode.ConfigurationTarget.Global);
        modelEnsemble.setConfig({ strategy: picked.label as any });
        vscode.window.showInformationMessage(`Ensemble strategy: ${picked.label}`);
      }
      break;
    }
    case 'stats': {
      const stats = modelEnsemble.getStats();
      const wins = Object.entries(stats.modelWins).map(([m, w]) => `${m}: ${w} wins`).join(', ') || 'No data yet';
      vscode.window.showInformationMessage(
        `Ensemble stats — Runs: ${stats.totalRuns}, Avg agreement: ${(stats.avgAgreement * 100).toFixed(1)}%, Model wins: ${wins}`,
      );
      break;
    }
  }
}

async function manageSpeakerProfiles(): Promise<void> {
  const profiles = speakerProfileManager.getProfiles();
  const activeId = speakerProfileManager.getActiveProfileId();

  const action = await vscode.window.showQuickPick([
    { label: '$(account) Switch Profile', id: 'switch', description: `Active: ${profiles.find(p => p.id === activeId)?.name || 'Default'}` },
    { label: '$(add) Create Profile', id: 'create' },
    { label: '$(edit) Edit Profile', id: 'edit' },
    { label: '$(trash) Delete Profile', id: 'delete' },
    { label: '$(cloud-upload) Export Profile', id: 'export' },
    { label: '$(cloud-download) Import Profile', id: 'import' },
    { label: '$(graph-line) Usage Statistics', id: 'stats' },
  ], { placeHolder: 'Manage Speaker Profiles' });

  if (!action) return;

  switch (action.id) {
    case 'switch':
      await switchSpeakerProfile();
      break;
    case 'create':
      await createSpeakerProfileCommand();
      break;
    case 'edit':
      await editSpeakerProfile();
      break;
    case 'delete':
      await deleteSpeakerProfile();
      break;
    case 'export':
      await exportSpeakerProfileCommand();
      break;
    case 'import':
      await importSpeakerProfileCommand();
      break;
    case 'stats': {
      const stats = speakerProfileManager.getStats();
      const lines = stats.map(s => `${s.name}: ${s.usageCount} sessions`).join(', ') || 'No usage data';
      vscode.window.showInformationMessage(`Speaker profile stats — ${lines}`);
      break;
    }
  }
}

async function switchSpeakerProfile(): Promise<void> {
  const profiles = speakerProfileManager.getProfiles();
  const activeId = speakerProfileManager.getActiveProfileId();

  const items = profiles.map(p => ({
    label: p.name,
    description: p.id === activeId ? '(active)' : '',
    detail: `Model: ${p.preferredModel} | Mode: ${p.defaultMode} | Lang: ${p.language}`,
    id: p.id,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select speaker profile to activate',
  });

  if (picked) {
    speakerProfileManager.switchTo(picked.id, 'manual');
    vscode.window.showInformationMessage(`VoxPilot: Switched to profile "${picked.label}".`);
  }
}

async function createSpeakerProfileCommand(): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Enter a name for the new speaker profile',
    placeHolder: 'e.g. Alice, Bob, Work, Home',
    validateInput: (v) => v.trim().length === 0 ? 'Name cannot be empty' : undefined,
  });

  if (!name) return;

  const profile = speakerProfileManager.createProfile(name.trim());

  // Offer to configure basic settings
  const configure = await vscode.window.showQuickPick(
    [{ label: 'Yes', id: 'yes' }, { label: 'No, use defaults', id: 'no' }],
    { placeHolder: `Profile "${name}" created. Configure settings now?` },
  );

  if (configure?.id === 'yes') {
    await editProfileSettings(profile.id);
  }

  vscode.window.showInformationMessage(`VoxPilot: Profile "${name}" created and active.`);
  speakerProfileManager.switchTo(profile.id, 'manual');
}

async function editSpeakerProfile(): Promise<void> {
  const profiles = speakerProfileManager.getProfiles();
  const items = profiles.map(p => ({ label: p.name, id: p.id }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select profile to edit' });
  if (picked) {
    await editProfileSettings(picked.id);
  }
}

async function editProfileSettings(profileId: string): Promise<void> {
  const profile = speakerProfileManager.getProfile(profileId);
  if (!profile) return;

  const setting = await vscode.window.showQuickPick([
    { label: 'Preferred Model', description: profile.preferredModel, id: 'model' },
    { label: 'Language', description: profile.language, id: 'language' },
    { label: 'Default Mode', description: profile.defaultMode, id: 'mode' },
    { label: 'VAD Sensitivity', description: `${profile.vadSensitivity}`, id: 'vad' },
    { label: 'Noise Gate Threshold', description: `${profile.noiseGateThreshold}`, id: 'noise' },
    { label: 'Custom Vocabulary', description: `${profile.vocabulary.length} words`, id: 'vocab' },
  ], { placeHolder: `Edit profile: ${profile.name}` });

  if (!setting) return;

  switch (setting.id) {
    case 'model': {
      const model = await vscode.window.showInputBox({ prompt: 'Preferred ASR model', value: profile.preferredModel });
      if (model) speakerProfileManager.updateProfile(profileId, { preferredModel: model.trim() });
      break;
    }
    case 'language': {
      const lang = await vscode.window.showInputBox({ prompt: 'Language code (e.g. en, es, fr)', value: profile.language });
      if (lang) speakerProfileManager.updateProfile(profileId, { language: lang.trim() });
      break;
    }
    case 'mode': {
      const mode = await vscode.window.showQuickPick(
        [{ label: 'code' }, { label: 'prose' }, { label: 'command' }],
        { placeHolder: 'Default dictation mode' },
      );
      if (mode) speakerProfileManager.updateProfile(profileId, { defaultMode: mode.label as any });
      break;
    }
    case 'vad': {
      const val = await vscode.window.showInputBox({ prompt: 'VAD sensitivity (0-1)', value: `${profile.vadSensitivity}` });
      if (val) speakerProfileManager.updateProfile(profileId, { vadSensitivity: Math.max(0, Math.min(1, parseFloat(val) || 0.5)) });
      break;
    }
    case 'noise': {
      const val = await vscode.window.showInputBox({ prompt: 'Noise gate threshold (0-1)', value: `${profile.noiseGateThreshold}` });
      if (val) speakerProfileManager.updateProfile(profileId, { noiseGateThreshold: Math.max(0, Math.min(1, parseFloat(val) || 0.01)) });
      break;
    }
    case 'vocab': {
      const input = await vscode.window.showInputBox({ prompt: 'Custom vocabulary (comma-separated)', value: profile.vocabulary.join(', ') });
      if (input !== undefined) {
        const words = input.split(',').map(w => w.trim()).filter(Boolean);
        speakerProfileManager.updateProfile(profileId, { vocabulary: words });
      }
      break;
    }
  }

  vscode.window.showInformationMessage(`VoxPilot: Profile "${profile.name}" updated.`);
}

async function deleteSpeakerProfile(): Promise<void> {
  const profiles = speakerProfileManager.getProfiles().filter(p => p.id !== 'default');
  if (profiles.length === 0) {
    vscode.window.showInformationMessage('VoxPilot: No custom profiles to delete.');
    return;
  }

  const items = profiles.map(p => ({ label: p.name, id: p.id }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select profile to delete' });
  if (!picked) return;

  const confirm = await vscode.window.showWarningMessage(
    `Delete profile "${picked.label}"? This cannot be undone.`,
    { modal: true },
    'Delete',
  );
  if (confirm === 'Delete') {
    speakerProfileManager.deleteProfile(picked.id);
    vscode.window.showInformationMessage(`VoxPilot: Profile "${picked.label}" deleted.`);
  }
}

async function exportSpeakerProfileCommand(): Promise<void> {
  const profiles = speakerProfileManager.getProfiles();
  const items = profiles.map(p => ({ label: p.name, id: p.id }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select profile to export' });
  if (!picked) return;

  const json = speakerProfileManager.exportProfile(picked.id);
  if (!json) return;

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${picked.label.replace(/\s+/g, '-').toLowerCase()}-profile.json`),
    filters: { 'JSON Files': ['json'] },
  });
  if (uri) {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
    vscode.window.showInformationMessage(`VoxPilot: Profile exported to ${uri.fsPath}`);
  }
}

async function importSpeakerProfileCommand(): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters: { 'JSON Files': ['json'] },
    openLabel: 'Import Profile',
  });
  if (!uris || uris.length === 0) return;

  const data = await vscode.workspace.fs.readFile(uris[0]);
  const json = Buffer.from(data).toString('utf8');
  const profile = speakerProfileManager.importProfile(json);

  if (profile) {
    vscode.window.showInformationMessage(`VoxPilot: Imported profile "${profile.name}".`);
  } else {
    vscode.window.showErrorMessage('VoxPilot: Invalid profile file.');
  }
}

async function runPerformanceAuditCommand(): Promise<void> {
  performanceAudit.enable();
  const config = vscode.workspace.getConfiguration('voxpilot');
  const targetStartup = config.get<number>('performanceAudit.targetStartupMs', 500);
  const slowThreshold = config.get<number>('performanceAudit.slowThresholdMs', 100);
  performanceAudit.setConfig({ targetStartupMs: targetStartup, slowThresholdMs: slowThreshold });

  vscode.window.showInformationMessage(
    `VoxPilot: Performance audit enabled. Slow threshold: ${slowThreshold}ms, startup target: ${targetStartup}ms. Use the extension normally, then view the report.`,
  );
}

async function showPerformanceAuditReport(): Promise<void> {
  const summary = performanceAudit.getSummary();
  const panel = vscode.window.createWebviewPanel(
    'voxpilotPerformanceAudit',
    'VoxPilot Performance Audit',
    vscode.ViewColumn.One,
    { enableScripts: false },
  );

  const slowRows = summary.slowest
    .map(m => `<tr><td>${m.name}</td><td>${m.category}</td><td class="${m.slow ? 'slow' : ''}">${m.durationMs}ms</td></tr>`)
    .join('');

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
h1 { font-size: 1.4em; }
h2 { font-size: 1.1em; margin-top: 24px; }
.score { font-size: 2em; font-weight: bold; }
.score.good { color: #4caf50; }
.score.ok { color: #ff9800; }
.score.bad { color: #f44336; }
table { border-collapse: collapse; width: 100%; margin-top: 8px; }
th, td { text-align: left; padding: 6px 12px; border-bottom: 1px solid var(--vscode-widget-border); }
.slow { color: #f44336; font-weight: bold; }
.metric { display: inline-block; margin: 8px 16px 8px 0; }
.metric .value { font-size: 1.3em; font-weight: bold; }
.metric .label { font-size: 0.85em; opacity: 0.7; }
</style>
</head>
<body>
<h1>⚡ Performance Audit Report</h1>
<p class="score ${summary.score >= 80 ? 'good' : summary.score >= 50 ? 'ok' : 'bad'}">Score: ${summary.score}/100</p>
<div>
  <span class="metric"><span class="value">${summary.startupMs}ms</span><br><span class="label">Startup Time</span></span>
  <span class="metric"><span class="value">${summary.avgPipelineMs}ms</span><br><span class="label">Avg Pipeline</span></span>
  <span class="metric"><span class="value">${summary.p95PipelineMs}ms</span><br><span class="label">P95 Pipeline</span></span>
  <span class="metric"><span class="value">${summary.avgAudioLatencyMs}ms</span><br><span class="label">Avg Audio Latency</span></span>
  <span class="metric"><span class="value">${summary.modelLoadMs}ms</span><br><span class="label">Model Load</span></span>
  <span class="metric"><span class="value">${summary.memoryMb}MB</span><br><span class="label">Heap Memory</span></span>
</div>
<div>
  <span class="metric"><span class="value">${summary.totalMeasurements}</span><br><span class="label">Total Measurements</span></span>
  <span class="metric"><span class="value ${summary.slowOperations > 0 ? 'slow' : ''}">${summary.slowOperations}</span><br><span class="label">Slow Operations (&gt;100ms)</span></span>
</div>
<h2>Slowest Operations (Top 10)</h2>
${summary.slowest.length > 0 ? `<table><tr><th>Operation</th><th>Category</th><th>Duration</th></tr>${slowRows}</table>` : '<p>No measurements recorded yet. Use the extension to collect data.</p>'}
</body>
</html>`;
}
