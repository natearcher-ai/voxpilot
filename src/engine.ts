import * as vscode from 'vscode';
import * as path from 'path';
import { AudioCapture, AudioDevice } from './audioCapture';
import { VoiceActivityDetector } from './vad';
import { Transcriber, StreamingCallbacks, TranscriptionResult } from './transcriber';
import { ModelManager } from './modelManager';
import { StatusBarManager } from './statusBar';
import { TranscriptHistory } from './transcriptHistory';
import { SoundFeedback } from './soundFeedback';
import { NoiseGate } from './noiseGate';
import { PartialOverlay } from './partialOverlay';
import { shouldAutoSubmit } from './autoSubmitRules';
import { PostProcessingPipeline } from './postProcessingPipeline';
import { isMultilingualModel, getLanguageName, showLanguageSelector } from './languageSelector';

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
  private outputChannel: vscode.OutputChannel;
  private history: TranscriptHistory;
  private sound: SoundFeedback;
  private soundEnabled: boolean;
  private inlineMode: boolean;
  private noiseGate: NoiseGate;
  private partialOverlay: PartialOverlay;
  private _pipeline: PostProcessingPipeline;
  private voiceLevelEnabled: boolean;
  private waveformEnabled: boolean;
  private currentLanguage: string;
  private currentModelId: string;
  private isDictating = false;

  /** Expose pipeline for settings UI */
  get pipeline(): PostProcessingPipeline { return this._pipeline; }

  constructor(private context: vscode.ExtensionContext, statusBar: StatusBarManager) {
    this.statusBar = statusBar;
    this.audio = new AudioCapture();
    this.modelManager = new ModelManager(context);
    this.outputChannel = vscode.window.createOutputChannel('VoxPilot');
    this.history = new TranscriptHistory(context);
    this.sound = new SoundFeedback(context.globalStorageUri.fsPath);

    const config = vscode.workspace.getConfiguration('voxpilot');
    const sensitivity = config.get<number>('vadSensitivity', 0.5);
    const silenceTimeout = config.get<number>('silenceTimeout', 1500);
    const maxSpeechSec = config.get<number>('maxSpeechDuration', 15);
    this.maxSpeechBytes = maxSpeechSec * 16000 * 2;
    this.soundEnabled = config.get<boolean>('soundFeedback', true);
    this.inlineMode = config.get<boolean>('inlineMode', false);
    const noiseGateThreshold = config.get<number>('noiseGateThreshold', 0);
    this.noiseGate = new NoiseGate(noiseGateThreshold);
    this.partialOverlay = new PartialOverlay();
    this._pipeline = new PostProcessingPipeline();
    this.voiceLevelEnabled = config.get<boolean>('voiceLevelIndicator', true);
    this.waveformEnabled = config.get<boolean>('waveformVisualization', true);
    this.currentLanguage = config.get<string>('language', 'auto');
    this.currentModelId = config.get<string>('model', 'moonshine-base');
    this.vad = new VoiceActivityDetector(sensitivity, silenceTimeout);

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
        const noiseGateVal = cfg.get<number>('noiseGateThreshold', 0);
        this.noiseGate.setThreshold(noiseGateVal);
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
      this.log(`Language set: ${code} (${getLanguageName(code)})`);
    }
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

  async sendLastToChat(): Promise<void> {
    if (!this.lastTranscript) {
      vscode.window.showWarningMessage('VoxPilot: No transcript to send.');
      return;
    }
    await this.sendToChat(this.lastTranscript);
  }

  private async startListening(): Promise<void> {
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
    this.audio.start();
    this.isListening = true;
    if (this.isDictating) {
      this.statusBar.setDictating();
    } else {
      this.statusBar.setCalibrating();
    }
    this.statusBar.resetWaveform();
    if (this.soundEnabled) { this.sound.playStart(); }
    this.log('Listening started');
  }

  private async stopListening(): Promise<void> {
    // Transcribe any buffered speech before stopping
    if (this.speechBuffer.length > 0) {
      this.log(`Stopping with ${this.speechBuffer.length} buffered chunks, transcribing...`);
      await this.finalizeSpeech();
    }
    this.audio.stop();
    this.isListening = false;
    this.isQuickCapture = false;
    this.isDictating = false;
    this.audioChunkCount = 0;
    if (this.soundEnabled) { this.sound.playStop(); }
    this.statusBar.setIdle();
    this.log('Listening stopped');
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
    // Apply noise gate before VAD — zero out frames below threshold
    const gatedFrame = this.noiseGate.process(frame);
    const result = this.vad.process(gatedFrame);

    this.audioChunkCount++;
    if (this.audioChunkCount % 100 === 1) {
      this.log(
        `Audio: frames=${this.audioChunkCount}, rms=${result.rms.toFixed(4)}, threshold=${result.threshold.toFixed(4)}, speaking=${result.isSpeech}, buffered=${this.speechBuffer.length}`,
      );
    }

    if (result.isSpeech || result.speechEnded) {
      this.speechBuffer.push(frame);
    }

    if (result.speechStarted) {
      this.statusBar.setSpeechDetected();
      this.log('Speech detected');
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
   * Transcribe the current speech buffer as a segment without delivering.
   * Used when max speech duration is hit mid-speech.
   */
  private async transcribeSegment(): Promise<void> {
    if (this.speechBuffer.length === 0) { return; }

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

    // Transcribe any remaining audio in the buffer
    let finalSegment = '';
    if (this.speechBuffer.length > 0) {
      const audioData = Buffer.concat(this.speechBuffer);
      const chunkCount = this.speechBuffer.length;
      this.speechBuffer = [];
      this.statusBar.setProcessing();

      this.log(`Final segment: ${chunkCount} chunks (${audioData.length} bytes, ~${(audioData.length / 32000).toFixed(1)}s audio)`);

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
      } catch (err: any) {
        this.log(`Transcription error: ${err.message}`);
        vscode.window.showErrorMessage(`VoxPilot transcription error: ${err.message}`);
      }
    } else {
      this.statusBar.setProcessing();
    }

    // Hide the partial overlay now that speech is finalized
    this.partialOverlay.hide();

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
      this.lastTranscript = text;
      this.history.add(this.lastTranscript);
      this.log(`Transcript: ${this.lastTranscript}`);

      const config = vscode.workspace.getConfiguration('voxpilot');
      const outputAction = config.get<string>('outputAction', 'ask');

      if (this.inlineMode || outputAction === 'cursor') {
        await this.insertAtCursor(this.lastTranscript);
        if (shouldAutoSubmit('cursor')) {
          await this.insertAtCursor('\n');
        }
        this.statusBar.setSent(this.lastTranscript);
        this.log(`Inserted at cursor (autoSubmit=${shouldAutoSubmit('cursor')})`);
      } else if (outputAction === 'chat' || config.get<boolean>('autoSendToChat', false)) {
        await this.sendToChat(this.lastTranscript);
        this.statusBar.setSent(this.lastTranscript);
      } else if (outputAction === 'clipboard') {
        await vscode.env.clipboard.writeText(this.lastTranscript);
        this.statusBar.setSent(this.lastTranscript);
        this.log('Copied to clipboard');
        vscode.window.showInformationMessage(`VoxPilot: Transcript copied to clipboard.`);
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
    ).then(async action => {
      if (action === 'Send to Chat') { this.sendToChat(text); }
      else if (action === 'Copy') { vscode.env.clipboard.writeText(text); }
      else if (action === 'Insert at Cursor') { await this.insertAtCursor(text); }
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
      editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, text);
      });
      this.log('Inserted at cursor (editor)');
    } else {
      const original = await vscode.env.clipboard.readText();
      await vscode.env.clipboard.writeText(text);
      await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
      await vscode.env.clipboard.writeText(original);
      this.log('Inserted at cursor (clipboard fallback)');
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

  dispose(): void {
    void this.stopListening();
    this.audio.dispose();
    this.sound.dispose();
    this.partialOverlay.dispose();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    // Fire-and-forget async cleanup
    this.transcriber?.dispose().catch(() => {});
    this.transcriber = null;
    this.outputChannel.dispose();
  }
}
