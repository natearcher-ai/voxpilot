import * as vscode from 'vscode';
import * as path from 'path';
import { AudioCapture, AudioDevice } from './audioCapture';
import { VoiceActivityDetector } from './vad';
import { Transcriber, StreamingCallbacks, TranscriptionResult } from './transcriber';
import { ModelManager } from './modelManager';
import { StatusBarManager } from './statusBar';
import { TranscriptHistory } from './transcriptHistory';
import { HistoryStore, HistoryPanelView } from './historyPanel';
import { SoundFeedback } from './soundFeedback';
import { NoiseGate } from './noiseGate';
import { AdaptiveNoiseReduction } from './adaptiveNoiseReduction';
import { PartialOverlay } from './partialOverlay';
import { shouldAutoSubmit } from './autoSubmitRules';
import { PostProcessingPipeline } from './postProcessingPipeline';
import { isMultilingualModel, getLanguageName, showLanguageSelector } from './languageSelector';
import { LanguageHistory, LanguageProfileManager, checkLanguageModelCompat, suggestModelForLanguage, formatLanguageDisplay } from './multiLanguage';
import { WakeWordDetector } from './wakeWord';
import { StreamingBuffer } from './streamingTranscription';
import { tryExecuteMacro, VoiceMacroManager } from './voiceMacros';
import { WalkyTalkyDetector } from './walkyTalky';
import { LiveRewritingZone } from './liveRewriting';
import { matchRefactorCommand, executeRefactorCommand } from './voiceRefactoring';
import { matchNavigation, executeNavigation } from './voiceNavigation';
import { matchGitCommand, executeGitCommand } from './voiceGit';
import { matchDebugCommand, executeDebugCommand } from './voiceDebugging';
import { matchTestCommand, executeTestCommand } from './voiceTestRunner';
import { NeuralNoiseReduction, RNNoiseModule } from './neuralNoiseReduction';
import { PerformanceCollector, PerformanceDashboardPanel } from './performanceDashboard';
import { BUILTIN_PACKS, searchPacks, filterByCategory, sortPacks, MacroPack, PackCategory, InstalledPack, getBuiltinPackMacros } from './snippetMarketplace';
import { AdaptiveLearningStore, AdaptiveLearningProcessor, CorrectionTracker, showAdaptiveLearningPanel } from './adaptiveLearning';
import { VoxPilotEventEmitter, VoxPilotEvent, TranscriptEvent } from './extensionApi';
import { correctTranscript, getLlmCorrectionConfig, showCorrectionDiff } from './llmPostCorrection';
import { DictationProfileManager, DictationProfileStatusBar } from './dictationProfiles';
import { ConfidenceIndicatorManager, analyzeConfidence } from './confidenceIndicators';

export class VoxPilotEngine {
  private audio: AudioCapture;
  private vad: VoiceActivityDetector;
  private transcriber: Transcriber | null = null;
  private modelManager: ModelManager;
  private statusBar: StatusBarManager;
  private disposables: vscode.Disposable[] = [];

  private isListening = false;
  private isQuickCapture = false;
  private speechBuffer: Buffer[] = [];
  private lastTranscript = '';
  private audioChunkCount = 0;
  private pendingAudio = Buffer.alloc(0);
  private readonly FRAME_SIZE = 960 * 2; // 30ms at 16kHz mono 16-bit = 960 samples * 2 bytes
  private maxSpeechBytes: number;
  private segmentTranscripts: string[] = [];
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleAutoStopMs: number;
  private outputChannel: vscode.OutputChannel;
  private history: TranscriptHistory;
  private historyStore: HistoryStore;
  private historyPanelView: HistoryPanelView | undefined;
  private sound: SoundFeedback;
  private soundEnabled: boolean;
  private inlineMode: boolean;
  private noiseGate: NoiseGate;
  private adaptiveNR: AdaptiveNoiseReduction | null = null;
  private noiseReductionEnabled: boolean;
  private partialOverlay: PartialOverlay;
  private _pipeline: PostProcessingPipeline;
  private voiceLevelEnabled: boolean;
  private waveformEnabled: boolean;
  private currentLanguage: string;
  private currentModelId: string;
  private isDictating = false;
  private wakeWordDetector: WakeWordDetector;
  private wakeWordActive = false;
  private wakeWordBuffer: Buffer[] = [];
  private wakeWordPendingAudio = Buffer.alloc(0);
  private wakeWordVad: VoiceActivityDetector;
  private wakeWordAudio: AudioCapture | null = null;
  private streamingEnabled: boolean;
  private streamingBuffer: StreamingBuffer;
  private streamingInFlight = false;
  private languageHistory: LanguageHistory;
  private languageProfiles: LanguageProfileManager;
  private multiLanguageEnabled: boolean;
  private voiceMacroManager: VoiceMacroManager;
  private walkyTalkyDetector: WalkyTalkyDetector | null = null;
  private walkyTalkyEnabled: boolean;
  private liveRewritingZone: LiveRewritingZone;
  private liveRewritingEnabled: boolean;
  private neuralNR: NeuralNoiseReduction | null = null;
  private neuralNREnabled: boolean = false;
  private perfCollector: PerformanceCollector;
  private perfDashboardPanel: PerformanceDashboardPanel | undefined;
  private _eventEmitter: VoxPilotEventEmitter;
  private dictationProfileManager: DictationProfileManager;
  private dictationProfileStatusBar: DictationProfileStatusBar | undefined;
  private confidenceManager: ConfidenceIndicatorManager;
  private adaptiveLearningStore: AdaptiveLearningStore;
  private correctionTracker: CorrectionTracker;

  /** Expose pipeline for settings UI */
  get pipeline(): PostProcessingPipeline { return this._pipeline; }

  /** Expose event emitter for extension API */
  get eventEmitter(): VoxPilotEventEmitter { return this._eventEmitter; }

  /** Expose recording state for extension API */
  get recording(): boolean { return this.isListening; }

  /** Expose current model for extension API */
  get model(): string { return this.currentModelId; }

  /** Expose current language for extension API */
  get language(): string { return this.currentLanguage; }

  /** Expose last transcript for extension API */
  get transcript(): string | undefined { return this.lastTranscript || undefined; }

  /** Start recording (for extension API) */
  async apiStartRecording(): Promise<void> { await this.startListening(); }

  /** Stop recording (for extension API) */
  async apiStopRecording(): Promise<void> { await this.stopListening(); }

  constructor(private context: vscode.ExtensionContext, statusBar: StatusBarManager) {
    this.statusBar = statusBar;
    this.audio = new AudioCapture();
    this.modelManager = new ModelManager(context);
    this.outputChannel = vscode.window.createOutputChannel('VoxPilot');
    this.history = new TranscriptHistory(context);
    const maxEntries = vscode.workspace.getConfiguration('voxpilot').get<number>('historyMaxEntries', 100);
    this.historyStore = new HistoryStore(context, maxEntries);
    this.sound = new SoundFeedback(context.globalStorageUri.fsPath);

    const config = vscode.workspace.getConfiguration('voxpilot');
    const sensitivity = config.get<number>('vadSensitivity', 0.5);
    const silenceTimeout = config.get<number>('silenceTimeout', 1500);
    const maxSpeechSec = config.get<number>('maxSpeechDuration', 15);
    this.maxSpeechBytes = maxSpeechSec * 16000 * 2;
    this.soundEnabled = config.get<boolean>('soundFeedback', true);
    this.inlineMode = config.get<boolean>('inlineMode', false);
    this.idleAutoStopMs = (config.get<number>('idleAutoStopSeconds', 0)) * 1000;
    const noiseGateThreshold = config.get<number>('noiseGateThreshold', 0);
    this.noiseGate = new NoiseGate(noiseGateThreshold);
    this.noiseReductionEnabled = config.get<boolean>('noiseReduction', true);
    if (this.noiseReductionEnabled) {
      const nrSensitivity = config.get<number>('noiseReductionSensitivity', 3);
      this.adaptiveNR = new AdaptiveNoiseReduction(nrSensitivity);
    }
    // Neural noise reduction (RNNoise WASM)
    this.neuralNREnabled = config.get<boolean>('neuralNoiseReduction', false);
    if (this.neuralNREnabled) {
      this.initNeuralNoiseReduction(context);
    }
    // Performance metrics collector
    this.perfCollector = new PerformanceCollector();
    // Extension API event emitter
    this._eventEmitter = new VoxPilotEventEmitter();
    // Dictation profiles
    this.dictationProfileManager = new DictationProfileManager();
    this.dictationProfileStatusBar = new DictationProfileStatusBar(this.dictationProfileManager);
    this.dictationProfileManager.onDidChangeProfile(() => {
      this._pipeline.reloadConfig();
      this.dictationProfileManager.applyToPipeline(this._pipeline);
    });
    // Confidence indicators
    this.confidenceManager = new ConfidenceIndicatorManager();
    // Adaptive learning
    this.adaptiveLearningStore = new AdaptiveLearningStore(context);
    this.correctionTracker = new CorrectionTracker(this.adaptiveLearningStore);
    this.partialOverlay = new PartialOverlay();
    this._pipeline = new PostProcessingPipeline();
    // Bind adaptive learning store to the pipeline processor
    const alProcessor = this._pipeline.getProcessor('adaptiveLearning') as AdaptiveLearningProcessor | undefined;
    if (alProcessor) { alProcessor.setStore(this.adaptiveLearningStore); }
    // Apply active profile on startup
    this.dictationProfileManager.applyToPipeline(this._pipeline);
    this.voiceLevelEnabled = config.get<boolean>('voiceLevelIndicator', true);
    this.waveformEnabled = config.get<boolean>('waveformVisualization', true);
    this.currentLanguage = config.get<string>('language', 'auto');
    this.currentModelId = config.get<string>('model', 'moonshine-base');
    this.vad = new VoiceActivityDetector(sensitivity, silenceTimeout);

    // Streaming transcription
    this.streamingEnabled = config.get<boolean>('streamingTranscription', false);
    const streamingWindowMs = config.get<number>('streamingWindowMs', 2000);
    this.streamingBuffer = new StreamingBuffer(streamingWindowMs);

    // Voice macros
    this.voiceMacroManager = new VoiceMacroManager();

    // Live rewriting zone
    this.liveRewritingEnabled = config.get<boolean>('liveRewriting', true);
    this.liveRewritingZone = new LiveRewritingZone();

    // Walky-talky mode
    this.walkyTalkyEnabled = config.get<boolean>('walkyTalky', true);
    if (this.walkyTalkyEnabled) {
      const wtThreshold = config.get<number>('walkyTalkyThresholdMs', 300);
      this.walkyTalkyDetector = new WalkyTalkyDetector(wtThreshold, {
        onHoldStart: () => {
          this.isQuickCapture = true;
          this.startListening();
        },
        onHoldEnd: () => {
          if (this.isListening) {
            this.finalizeSpeech().then(() => this.stopListening());
          }
        },
        onTap: () => {
          this.quickCapture();
        },
      });
    }

    // Multi-language support
    this.multiLanguageEnabled = config.get<boolean>('multiLanguage', true);
    this.languageHistory = new LanguageHistory(5);
    this.languageProfiles = new LanguageProfileManager();
    // Seed history with current language
    if (this.currentLanguage !== 'auto') {
      this.languageHistory.push(this.currentLanguage);
    }

    // Wake word detector
    const wakePhrase = config.get<string>('wakePhrase', 'hey vox');
    this.wakeWordDetector = new WakeWordDetector(wakePhrase);
    this.wakeWordVad = new VoiceActivityDetector(0.4, 800);
    this.wakeWordDetector.onWake(() => this.onWakeWordDetected());
    const wakeWordEnabled = config.get<boolean>('wakeWord', false);
    if (wakeWordEnabled) {
      setTimeout(() => this.startWakeWordListening(), 500);
    }

    // Restore saved audio device preference
    const savedDevice = config.get<string>('audioDevice', '');
    if (savedDevice) {
      this.audio.setDevice(savedDevice);
    }

    this.audio.on('audio', (chunk: Buffer) => this.onAudioChunk(chunk));
    this.audio.on('error', (err: Error) => {
      vscode.window.showErrorMessage(`VoxPilot: ${err.message}`);
      this.statusBar.setError(err.message);
      void this.stopListening();
    });

    const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('voxpilot')) {
        const cfg = vscode.workspace.getConfiguration('voxpilot');
        const sens = cfg.get<number>('vadSensitivity', 0.5);
        const silence = cfg.get<number>('silenceTimeout', 1500);
        const maxSec = cfg.get<number>('maxSpeechDuration', 15);
        this.maxSpeechBytes = maxSec * 16000 * 2;
        this.soundEnabled = cfg.get<boolean>('soundFeedback', true);
        this.inlineMode = cfg.get<boolean>('inlineMode', false);
        this.idleAutoStopMs = (cfg.get<number>('idleAutoStopSeconds', 0)) * 1000;
        const noiseGateVal = cfg.get<number>('noiseGateThreshold', 0);
        this.noiseGate.setThreshold(noiseGateVal);
        const nrEnabled = cfg.get<boolean>('noiseReduction', true);
        if (nrEnabled && !this.adaptiveNR) {
          const nrSens = cfg.get<number>('noiseReductionSensitivity', 3);
          this.adaptiveNR = new AdaptiveNoiseReduction(nrSens);
        } else if (nrEnabled && this.adaptiveNR) {
          const nrSens = cfg.get<number>('noiseReductionSensitivity', 3);
          this.adaptiveNR.setSensitivity(nrSens);
        } else if (!nrEnabled) {
          this.adaptiveNR = null;
        }
        this.noiseReductionEnabled = nrEnabled;
        // Neural noise reduction config change
        const neuralNREnabled = cfg.get<boolean>('neuralNoiseReduction', false);
        if (neuralNREnabled && !this.neuralNREnabled) {
          this.neuralNREnabled = true;
          this.initNeuralNoiseReduction(this.context);
        } else if (!neuralNREnabled && this.neuralNREnabled) {
          this.neuralNREnabled = false;
          if (this.neuralNR) { this.neuralNR.dispose(); this.neuralNR = null; }
        }
        this.vad = new VoiceActivityDetector(sens, silence);
        this.voiceLevelEnabled = cfg.get<boolean>('voiceLevelIndicator', true);
        this.waveformEnabled = cfg.get<boolean>('waveformVisualization', true);
        this.currentLanguage = cfg.get<string>('language', 'auto');
        const newModel = cfg.get<string>('model', 'moonshine-base');
        if (newModel !== this.currentModelId) {
          const oldModel = this.currentModelId;
          this.currentModelId = newModel;
          if (this.transcriber) {
            this.transcriber.dispose().catch(() => {});
            this.transcriber = null;
          }
          this.log(`Model switched: ${oldModel} -> ${newModel}`);
        }
        this._pipeline.reloadConfig();

        // Multi-language config changes
        this.multiLanguageEnabled = cfg.get<boolean>('multiLanguage', true);
        this.languageProfiles.reload();

        // Live rewriting config changes
        this.liveRewritingEnabled = cfg.get<boolean>('liveRewriting', true);

        // Streaming transcription config changes
        this.streamingEnabled = cfg.get<boolean>('streamingTranscription', false);
        const newWindowMs = cfg.get<number>('streamingWindowMs', 2000);
        this.streamingBuffer = new StreamingBuffer(newWindowMs);

        // Walky-talky config changes
        const wtEnabled = cfg.get<boolean>('walkyTalky', true);
        this.walkyTalkyEnabled = wtEnabled;
        if (wtEnabled) {
          const wtThreshold = cfg.get<number>('walkyTalkyThresholdMs', 300);
          if (this.walkyTalkyDetector) {
            this.walkyTalkyDetector.setThreshold(wtThreshold);
          } else {
            this.walkyTalkyDetector = new WalkyTalkyDetector(wtThreshold, {
              onHoldStart: () => {
                this.isQuickCapture = true;
                this.startListening();
              },
              onHoldEnd: () => {
                if (this.isListening) {
                  this.finalizeSpeech().then(() => this.stopListening());
                }
              },
              onTap: () => {
                this.quickCapture();
              },
            });
          }
        } else {
          if (this.walkyTalkyDetector) {
            this.walkyTalkyDetector.reset();
          }
          this.walkyTalkyDetector = null;
        }

        // Wake word config changes
        const wakeEnabled = cfg.get<boolean>('wakeWord', false);
        const newPhrase = cfg.get<string>('wakePhrase', 'hey vox');
        this.wakeWordDetector.setWakePhrase(newPhrase);
        if (wakeEnabled && !this.wakeWordActive && !this.isListening) {
          this.startWakeWordListening();
        } else if (!wakeEnabled && this.wakeWordActive) {
          this.stopWakeWordListening();
        }
      }
    });
    this.disposables.push(configWatcher);
  }

  async toggle(): Promise<void> {
    if (this.isListening) {
      await this.stopListening();
    } else {
      await this.startListening();
    }
  }

  /**
   * Dictation mode: continuous transcription with no VAD cutoff.
   * Speech segments are transcribed and stashed as they come.
   * Only a manual stop (second press) finalizes and delivers.
   */
  async toggleDictation(): Promise<void> {
    if (this.isListening) {
      // Manual stop — finalize everything
      this.isDictating = false;
      await this.finalizeSpeech();
      await this.stopListening();
    } else {
      this.isDictating = true;
      await this.startListening();
    }
  }

  /**
   * Quick capture: start listening, auto-send on silence, then stop.
   * Second press while active cancels.
   */
  /**
   * Walky-talky key down — called when the push-to-talk keybinding is pressed.
   * If walky-talky is enabled, delegates to the detector; otherwise falls through to quickCapture.
   */
  walkyTalkyKeyDown(): void {
    if (this.walkyTalkyEnabled && this.walkyTalkyDetector) {
      this.walkyTalkyDetector.onKeyDown();
    } else {
      this.quickCapture();
    }
  }

  /**
   * Walky-talky key up — called when the push-to-talk keybinding is released.
   */
  walkyTalkyKeyUp(): void {
    if (this.walkyTalkyEnabled && this.walkyTalkyDetector) {
      this.walkyTalkyDetector.onKeyUp();
    }
  }

  async quickCapture(): Promise<void> {
    if (this.isListening) {
      this.isQuickCapture = false;
      await this.finalizeSpeech();
      await this.stopListening();
    } else {
      this.isQuickCapture = true;
      await this.startListening();
    }
  }

  /**
   * Inline voice input: start listening, insert transcript at cursor on silence.
   * Forces inline mode for this capture session regardless of setting.
   * Second press while active cancels.
   */
  async inlineVoiceInput(): Promise<void> {
    if (this.isListening) {
      this.inlineMode = false;
      await this.finalizeSpeech();
      await this.stopListening();
      // Restore setting value
      const config = vscode.workspace.getConfiguration('voxpilot');
      this.inlineMode = config.get<boolean>('inlineMode', false);
    } else {
      if (!vscode.window.activeTextEditor) {
        vscode.window.showWarningMessage('VoxPilot: No active editor — open a file first to use inline mode.');
        return;
      }
      this.inlineMode = true;
      this.isQuickCapture = true;
      await this.startListening();
    }
  }

  async selectAudioDevice(): Promise<void> {
    const devices = AudioCapture.listDevices();
    const items: Array<vscode.QuickPickItem & { deviceId: string }> = [
      { label: '$(mic) System Default', description: 'Use the default audio input', deviceId: '' },
      ...devices.map(d => ({ label: d.name, description: d.id, deviceId: d.id })),
    ];

    if (devices.length === 0) {
      items.push({ label: '$(info) No devices detected', description: 'Only system default is available', deviceId: '' });
    }

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select audio input device',
    });

    if (pick) {
      await vscode.workspace.getConfiguration('voxpilot').update('audioDevice', pick.deviceId, true);
      this.audio.setDevice(pick.deviceId);
      const label = pick.deviceId ? pick.label : 'System Default';
      this.log(`Audio device set: ${label} (${pick.deviceId || 'default'})`);
      vscode.window.showInformationMessage(`VoxPilot: Audio input set to ${label}`);
    }
  }

  async selectLanguage(): Promise<void> {
    const code = await showLanguageSelector();
    if (code) {
      this.currentLanguage = code;
      if (code !== 'auto') {
        this.languageHistory.push(code);
      }
      this.log(`Language set: ${code} (${getLanguageName(code)})`);

      // Check model compatibility when multi-language is enabled
      if (this.multiLanguageEnabled) {
        const compat = checkLanguageModelCompat(code, this.currentModelId);
        if (!compat.compatible && compat.suggestion) {
          const suggested = suggestModelForLanguage(code);
          const action = await vscode.window.showWarningMessage(
            compat.suggestion,
            `Switch to ${suggested}`,
            'Keep current',
          );
          if (action === `Switch to ${suggested}`) {
            await vscode.workspace.getConfiguration('voxpilot').update('model', suggested, true);
            this.log(`Auto-switched model to ${suggested} for ${getLanguageName(code)}`);
          }
        }
      }
    }
  }

  /** Quick toggle between the two most recent languages. */
  async quickToggleLanguage(): Promise<void> {
    if (!this.multiLanguageEnabled) {
      vscode.window.showInformationMessage('VoxPilot: Enable multiLanguage setting to use quick toggle.');
      return;
    }
    const prev = this.languageHistory.previous;
    if (!prev) {
      vscode.window.showInformationMessage('VoxPilot: No previous language to toggle to. Select a language first.');
      return;
    }
    this.currentLanguage = prev;
    this.languageHistory.push(prev);
    await vscode.workspace.getConfiguration('voxpilot').update('language', prev, true);
    const display = formatLanguageDisplay(prev);
    this.statusBar.setDetectedLanguage(prev, getLanguageName(prev));
    this.log(`Quick toggle language: ${display}`);
    vscode.window.showInformationMessage(`VoxPilot: Switched to ${display}`);
  }

  /** Apply a saved language profile (language + model combo). */
  async applyLanguageProfile(): Promise<void> {
    if (!this.multiLanguageEnabled) {
      vscode.window.showInformationMessage('VoxPilot: Enable multiLanguage setting to use profiles.');
      return;
    }
    this.languageProfiles.reload();
    const profiles = this.languageProfiles.getAll();
    if (profiles.length === 0) {
      vscode.window.showInformationMessage('VoxPilot: No language profiles saved. Use "Save Language Profile" to create one.');
      return;
    }
    const items = profiles.map(p => ({
      label: p.name,
      description: `${formatLanguageDisplay(p.language)} · ${p.model}`,
      profile: p,
    }));
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a language profile to apply',
    });
    if (pick) {
      const config = vscode.workspace.getConfiguration('voxpilot');
      await config.update('language', pick.profile.language, true);
      await config.update('model', pick.profile.model, true);
      this.currentLanguage = pick.profile.language;
      if (pick.profile.language !== 'auto') {
        this.languageHistory.push(pick.profile.language);
      }
      this.log(`Applied language profile: ${pick.profile.name} (${pick.profile.language} + ${pick.profile.model})`);
      vscode.window.showInformationMessage(`VoxPilot: Applied profile "${pick.profile.name}"`);
    }
  }

  /** Save the current language + model as a named profile. */
  async saveLanguageProfile(): Promise<void> {
    if (!this.multiLanguageEnabled) {
      vscode.window.showInformationMessage('VoxPilot: Enable multiLanguage setting to use profiles.');
      return;
    }
    const name = await vscode.window.showInputBox({
      prompt: 'Profile name',
      placeHolder: 'e.g. Spanish dictation',
    });
    if (!name) { return; }
    await this.languageProfiles.add({
      name,
      language: this.currentLanguage,
      model: this.currentModelId,
    });
    this.log(`Saved language profile: ${name} (${this.currentLanguage} + ${this.currentModelId})`);
    vscode.window.showInformationMessage(`VoxPilot: Saved profile "${name}"`);
  }

  /** Record a new voice macro via interactive prompts. */
  async recordMacro(): Promise<void> {
    await this.voiceMacroManager.recordMacro();
  }

  /** List and manage voice macros. */
  async listMacros(): Promise<void> {
    await this.voiceMacroManager.listMacros();
  }

  async selectModel(): Promise<void> {
    const models = this.modelManager.getAvailableModels();
    const items = models.map(m => ({
      label: m.info.name,
      description: `${m.info.size}${m.downloaded ? ' (downloaded)' : ''}`,
      id: m.id,
    }));

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select ASR model',
    });

    if (pick) {
      await vscode.workspace.getConfiguration('voxpilot').update('model', pick.id, true);
      if (this.transcriber) {
        await this.transcriber.dispose();
        this.transcriber = null;
      }
      vscode.window.showInformationMessage(`VoxPilot: Switched to ${pick.label}`);
    }
  }

  async showTranscriptHistory(): Promise<void> {
    const text = await this.history.showQuickPick();
    if (text) {
      await this.sendToChat(text);
    }
  }

  /** Open the searchable history webview panel */
  openHistoryPanel(): void {
    const enabled = vscode.workspace.getConfiguration('voxpilot').get<boolean>('historyPanel', true);
    if (!enabled) {
      vscode.window.showInformationMessage('VoxPilot: History panel is disabled. Enable via voxpilot.historyPanel setting.');
      return;
    }
    if (!this.historyPanelView) {
      this.historyPanelView = HistoryPanelView.create(this.context, this.historyStore);
      this.historyPanelView.onInsert(async (text) => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          await editor.edit(eb => eb.insert(editor.selection.active, text));
        }
      });
    }
    this.historyPanelView.show();
  }

  /** Browse the snippet marketplace — pick and install community voice macro packs */
  async browseSnippetMarketplace(): Promise<void> {
    const enabled = vscode.workspace.getConfiguration('voxpilot').get<boolean>('snippetMarketplace', true);
    if (!enabled) {
      vscode.window.showInformationMessage('VoxPilot: Snippet marketplace is disabled. Enable via voxpilot.snippetMarketplace setting.');
      return;
    }

    const installedPacks = this.context.globalState.get<InstalledPack[]>('voxpilot.installedPacks', []);

    // Top-level action picker
    const action = await vscode.window.showQuickPick(
      [
        { label: '$(search) Browse Packs', description: 'Browse available voice macro packs', action: 'browse' },
        { label: '$(list-unordered) Installed Packs', description: `${installedPacks.length} pack(s) installed`, action: 'installed' },
        { label: '$(filter) Browse by Category', description: 'Filter packs by category', action: 'category' },
      ],
      { title: 'VoxPilot Snippet Marketplace', placeHolder: 'What would you like to do?' },
    );
    if (!action) { return; }

    if (action.action === 'installed') {
      await this.showInstalledPacks(installedPacks);
    } else if (action.action === 'category') {
      await this.browseByCategoryPacks();
    } else {
      await this.browseAvailablePacks(installedPacks);
    }
  }

  private async browseAvailablePacks(installedPacks: InstalledPack[]): Promise<void> {
    const sorted = sortPacks(BUILTIN_PACKS, 'popular');
    const installedNames = new Set(installedPacks.map(p => p.name));

    const items = sorted.map(pack => ({
      label: `${installedNames.has(pack.name) ? '$(check) ' : '$(package) '}${pack.name}`,
      description: `v${pack.version} · ${pack.macroCount} macros · ⭐ ${pack.rating ?? '—'}`,
      detail: pack.description,
      pack,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Available Packs',
      placeHolder: 'Select a pack to install',
      matchOnDetail: true,
    });
    if (!picked) { return; }

    if (installedNames.has(picked.pack.name)) {
      const uninstall = await vscode.window.showInformationMessage(
        `"${picked.pack.name}" is already installed. Uninstall it?`,
        'Uninstall', 'Cancel',
      );
      if (uninstall === 'Uninstall') {
        await this.uninstallPack(picked.pack.name);
      }
    } else {
      await this.installPack(picked.pack);
    }
  }

  private async browseByCategoryPacks(): Promise<void> {
    const categories: { label: string; category: PackCategory }[] = [
      { label: '$(symbol-class) Frameworks', category: 'frameworks' },
      { label: '$(code) Languages', category: 'languages' },
      { label: '$(tools) Tools', category: 'tools' },
      { label: '$(beaker) Testing', category: 'testing' },
      { label: '$(rocket) Productivity', category: 'productivity' },
      { label: '$(accessibility) Accessibility', category: 'accessibility' },
      { label: '$(ellipsis) Other', category: 'other' },
    ];

    const picked = await vscode.window.showQuickPick(categories, {
      title: 'Browse by Category',
      placeHolder: 'Select a category',
    });
    if (!picked) { return; }

    const filtered = filterByCategory(BUILTIN_PACKS, picked.category);
    if (filtered.length === 0) {
      vscode.window.showInformationMessage(`No packs available in "${picked.label}" yet.`);
      return;
    }

    const installedPacks = this.context.globalState.get<InstalledPack[]>('voxpilot.installedPacks', []);
    const installedNames = new Set(installedPacks.map(p => p.name));

    const items = filtered.map(pack => ({
      label: `${installedNames.has(pack.name) ? '$(check) ' : '$(package) '}${pack.name}`,
      description: `v${pack.version} · ${pack.macroCount} macros`,
      detail: pack.description,
      pack,
    }));

    const selection = await vscode.window.showQuickPick(items, {
      title: `${picked.label} Packs`,
      placeHolder: 'Select a pack to install',
    });
    if (!selection) { return; }

    if (installedNames.has(selection.pack.name)) {
      vscode.window.showInformationMessage(`"${selection.pack.name}" is already installed.`);
    } else {
      await this.installPack(selection.pack);
    }
  }

  private async showInstalledPacks(installedPacks: InstalledPack[]): Promise<void> {
    if (installedPacks.length === 0) {
      vscode.window.showInformationMessage('No packs installed yet. Browse the marketplace to get started!');
      return;
    }

    const items = installedPacks.map(p => ({
      label: `$(package) ${p.name}`,
      description: `v${p.version} · ${p.macroCount} macros · installed ${new Date(p.installedAt).toLocaleDateString()}`,
      name: p.name,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Installed Packs',
      placeHolder: 'Select a pack to uninstall',
    });
    if (!picked) { return; }

    const confirm = await vscode.window.showWarningMessage(
      `Uninstall "${picked.name}"? Its macros will be removed from your configuration.`,
      { modal: true },
      'Uninstall',
    );
    if (confirm === 'Uninstall') {
      await this.uninstallPack(picked.name);
    }
  }

  private async installPack(pack: MacroPack): Promise<void> {
    // Get the macro definitions for this built-in pack
    const macros = getBuiltinPackMacros(pack.name);
    if (!macros || macros.length === 0) {
      vscode.window.showErrorMessage(`VoxPilot: Pack "${pack.name}" has no macros to install.`);
      return;
    }

    // Merge macros into user's voiceMacroDefinitions
    const config = vscode.workspace.getConfiguration('voxpilot');
    const existing = config.get<any[]>('voiceMacroDefinitions', []);
    const merged = [...existing, ...macros.map(m => ({ ...m, _pack: pack.name }))];
    await config.update('voiceMacroDefinitions', merged, vscode.ConfigurationTarget.Global);

    // Track installed pack
    const installedPacks = this.context.globalState.get<InstalledPack[]>('voxpilot.installedPacks', []);
    installedPacks.push({
      name: pack.name,
      version: pack.version,
      installedAt: new Date().toISOString(),
      macroCount: macros.length,
    });
    await this.context.globalState.update('voxpilot.installedPacks', installedPacks);

    vscode.window.showInformationMessage(`VoxPilot: Installed "${pack.name}" — ${macros.length} voice macros added.`);
  }

  private async uninstallPack(packName: string): Promise<void> {
    // Remove macros tagged with this pack
    const config = vscode.workspace.getConfiguration('voxpilot');
    const existing = config.get<any[]>('voiceMacroDefinitions', []);
    const filtered = existing.filter(m => m._pack !== packName);
    await config.update('voiceMacroDefinitions', filtered, vscode.ConfigurationTarget.Global);

    // Remove from installed list
    const installedPacks = this.context.globalState.get<InstalledPack[]>('voxpilot.installedPacks', []);
    const updated = installedPacks.filter(p => p.name !== packName);
    await this.context.globalState.update('voxpilot.installedPacks', updated);

    vscode.window.showInformationMessage(`VoxPilot: Uninstalled "${packName}".`);
  }

  /** Open the performance dashboard webview panel */
  showPerformanceDashboard(): void {
    const enabled = vscode.workspace.getConfiguration('voxpilot').get<boolean>('performanceDashboard', true);
    if (!enabled) {
      vscode.window.showInformationMessage('VoxPilot: Performance dashboard is disabled. Enable via voxpilot.performanceDashboard setting.');
      return;
    }
    if (!this.perfDashboardPanel) {
      this.perfDashboardPanel = PerformanceDashboardPanel.create(this.context, this.perfCollector);
    }
    this.perfDashboardPanel.show();
  }

  /** Show dictation profile picker */
  async switchDictationProfile(): Promise<void> {
    await this.dictationProfileManager.showProfilePicker();
  }

  /** Dismiss a single confidence indicator */
  dismissConfidenceIndicator(docUri: string, index: number): void {
    this.confidenceManager.dismissIndicator(docUri, index);
  }

  /** Clear all confidence indicators */
  clearConfidenceIndicators(): void {
    this.confidenceManager.clearAll();
  }

  /** Show adaptive learning management panel */
  async manageAdaptiveLearning(): Promise<void> {
    await showAdaptiveLearningPanel(this.adaptiveLearningStore);
  }

  /** Record an explicit correction (from command palette) */
  async recordCorrection(): Promise<void> {
    const original = await vscode.window.showInputBox({
      prompt: 'What was the incorrect transcription?',
      placeHolder: 'e.g. "cube control"',
    });
    if (!original) { return; }

    const corrected = await vscode.window.showInputBox({
      prompt: 'What should it be?',
      placeHolder: 'e.g. "kubectl"',
    });
    if (!corrected) { return; }

    await this.correctionTracker.recordExplicitCorrection(original, corrected);
    vscode.window.showInformationMessage(`VoxPilot: Learned "${original}" → "${corrected}"`);
  }

  async sendLastToChat(): Promise<void> {
    if (!this.lastTranscript) {
      vscode.window.showWarningMessage('VoxPilot: No transcript to send.');
      return;
    }
    await this.sendToChat(this.lastTranscript);
  }

  private async startListening(): Promise<void> {
    // Pause wake word listening while main recording is active
    if (this.wakeWordActive) {
      this.stopWakeWordListening();
    }

    try {
      await this.ensureTranscriber();
    } catch (err: any) {
      vscode.window.showErrorMessage(`VoxPilot: Failed to load model — ${err.message}`);
      this.statusBar.setError('Model load failed');
      return;
    }

    this.speechBuffer = [];
    this.segmentTranscripts = [];
    this.pendingAudio = Buffer.alloc(0);
    this.audioChunkCount = 0;
    this.vad.reset();
    this.noiseGate.reset();
    if (this.adaptiveNR) { this.adaptiveNR.reset(); }
    if (this.neuralNR) { this.neuralNR.reset(); }
    this.streamingBuffer.reset();
    this.streamingInFlight = false;
    this.audio.start();
    this.isListening = true;
    if (this.isDictating) {
      this.statusBar.setDictating();
    } else {
      this.statusBar.setCalibrating();
    }
    this.statusBar.resetWaveform();
    if (this.soundEnabled) { this.sound.playStart(); }
    this._eventEmitter.emit({ type: 'recording-start', timestamp: Date.now() });
    this.log('Listening started');
    this.resetIdleTimer();
  }

  private async stopListening(): Promise<void> {
    // Transcribe any buffered speech before stopping
    if (this.speechBuffer.length > 0) {
      this.log(`Stopping with ${this.speechBuffer.length} buffered chunks, transcribing...`);
      await this.finalizeSpeech();
    }
    this.audio.stop();
    this.clearIdleTimer();
    this.isListening = false;
    this.isQuickCapture = false;
    this.isDictating = false;
    this.audioChunkCount = 0;
    // Cancel live rewriting zone if still active (e.g. user stopped mid-speech)
    if (this.liveRewritingZone.isActive) {
      await this.liveRewritingZone.cancel();
    }
    if (this.soundEnabled) { this.sound.playStop(); }
    this._eventEmitter.emit({ type: 'recording-stop', timestamp: Date.now() });
    this.statusBar.setIdle();
    this.log('Listening stopped');

    // Resume wake word listening if enabled
    const wakeEnabled = vscode.workspace.getConfiguration('voxpilot').get<boolean>('wakeWord', false);
    if (wakeEnabled) {
      this.startWakeWordListening();
    }
  }

  private onAudioChunk(chunk: Buffer): void {
    // Sox sends variable-size chunks. Split into fixed 30ms frames for VAD.
    this.pendingAudio = Buffer.concat([this.pendingAudio, chunk]);

    while (this.pendingAudio.length >= this.FRAME_SIZE) {
      const frame = this.pendingAudio.subarray(0, this.FRAME_SIZE);
      this.pendingAudio = this.pendingAudio.subarray(this.FRAME_SIZE);
      this.processFrame(Buffer.from(frame));
    }
  }

  private processFrame(frame: Buffer): void {
    // Apply neural noise reduction first (if enabled and loaded), then adaptive NR / static gate
    let processedFrame = frame;
    if (this.neuralNREnabled && this.neuralNR?.isLoaded) {
      processedFrame = this.neuralNR.process(processedFrame);
    }
    const gatedFrame = this.adaptiveNR
      ? this.adaptiveNR.process(processedFrame)
      : this.noiseGate.process(processedFrame);
    const result = this.vad.process(gatedFrame);

    this.audioChunkCount++;
    if (this.audioChunkCount % 100 === 1) {
      this.log(
        `Audio: frames=${this.audioChunkCount}, rms=${result.rms.toFixed(4)}, threshold=${result.threshold.toFixed(4)}, speaking=${result.isSpeech}, buffered=${this.speechBuffer.length}`,
      );
    }

    if (result.isSpeech || result.speechEnded) {
      this.speechBuffer.push(gatedFrame);

      // Feed streaming buffer for real-time partial transcription
      if (this.streamingEnabled && result.isSpeech) {
        const ready = this.streamingBuffer.addFrame(gatedFrame);
        if (ready && !this.streamingInFlight) {
          this.triggerStreamingTranscription();
        }
      }
    }

    if (result.speechStarted) {
      this.statusBar.setSpeechDetected();
      this.log('Speech detected');
      this.resetIdleTimer();
      if (this.streamingEnabled) {
        this.streamingBuffer.reset();
      }
      // Start live rewriting zone at cursor when streaming + live rewriting are both on
      if (this.liveRewritingEnabled && this.streamingEnabled && this.inlineMode) {
        this.liveRewritingZone.start();
        this.log('Live rewriting zone started');
      }
    }

    // Update voice level indicator in status bar
    if (this.isListening) {
      if (this.waveformEnabled) {
        if (this.vad.speaking) {
          this.statusBar.setSpeechDetectedWithWaveform(result.rms);
        } else if (result.threshold > 0) {
          this.statusBar.setListeningWithWaveform(result.rms);
        }
      } else if (this.voiceLevelEnabled) {
        const dB = this.rmsToDb(result.rms);
        if (this.vad.speaking) {
          this.statusBar.setSpeechDetectedWithLevel(dB);
        } else if (result.threshold > 0) {
          this.statusBar.setListeningWithLevel(dB);
        }
      }
    }

    // Switch from calibrating to listening once VAD has a threshold
    if (result.threshold > 0 && this.audioChunkCount === 31) {
      if (this.waveformEnabled) {
        this.statusBar.setListeningWithWaveform(result.rms);
      } else if (this.voiceLevelEnabled) {
        this.statusBar.setListeningWithLevel(this.rmsToDb(result.rms));
      } else {
        this.statusBar.setListening();
      }
    }

    // Auto-transcribe if buffer exceeds max duration (model can't handle long audio)
    // Stash the segment transcript and keep listening for more speech
    const totalBytes = this.speechBuffer.reduce((sum, b) => sum + b.length, 0);
    if (result.isSpeech && totalBytes >= this.maxSpeechBytes) {
      this.log(`Max speech duration reached, transcribing segment ${this.segmentTranscripts.length + 1}...`);
      this.transcribeSegment();
      return;
    }

    if (result.speechEnded) {
      // Reset streaming buffer — final transcription will handle the full audio
      if (this.streamingEnabled) {
        this.streamingBuffer.reset();
      }
      if (this.isDictating) {
        // Dictation mode: transcribe segment but keep listening
        this.log(`Speech ended (dictation), transcribing segment ${this.segmentTranscripts.length + 1}...`);
        this.transcribeSegment();
      } else {
        this.log('Speech ended, transcribing and delivering...');
        this.finalizeSpeech().then(() => {
          if (this.isQuickCapture) {
            this.stopListening();
          }
        });
      }
    }
  }

  /** Convert RMS (0–1 linear) to dBFS. */
  private rmsToDb(rms: number): number {
    if (rms <= 0) { return -Infinity; }
    return 20 * Math.log10(rms);
  }

  /** Append a log line with timestamp and model name prefix. */
  private log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${this.currentModelId}: ${message}`);
  }

  /**
   * Initialize RNNoise WASM neural noise reduction.
   * Loads the WASM module lazily from extension assets.
   * Falls back gracefully if loading fails.
   */
  private async initNeuralNoiseReduction(context: vscode.ExtensionContext): Promise<void> {
    try {
      const wasmPath = path.join(context.extensionPath, 'assets', 'rnnoise.wasm');
      const fs = await import('fs');
      if (!fs.existsSync(wasmPath)) {
        this.log('Neural NR: WASM file not found, downloading on first use...');
        // Create assets dir if needed
        const assetsDir = path.join(context.extensionPath, 'assets');
        if (!fs.existsSync(assetsDir)) {
          fs.mkdirSync(assetsDir, { recursive: true });
        }
        // Download RNNoise WASM (~200KB)
        const https = await import('https');
        const wasmUrl = 'https://cdn.jsdelivr.net/npm/rnnoise-wasm@0.2.0/dist/rnnoise.wasm';
        await new Promise<void>((resolve, reject) => {
          const file = fs.createWriteStream(wasmPath);
          https.get(wasmUrl, (response: any) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
              https.get(response.headers.location, (res2: any) => {
                res2.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
              }).on('error', reject);
            } else {
              response.pipe(file);
              file.on('finish', () => { file.close(); resolve(); });
            }
          }).on('error', reject);
        });
        this.log('Neural NR: WASM downloaded successfully');
      }

      // Load WASM and create RNNoise module wrapper
      const wasmBuffer = fs.readFileSync(wasmPath);
      const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
        env: {
          memory: new WebAssembly.Memory({ initial: 256 }),
          emscripten_memcpy_js: () => {},
        },
      });

      const exports = wasmModule.instance.exports as any;
      const rnnoiseModule: RNNoiseModule = {
        createState: () => exports.rnnoise_create ? exports.rnnoise_create() : 0,
        destroyState: (state: number) => exports.rnnoise_destroy?.(state),
        processFrame: (state: number, buffer: Float32Array) => {
          // Copy float32 data into WASM memory, process, copy back
          const ptr = exports.malloc?.(buffer.length * 4) ?? 0;
          if (!ptr || !exports.rnnoise_process_frame) { return 0; }
          const heap = new Float32Array(exports.memory.buffer, ptr, buffer.length);
          heap.set(buffer);
          const vad = exports.rnnoise_process_frame(state, ptr, ptr);
          buffer.set(new Float32Array(exports.memory.buffer, ptr, buffer.length));
          exports.free?.(ptr);
          return vad;
        },
      };

      this.neuralNR = new NeuralNoiseReduction();
      this.neuralNR.initialize(rnnoiseModule);
      this.log('Neural NR: RNNoise WASM initialized successfully');
    } catch (err: any) {
      this.log(`Neural NR: Failed to load (${err.message}), falling back to adaptive noise gate`);
      this.neuralNR = null;
    }
  }

  /**
   * Trigger an intermediate streaming transcription from the rolling buffer.
   * Runs async without blocking the audio pipeline. Shows partial results
   * in the overlay and status bar as the user speaks.
   */
  private async triggerStreamingTranscription(): Promise<void> {
    if (this.streamingInFlight || !this.streamingEnabled) { return; }
    this.streamingInFlight = true;

    try {
      await this.ensureTranscriber();
      const audio = this.streamingBuffer.getAudio();
      const result = await this.transcriber!.transcribeStreaming(audio, {}, this.currentLanguage);
      const text = result.text.trim();
      if (text) {
        this.streamingBuffer.setPartialText(text);
        this.partialOverlay.show(text);
        this.statusBar.setStreamingPartial(text);
        // Update live rewriting zone with partial text
        if (this.liveRewritingEnabled && this.liveRewritingZone.isActive) {
          await this.liveRewritingZone.update(text);
        }
        this._eventEmitter.emit({
          type: 'transcript-partial',
          timestamp: Date.now(),
          data: { text, language: this.currentLanguage, model: this.currentModelId },
        } as TranscriptEvent);
        this.log(`Streaming partial [${this.streamingBuffer.windowCount}]: "${text}"`);
      }
    } catch (err: any) {
      this.log(`Streaming transcription error: ${err.message}`);
    } finally {
      this.streamingInFlight = false;
    }
  }

  /**
   * Transcribe the current speech buffer as a segment without delivering.
   * Used when max speech duration is hit mid-speech.
   */
  private async transcribeSegment(): Promise<void> {
    if (this.speechBuffer.length === 0) { return; }

    await this.ensureTranscriber();

    const audioData = Buffer.concat(this.speechBuffer);
    const chunkCount = this.speechBuffer.length;
    this.speechBuffer = [];
    this.statusBar.setProcessing();

    this.log(`Segment transcribe: ${chunkCount} chunks (${audioData.length} bytes, ~${(audioData.length / 32000).toFixed(1)}s audio)`);

    try {
      const callbacks: StreamingCallbacks = {
        onPartial: (text: string) => {
          this.statusBar.setStreamingPartial(text);
          this.partialOverlay.show(text);
          this.log(`Streaming partial: "${text}"`);
        },
      };
      const result = await this.transcriber!.transcribeStreaming(audioData, callbacks, this.currentLanguage);
      if (result.text.trim()) {
        this.segmentTranscripts.push(result.text.trim());
        this.log(`Segment ${this.segmentTranscripts.length} stored: "${result.text.trim()}"`);
        this.handleDetectedLanguage(result.language);
      }
    } catch (err: any) {
      this.log(`Segment transcription error: ${err.message}`);
    }

    this.partialOverlay.hide();
    if (this.isListening) {
      this.statusBar.setSpeechDetected();
    }
  }

  private async finalizeSpeech(): Promise<void> {
    if (this.speechBuffer.length === 0 && this.segmentTranscripts.length === 0) { return; }

    await this.ensureTranscriber();

    // Transcribe any remaining audio in the buffer
    let finalSegment = '';
    if (this.speechBuffer.length > 0) {
      const audioData = Buffer.concat(this.speechBuffer);
      const chunkCount = this.speechBuffer.length;
      this.speechBuffer = [];
      this.statusBar.setProcessing();

      this.log(`Final segment: ${chunkCount} chunks (${audioData.length} bytes, ~${(audioData.length / 32000).toFixed(1)}s audio)`);

      const audioDurationSec = audioData.length / 32000;
      const transcribeStart = Date.now();
      try {
        const callbacks: StreamingCallbacks = {
          onPartial: (text: string) => {
            this.statusBar.setStreamingPartial(text);
            this.partialOverlay.show(text);
            this.log(`Streaming partial: "${text}"`);
          },
        };
        const result = await this.transcriber!.transcribeStreaming(audioData, callbacks, this.currentLanguage);
        this.log(`Raw transcript: "${result.text}"`);
        finalSegment = result.text.trim();
        this.handleDetectedLanguage(result.language);

        // Record performance metric
        this.perfCollector.record({
          timestamp: Date.now(),
          audioDuration: audioDurationSec,
          processingTimeMs: Date.now() - transcribeStart,
          model: this.currentModelId,
          language: this.currentLanguage,
          transcriptLength: finalSegment.length,
          success: true,
        });
      } catch (err: any) {
        this.log(`Transcription error: ${err.message}`);
        vscode.window.showErrorMessage(`VoxPilot transcription error: ${err.message}`);

        // Record failed metric
        this.perfCollector.record({
          timestamp: Date.now(),
          audioDuration: audioDurationSec,
          processingTimeMs: Date.now() - transcribeStart,
          model: this.currentModelId,
          language: this.currentLanguage,
          transcriptLength: 0,
          success: false,
          error: err.message,
        });
      }
    } else {
      this.statusBar.setProcessing();
    }

    // Hide the partial overlay now that speech is finalized
    this.partialOverlay.hide();

    // Finalize live rewriting zone with the final text
    if (this.liveRewritingZone.isActive) {
      const allSegments = [...this.segmentTranscripts];
      if (finalSegment) { allSegments.push(finalSegment); }
      const finalZoneText = allSegments.join(' ').trim();
      await this.liveRewritingZone.finalize(finalZoneText || undefined);
      this.log('Live rewriting zone finalized');
    }

    // Stitch all segments together
    if (finalSegment) {
      this.segmentTranscripts.push(finalSegment);
    }
    const segmentCount = this.segmentTranscripts.length;

    if (segmentCount > 1) {
      this.log(`Processing ${segmentCount} segments through pipeline`);
    }

    // Run the post-processing pipeline
    const { text, context: pipelineCtx } = this._pipeline.run(this.segmentTranscripts);
    this.segmentTranscripts = [];

    if (pipelineCtx.voiceCommandsApplied > 0) {
      this.log(`Voice commands applied: ${pipelineCtx.voiceCommandsApplied}`);
    }
    if (pipelineCtx.punctuationAdded) {
      this.log('Auto-punctuation: added period');
    }
    if (pipelineCtx.capitalized) {
      this.log('Auto-capitalize: capitalized first letter');
    }

    // Execute any VS Code commands queued by custom voice commands
    if (pipelineCtx.pendingCommands.length > 0) {
      for (const pending of pipelineCtx.pendingCommands) {
        try {
          this.log(`Executing voice command: "${pending.phrase}" → ${pending.command}${pending.args !== undefined ? ` (args: ${JSON.stringify(pending.args)})` : ''}`);
          if (pending.args !== undefined) {
            await vscode.commands.executeCommand(pending.command, pending.args);
          } else {
            await vscode.commands.executeCommand(pending.command);
          }
        } catch (err: any) {
          this.log(`Voice command failed: ${pending.command} — ${err.message}`);
          vscode.window.showWarningMessage(`VoxPilot: Voice command "${pending.phrase}" failed — ${err.message}`);
        }
      }
    }

    if (text) {
      // Check for voice macro match before normal delivery
      try {
        const macroExecuted = await tryExecuteMacro(text);
        if (macroExecuted) {
          this.log(`Voice macro executed for: "${text}"`);
          this.statusBar.setSent(`⚡ ${text}`);
          if (this.isListening) {
            this.statusBar.setListening();
          } else {
            this.statusBar.setIdle();
          }
          return;
        }
      } catch (err: any) {
        this.log(`Voice macro error: ${err.message}`);
      }

      // Check for voice-driven refactoring commands
      const refactorConfig = vscode.workspace.getConfiguration('voxpilot');
      if (refactorConfig.get<boolean>('voiceRefactoring', true)) {
        const refactorMatch = matchRefactorCommand(text);
        if (refactorMatch) {
          this.log(`Voice refactoring: "${refactorMatch.phrase}"${refactorMatch.argument ? ` → "${refactorMatch.argument}"` : ''}`);
          const success = await executeRefactorCommand(refactorMatch);
          if (success) {
            this.statusBar.setSent(`🔧 ${refactorMatch.phrase}${refactorMatch.argument ? ' ' + refactorMatch.argument : ''}`);
          }
          if (this.isListening) {
            this.statusBar.setListening();
          } else {
            this.statusBar.setIdle();
          }
          return;
        }
      }

      // Check for multi-file voice navigation commands
      const navConfig = vscode.workspace.getConfiguration('voxpilot');
      if (navConfig.get<boolean>('voiceNavigation', true)) {
        const navMatch = matchNavigation(text);
        if (navMatch) {
          this.log(`Voice navigation: "${navMatch.trigger}"${navMatch.argument ? ` → "${navMatch.argument}"` : ''}`);
          const success = await executeNavigation(navMatch);
          if (success) {
            this.statusBar.setSent(`🧭 ${navMatch.trigger}${navMatch.argument ? ' ' + navMatch.argument : ''}`);
          }
          if (this.isListening) {
            this.statusBar.setListening();
          } else {
            this.statusBar.setIdle();
          }
          return;
        }
      }

      // Check for voice-driven git commands
      const gitConfig = vscode.workspace.getConfiguration('voxpilot');
      if (gitConfig.get<boolean>('voiceGit', true)) {
        const gitMatch = matchGitCommand(text);
        if (gitMatch) {
          this.log(`Voice git: "${gitMatch.trigger}"${gitMatch.argument ? ` → "${gitMatch.argument}"` : ''}`);
          const success = await executeGitCommand(gitMatch);
          if (success) {
            this.statusBar.setSent(`🔀 ${gitMatch.trigger}${gitMatch.argument ? ' ' + gitMatch.argument : ''}`);
          }
          if (this.isListening) {
            this.statusBar.setListening();
          } else {
            this.statusBar.setIdle();
          }
          return;
        }
      }

      // Check for voice-driven debugging commands
      const debugConfig = vscode.workspace.getConfiguration('voxpilot');
      if (debugConfig.get<boolean>('voiceDebugging', true)) {
        const debugMatch = matchDebugCommand(text);
        if (debugMatch) {
          this.log(`Voice debug: "${debugMatch.trigger}"${debugMatch.argument ? ` → "${debugMatch.argument}"` : ''}`);
          const success = await executeDebugCommand(debugMatch);
          if (success) {
            this.statusBar.setSent(`🐛 ${debugMatch.trigger}${debugMatch.argument ? ' ' + debugMatch.argument : ''}`);
          }
          if (this.isListening) {
            this.statusBar.setListening();
          } else {
            this.statusBar.setIdle();
          }
          return;
        }
      }

      // Check for voice-driven test runner commands
      const testConfig = vscode.workspace.getConfiguration('voxpilot');
      if (testConfig.get<boolean>('voiceTestRunner', true)) {
        const testMatch = matchTestCommand(text);
        if (testMatch) {
          this.log(`Voice test: "${testMatch.trigger}"${testMatch.argument ? ` → "${testMatch.argument}"` : ''}`);
          const success = await executeTestCommand(testMatch);
          if (success) {
            this.statusBar.setSent(`🧪 ${testMatch.trigger}${testMatch.argument ? ' ' + testMatch.argument : ''}`);
          }
          if (this.isListening) {
            this.statusBar.setListening();
          } else {
            this.statusBar.setIdle();
          }
          return;
        }
      }

      // LLM post-correction: optionally fix transcription errors using file context
      let finalText = text;
      const llmConfig = getLlmCorrectionConfig();
      if (llmConfig.enabled) {
        try {
          const correction = await correctTranscript(text, llmConfig);
          if (correction.changed) {
            if (llmConfig.showDiff) {
              const accepted = await showCorrectionDiff(correction);
              if (accepted) {
                finalText = correction.corrected;
                this.log(`LLM correction accepted: "${text}" → "${finalText}" (model: ${correction.model})`);
              } else {
                this.log(`LLM correction rejected: "${text}" → "${correction.corrected}"`);
              }
            } else {
              finalText = correction.corrected;
              this.log(`LLM auto-corrected: "${text}" → "${finalText}" (model: ${correction.model})`);
            }
          }
        } catch (err: any) {
          this.log(`LLM post-correction error: ${err.message}`);
        }
      }

      this.lastTranscript = finalText;
      this.history.add(this.lastTranscript);
      this.historyStore.add(this.lastTranscript, {
        language: this.currentLanguage !== 'auto' ? this.currentLanguage : undefined,
        model: this.currentModelId,
      });
      this._eventEmitter.emit({
        type: 'transcript-complete',
        timestamp: Date.now(),
        data: {
          text: this.lastTranscript,
          language: this.currentLanguage !== 'auto' ? this.currentLanguage : undefined,
          model: this.currentModelId,
        },
      } as TranscriptEvent);
      this.log(`Transcript: ${this.lastTranscript}`);

      const config = vscode.workspace.getConfiguration('voxpilot');
      const outputAction = config.get<string>('outputAction', 'ask');

      if (this.inlineMode || outputAction === 'cursor') {
        const editor = vscode.window.activeTextEditor;
        const insertOffset = editor ? editor.document.offsetAt(editor.selection.active) : undefined;
        await this.insertAtCursor(this.lastTranscript);
        if (shouldAutoSubmit('cursor')) {
          await this.insertAtCursor('\n');
        }
        this.statusBar.setSent(this.lastTranscript);
        this.log(`Inserted at cursor (autoSubmit=${shouldAutoSubmit('cursor')})`);

        // Apply confidence indicators to the inserted text
        if (this.confidenceManager.enabled && editor && insertOffset !== undefined) {
          const confidenceResult = analyzeConfidence(this.lastTranscript, undefined, this.confidenceManager.threshold);
          if (confidenceResult.uncertainWords.length > 0) {
            this.confidenceManager.applyForRange(editor, insertOffset, confidenceResult);
            this.log(`Confidence indicators: ${confidenceResult.uncertainWords.length} uncertain word(s) marked`);
          }
        }
      } else if (outputAction === 'chat' || config.get<boolean>('autoSendToChat', false)) {
        await this.sendToChat(this.lastTranscript);
        this.statusBar.setSent(this.lastTranscript);
      } else if (outputAction === 'clipboard') {
        await vscode.env.clipboard.writeText(this.lastTranscript);
        this.statusBar.setSent(this.lastTranscript);
        this.log('Copied to clipboard');
        vscode.window.showInformationMessage(`VoxPilot: Transcript copied to clipboard.`);
      } else if (outputAction === 'terminal') {
        await this.sendToTerminal(this.lastTranscript);
        this.statusBar.setSent(this.lastTranscript);
      } else {
        this.showTranscriptNotification(this.lastTranscript);
        this.statusBar.setSent(this.lastTranscript);
      }
    } else {
      this.log('Transcript was empty');
    }

    if (this.isListening) {
      this.statusBar.setListening();
    } else {
      this.statusBar.setIdle();
    }
  }

  private showTranscriptNotification(text: string): void {
    const truncated = text.length > 80 ? text.slice(0, 80) + '…' : text;
    vscode.window.showInformationMessage(
      `🎙️ ${truncated}`,
      'Send to Chat',
      'Copy',
      'Insert at Cursor',
      'Send to Terminal',
    ).then(async action => {
      if (action === 'Send to Chat') { await this.sendToChat(text); }
      else if (action === 'Copy') { await vscode.env.clipboard.writeText(text); }
      else if (action === 'Insert at Cursor') { await this.insertAtCursor(text); }
      else if (action === 'Send to Terminal') { await this.sendToTerminal(text); }
    });
  }

  /** Detect the host IDE from vscode.env.appName. */
  private detectIDE(): 'kiro' | 'cursor' | 'windsurf' | 'zed' | 'vscode' {
    const name = vscode.env.appName.toLowerCase();
    if (name.includes('kiro')) { return 'kiro'; }
    if (name.includes('cursor')) { return 'cursor'; }
    if (name.includes('windsurf')) { return 'windsurf'; }
    if (name.includes('zed')) { return 'zed'; }
    return 'vscode';
  }

  private async sendToChat(text: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('voxpilot');
    const participant = config.get<string>('targetChatParticipant', '');
    const autoSubmit = shouldAutoSubmit('chat');
    const ide = this.detectIDE();
    const query = (ide === 'vscode' && participant) ? `@${participant} ${text}` : text;

    this.log(`sendToChat: "${query.slice(0, 50)}..." ide=${ide} autoSubmit=${autoSubmit}`);

    if (ide === 'kiro') {
      // Kiro-specific: focus chat panel, paste transcript, optionally submit
      try {
        await vscode.commands.executeCommand('kiroAgent.acpChatView.focus');
        await new Promise(r => setTimeout(r, 400));

        const original = await vscode.env.clipboard.readText();
        await vscode.env.clipboard.writeText(query);
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        await new Promise(r => setTimeout(r, 150));
        if (autoSubmit) {
          await vscode.commands.executeCommand('workbench.action.chat.submit');
        }
        await vscode.env.clipboard.writeText(original);
        this.log(`${autoSubmit ? 'Sent to' : 'Typed into'} Kiro chat`);
        return;
      } catch (e: any) {
        this.log(`Kiro chat delivery failed: ${e.message}`);
      }
    } else if (ide === 'cursor') {
      // Cursor IDE: try composer/chat commands, then clipboard-paste fallback
      if (await this.sendToCursorChat(query, autoSubmit)) { return; }
    } else if (ide === 'windsurf') {
      // Windsurf IDE: try Cascade/Windsurf-specific commands, then clipboard-paste fallback
      if (await this.sendToWindsurfChat(query, autoSubmit)) { return; }
    } else if (ide === 'zed') {
      // Zed IDE: try Zed assistant commands, then clipboard-paste fallback
      if (await this.sendToZedChat(query, autoSubmit)) { return; }
    } else {
      // Standard VS Code
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query,
          isPartialQuery: !autoSubmit,
        });
        this.log(`${autoSubmit ? 'Sent' : 'Typed'} via chat.open query arg`);
        return;
      } catch (e: any) {
        this.log(`chat.open query failed: ${e.message}`);
      }
    }

    // Final fallback: clipboard
    await vscode.env.clipboard.writeText(query);
    const pasteHint = process.platform === 'darwin' ? 'Cmd+V' : 'Ctrl+V';
    vscode.window.showInformationMessage(`VoxPilot: Transcript copied to clipboard. Paste into chat with ${pasteHint}.`);
    this.log('Fallback: copied to clipboard');
  }

  /**
   * Cursor IDE chat delivery.
   * Cursor is a VS Code fork whose chat panel uses different command IDs.
   * We try multiple known commands in priority order, then fall back to
   * focusing the chat panel and pasting via clipboard.
   */
  private async sendToCursorChat(query: string, autoSubmit: boolean): Promise<boolean> {
    // Strategy 1: Try Cursor's composer command (opens inline chat with text)
    const cursorCommands = [
      'aipanel.newchat.send',
      'composerAction.startComposerPrompt',
      'aichat.newchataction',
    ];

    for (const cmd of cursorCommands) {
      try {
        const allCommands = await vscode.commands.getCommands(true);
        if (!allCommands.includes(cmd)) { continue; }

        await vscode.commands.executeCommand(cmd, { text: query });
        this.log(`Sent via Cursor command: ${cmd}`);
        return true;
      } catch (e: any) {
        this.log(`Cursor command ${cmd} failed: ${e.message}`);
      }
    }

    // Strategy 2: Try standard chat.open — some Cursor versions still support it
    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query,
        isPartialQuery: !autoSubmit,
      });
      this.log('Cursor: chat.open succeeded');
      return true;
    } catch (e: any) {
      this.log(`Cursor: chat.open failed: ${e.message}`);
    }

    // Strategy 3: Focus chat panel and paste via clipboard
    const focusCommands = [
      'aipanel.focus',
      'workbench.panel.aichat.view.aichat.focus',
      'workbench.action.chat.open',
    ];

    for (const cmd of focusCommands) {
      try {
        const allCommands = await vscode.commands.getCommands(true);
        if (!allCommands.includes(cmd)) { continue; }

        await vscode.commands.executeCommand(cmd);
        await new Promise(r => setTimeout(r, 400));

        const original = await vscode.env.clipboard.readText();
        await vscode.env.clipboard.writeText(query);
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        await new Promise(r => setTimeout(r, 150));
        if (autoSubmit) {
          // Try Cursor-specific submit, then standard
          try {
            await vscode.commands.executeCommand('aichat.submit');
          } catch {
            try {
              await vscode.commands.executeCommand('workbench.action.chat.submit');
            } catch { /* submit not available — user presses Enter */ }
          }
        }
        await vscode.env.clipboard.writeText(original);
        this.log(`${autoSubmit ? 'Sent to' : 'Typed into'} Cursor chat via clipboard paste (${cmd})`);
        return true;
      } catch (e: any) {
        this.log(`Cursor focus via ${cmd} failed: ${e.message}`);
      }
    }

    return false;
  }

  /**
   * Windsurf IDE chat delivery.
   * Windsurf (Codeium) is a VS Code fork with its own AI chat panel called Cascade.
   * We try Windsurf-specific commands first, then standard chat.open, then clipboard paste.
   */
  private async sendToWindsurfChat(query: string, autoSubmit: boolean): Promise<boolean> {
    // Strategy 1: Try Windsurf/Cascade-specific chat commands
    const windsurfCommands = [
      'windsurf.newChat',
      'cascade.sendMessage',
      'windsurf.cascade.send',
      'codeium.chatPanelSend',
    ];

    for (const cmd of windsurfCommands) {
      try {
        const allCommands = await vscode.commands.getCommands(true);
        if (!allCommands.includes(cmd)) { continue; }

        await vscode.commands.executeCommand(cmd, { text: query });
        this.log(`Sent via Windsurf command: ${cmd}`);
        return true;
      } catch (e: any) {
        this.log(`Windsurf command ${cmd} failed: ${e.message}`);
      }
    }

    // Strategy 2: Try standard chat.open — some Windsurf versions may support it
    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query,
        isPartialQuery: !autoSubmit,
      });
      this.log('Windsurf: chat.open succeeded');
      return true;
    } catch (e: any) {
      this.log(`Windsurf: chat.open failed: ${e.message}`);
    }

    // Strategy 3: Focus Cascade panel and paste via clipboard
    const focusCommands = [
      'windsurf.cascade.focus',
      'codeium.chatPanelFocus',
      'workbench.panel.chat.view.focus',
      'workbench.action.chat.open',
    ];

    for (const cmd of focusCommands) {
      try {
        const allCommands = await vscode.commands.getCommands(true);
        if (!allCommands.includes(cmd)) { continue; }

        await vscode.commands.executeCommand(cmd);
        await new Promise(r => setTimeout(r, 400));

        const original = await vscode.env.clipboard.readText();
        await vscode.env.clipboard.writeText(query);
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        await new Promise(r => setTimeout(r, 150));
        if (autoSubmit) {
          // Try Windsurf-specific submit, then standard
          try {
            await vscode.commands.executeCommand('cascade.submit');
          } catch {
            try {
              await vscode.commands.executeCommand('workbench.action.chat.submit');
            } catch { /* submit not available — user presses Enter */ }
          }
        }
        await vscode.env.clipboard.writeText(original);
        this.log(`${autoSubmit ? 'Sent to' : 'Typed into'} Windsurf Cascade via clipboard paste (${cmd})`);
        return true;
      } catch (e: any) {
        this.log(`Windsurf focus via ${cmd} failed: ${e.message}`);
      }
    }

    return false;
  }

  /**
   * Zed IDE chat delivery.
   * Zed has its own built-in AI assistant panel. When running VoxPilot through
   * Zed's VS Code extension compatibility layer, we try Zed-specific assistant
   * commands first, then standard chat.open, then clipboard paste.
   */
  private async sendToZedChat(query: string, autoSubmit: boolean): Promise<boolean> {
    // Strategy 1: Try Zed assistant-specific commands
    const zedCommands = [
      'assistant.sendMessage',
      'assistant.newContext',
      'zed.assistant.send',
      'assistant.open',
    ];

    for (const cmd of zedCommands) {
      try {
        const allCommands = await vscode.commands.getCommands(true);
        if (!allCommands.includes(cmd)) { continue; }

        await vscode.commands.executeCommand(cmd, { text: query });
        this.log(`Sent via Zed command: ${cmd}`);
        return true;
      } catch (e: any) {
        this.log(`Zed command ${cmd} failed: ${e.message}`);
      }
    }

    // Strategy 2: Try standard chat.open — Zed may support it via compat layer
    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query,
        isPartialQuery: !autoSubmit,
      });
      this.log('Zed: chat.open succeeded');
      return true;
    } catch (e: any) {
      this.log(`Zed: chat.open failed: ${e.message}`);
    }

    // Strategy 3: Focus assistant panel and paste via clipboard
    const focusCommands = [
      'assistant.focus',
      'zed.assistant.focus',
      'workbench.action.chat.open',
    ];

    for (const cmd of focusCommands) {
      try {
        const allCommands = await vscode.commands.getCommands(true);
        if (!allCommands.includes(cmd)) { continue; }

        await vscode.commands.executeCommand(cmd);
        await new Promise(r => setTimeout(r, 400));

        const original = await vscode.env.clipboard.readText();
        await vscode.env.clipboard.writeText(query);
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        await new Promise(r => setTimeout(r, 150));
        if (autoSubmit) {
          try {
            await vscode.commands.executeCommand('assistant.submit');
          } catch {
            try {
              await vscode.commands.executeCommand('workbench.action.chat.submit');
            } catch { /* submit not available — user presses Enter */ }
          }
        }
        await vscode.env.clipboard.writeText(original);
        this.log(`${autoSubmit ? 'Sent to' : 'Typed into'} Zed assistant via clipboard paste (${cmd})`);
        return true;
      } catch (e: any) {
        this.log(`Zed focus via ${cmd} failed: ${e.message}`);
      }
    }

    return false;
  }

  private async insertAtCursor(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, text);
      });
      this.log('Inserted at cursor (editor)');
    } else {
      // Newline: simulate keypress instead of clipboard round-trip
      if (text === '\n') {
        await vscode.commands.executeCommand('type', { text: '\n' });
        this.log('Inserted newline (type command)');
        return;
      }
      const original = await vscode.env.clipboard.readText();
      await vscode.env.clipboard.writeText(text);
      try {
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        await new Promise(r => setTimeout(r, 150));
        await vscode.env.clipboard.writeText(original);
        this.log('Inserted at cursor (clipboard fallback)');
      } catch {
        // Paste failed (no focused input) - leave transcript on clipboard and notify
        this.log('Clipboard paste failed - transcript copied to clipboard');
        vscode.window.showInformationMessage('VoxPilot: Transcript copied to clipboard (no active input to paste into).');
      }
    }
  }

  /**
   * Send transcript text to the active integrated terminal.
   * Creates a new terminal if none exists. Does NOT execute (no Enter) —
   * the text is typed into the terminal for the user to review and submit.
   * Set voxpilot.terminalAutoExecute to true to auto-press Enter.
   */
  private async sendToTerminal(text: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('voxpilot');
    const autoExecute = config.get<boolean>('terminalAutoExecute', false);

    let terminal = vscode.window.activeTerminal;
    if (!terminal) {
      terminal = vscode.window.createTerminal('VoxPilot');
      this.log('Created new terminal for voice input');
    }
    terminal.show(true); // preserveFocus = true

    if (autoExecute) {
      terminal.sendText(text, true); // true = append newline (execute)
      this.log(`Sent to terminal (executed): "${text.slice(0, 50)}..."`);
    } else {
      terminal.sendText(text, false); // false = no newline (type only)
      this.log(`Sent to terminal (typed, not executed): "${text.slice(0, 50)}..."`);
    }
  }

  /**
   * Reset the idle auto-stop timer. Called when listening starts and on each speech detection.
   * When the timer expires without speech, recording stops automatically.
   */
  private resetIdleTimer(): void {
    this.clearIdleTimer();
    if (this.idleAutoStopMs > 0 && this.isListening) {
      this.idleTimer = setTimeout(() => {
        if (this.isListening) {
          this.log(`Idle auto-stop: no speech for ${this.idleAutoStopMs / 1000}s, stopping`);
          vscode.window.showInformationMessage(`VoxPilot: Recording stopped — idle for ${this.idleAutoStopMs / 1000}s`);
          this.finalizeSpeech().then(() => this.stopListening());
        }
      }, this.idleAutoStopMs);
    }
  }

  /** Clear the idle auto-stop timer */
  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /** Show detected language in status bar for Whisper auto-detect mode. */
  private handleDetectedLanguage(language?: string): void {
    if (!language) { return; }
    const config = vscode.workspace.getConfiguration('voxpilot');
    const modelId = config.get<string>('model', 'moonshine-base');
    if (!isMultilingualModel(modelId)) { return; }

    const langName = getLanguageName(language);
    this.statusBar.setDetectedLanguage(language, langName);
    this.log(`Detected language: ${langName} (${language})`);

    // Track detected languages in history for quick toggle
    if (this.multiLanguageEnabled && language !== 'auto') {
      this.languageHistory.push(language);
    }
  }

  private async ensureTranscriber(): Promise<void> {
    if (this.transcriber) { return; }

    const config = vscode.workspace.getConfiguration('voxpilot');
    const modelId = config.get<string>('model', 'moonshine-base');

    const runtimeDir = await this.modelManager.ensureOnnxRuntime();
    const cacheDir = path.join(this.context.globalStorageUri.fsPath, 'hf-cache');
    const transcriber = new Transcriber(modelId, runtimeDir, cacheDir);
    try {
      await transcriber.load();
    } catch (err: unknown) {
      // Ensure the transcriber is not left in a half-initialized state
      // so the next call to ensureTranscriber() will retry initialization
      await transcriber.dispose();
      throw err;
    }
    this.transcriber = transcriber;
    this.log(`Model loaded: ${modelId}`);
  }

  /**
   * Start always-on wake word listening using a separate audio capture.
   * Captures short audio windows, runs VAD, and transcribes speech-only
   * segments to check for the wake phrase.
   */
  private startWakeWordListening(): void {
    if (this.wakeWordActive || this.isListening) { return; }

    this.wakeWordAudio = new AudioCapture();
    this.wakeWordBuffer = [];
    this.wakeWordPendingAudio = Buffer.alloc(0);
    this.wakeWordVad.reset();
    this.wakeWordDetector.enable();
    this.wakeWordDetector.resetCooldown();

    this.wakeWordAudio.on('audio', (chunk: Buffer) => this.onWakeWordAudioChunk(chunk));
    this.wakeWordAudio.on('error', (err: Error) => {
      this.log(`Wake word audio error: ${err.message}`);
      this.stopWakeWordListening();
    });

    // Use same device as main audio
    const config = vscode.workspace.getConfiguration('voxpilot');
    const savedDevice = config.get<string>('audioDevice', '');
    if (savedDevice) {
      this.wakeWordAudio.setDevice(savedDevice);
    }

    this.wakeWordAudio.start();
    this.wakeWordActive = true;
    this.log(`Wake word listening started (phrase: "${this.wakeWordDetector.wakePhrase}")`);
  }

  /** Stop wake word listening and clean up the separate audio capture. */
  private stopWakeWordListening(): void {
    if (!this.wakeWordActive) { return; }

    this.wakeWordDetector.disable();
    if (this.wakeWordAudio) {
      this.wakeWordAudio.stop();
      this.wakeWordAudio.dispose();
      this.wakeWordAudio = null;
    }
    this.wakeWordBuffer = [];
    this.wakeWordPendingAudio = Buffer.alloc(0);
    this.wakeWordActive = false;
    this.log('Wake word listening stopped');
  }

  /** Process audio chunks from the wake word audio capture. */
  private onWakeWordAudioChunk(chunk: Buffer): void {
    this.wakeWordPendingAudio = Buffer.concat([this.wakeWordPendingAudio, chunk]);

    while (this.wakeWordPendingAudio.length >= this.FRAME_SIZE) {
      const frame = this.wakeWordPendingAudio.subarray(0, this.FRAME_SIZE);
      this.wakeWordPendingAudio = this.wakeWordPendingAudio.subarray(this.FRAME_SIZE);
      this.processWakeWordFrame(Buffer.from(frame));
    }
  }

  /** Run VAD on wake word frames and transcribe when speech ends. */
  private processWakeWordFrame(frame: Buffer): void {
    const result = this.wakeWordVad.process(frame);

    if (result.isSpeech || result.speechEnded) {
      this.wakeWordBuffer.push(frame);
    }

    // Limit buffer to ~3 seconds to avoid transcribing long audio
    const totalBytes = this.wakeWordBuffer.reduce((sum, b) => sum + b.length, 0);
    if (totalBytes > 3 * 16000 * 2) {
      // Too long for a wake phrase — discard and reset
      this.wakeWordBuffer = [];
      this.wakeWordVad.reset();
      return;
    }

    if (result.speechEnded && this.wakeWordBuffer.length > 0) {
      this.transcribeWakeWordBuffer();
    }
  }

  /** Transcribe the wake word audio buffer and check for the wake phrase. */
  private async transcribeWakeWordBuffer(): Promise<void> {
    if (this.wakeWordBuffer.length === 0) { return; }

    const audioData = Buffer.concat(this.wakeWordBuffer);
    this.wakeWordBuffer = [];

    try {
      await this.ensureTranscriber();
      const result = await this.transcriber!.transcribeStreaming(audioData, {}, this.currentLanguage);
      const text = result.text.trim();
      if (text) {
        this.log(`Wake word heard: "${text}"`);
        this.wakeWordDetector.checkTranscript(text);
      }
    } catch (err: any) {
      this.log(`Wake word transcription error: ${err.message}`);
    }
  }

  /** Called when the wake word is detected — start full recording. */
  private async onWakeWordDetected(): Promise<void> {
    this.log('Wake word detected! Starting recording...');
    vscode.window.showInformationMessage('🎙️ VoxPilot: Wake word detected — listening...');
    await this.startListening();
  }

  dispose(): void {
    this.stopWakeWordListening();
    if (this.walkyTalkyDetector) { this.walkyTalkyDetector.reset(); }
    void this.stopListening();
    this._eventEmitter.removeAll();
    this.audio.dispose();
    this.sound.dispose();
    this.partialOverlay.dispose();
    if (this.neuralNR) { this.neuralNR.dispose(); this.neuralNR = null; }
    if (this.dictationProfileStatusBar) { this.dictationProfileStatusBar.dispose(); }
    this.dictationProfileManager.dispose();
    this.confidenceManager.dispose();
    this.correctionTracker.dispose();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    // Fire-and-forget async cleanup
    this.transcriber?.dispose().catch(() => {});
    this.transcriber = null;
    this.outputChannel.dispose();
  }
}
