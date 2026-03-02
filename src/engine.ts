import * as vscode from 'vscode';
import * as path from 'path';
import { AudioCapture } from './audioCapture';
import { VoiceActivityDetector } from './vad';
import { Transcriber } from './transcriber';
import { ModelManager } from './modelManager';
import { StatusBarManager } from './statusBar';

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
  private readonly MAX_SPEECH_BYTES = 15 * 16000 * 2; // 15 seconds max
  private outputChannel: vscode.OutputChannel;

  constructor(private context: vscode.ExtensionContext, statusBar: StatusBarManager) {
    this.statusBar = statusBar;
    this.audio = new AudioCapture();
    this.modelManager = new ModelManager(context);
    this.outputChannel = vscode.window.createOutputChannel('VoxPilot');

    const config = vscode.workspace.getConfiguration('voxpilot');
    const sensitivity = config.get<number>('vadSensitivity', 0.5);
    const silenceTimeout = config.get<number>('silenceTimeout', 1500);
    this.vad = new VoiceActivityDetector(sensitivity, silenceTimeout);

    this.audio.on('audio', (chunk: Buffer) => this.onAudioChunk(chunk));
    this.audio.on('error', (err: Error) => {
      vscode.window.showErrorMessage(`VoxPilot: ${err.message}`);
      this.statusBar.setError(err.message);
      this.stopListening();
    });

    const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('voxpilot')) {
        const cfg = vscode.workspace.getConfiguration('voxpilot');
        const sens = cfg.get<number>('vadSensitivity', 0.5);
        const silence = cfg.get<number>('silenceTimeout', 1500);
        this.vad = new VoiceActivityDetector(sens, silence);
      }
    });
    this.disposables.push(configWatcher);
  }

  async toggle(): Promise<void> {
    if (this.isListening) {
      this.stopListening();
    } else {
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
      this.stopListening();
    } else {
      this.isQuickCapture = true;
      await this.startListening();
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
    this.pendingAudio = Buffer.alloc(0);
    this.audioChunkCount = 0;
    this.vad.reset();
    this.audio.start();
    this.isListening = true;
    this.statusBar.setCalibrating();
    this.outputChannel.appendLine(`[${new Date().toISOString()}] Listening started`);
  }

  private stopListening(): void {
    // Transcribe any buffered speech before stopping
    if (this.speechBuffer.length > 0) {
      this.outputChannel.appendLine(`[${new Date().toISOString()}] Stopping with ${this.speechBuffer.length} buffered chunks, transcribing...`);
      this.finalizeSpeech();
    }
    this.audio.stop();
    this.isListening = false;
    this.isQuickCapture = false;
    this.audioChunkCount = 0;
    this.statusBar.setIdle();
    this.outputChannel.appendLine(`[${new Date().toISOString()}] Listening stopped`);
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
    const result = this.vad.process(frame);

    this.audioChunkCount++;
    if (this.audioChunkCount % 100 === 1) {
      this.outputChannel.appendLine(
        `[${new Date().toISOString()}] Audio: frames=${this.audioChunkCount}, rms=${result.rms.toFixed(4)}, threshold=${result.threshold.toFixed(4)}, speaking=${result.isSpeech}, buffered=${this.speechBuffer.length}`,
      );
    }

    if (result.isSpeech || result.speechEnded) {
      this.speechBuffer.push(frame);
    }

    if (result.speechStarted) {
      this.statusBar.setSpeechDetected();
      this.outputChannel.appendLine(`[${new Date().toISOString()}] Speech detected`);
    }

    // Switch from calibrating to listening once VAD has a threshold
    if (result.threshold > 0 && this.audioChunkCount === 31) {
      this.statusBar.setListening();
    }

    // Auto-transcribe if buffer exceeds max duration (model can't handle long audio)
    const totalBytes = this.speechBuffer.reduce((sum, b) => sum + b.length, 0);
    if (result.isSpeech && totalBytes >= this.MAX_SPEECH_BYTES) {
      this.outputChannel.appendLine(`[${new Date().toISOString()}] Max speech duration reached, transcribing segment...`);
      this.finalizeSpeech();
      return;
    }

    if (result.speechEnded) {
      this.outputChannel.appendLine(`[${new Date().toISOString()}] Speech ended, transcribing...`);
      this.finalizeSpeech().then(() => {
        if (this.isQuickCapture) {
          this.stopListening();
        }
      });
    }
  }

  private computeRMS(pcm16: Buffer): number {
    const samples = pcm16.length / 2;
    if (samples === 0) { return 0; }
    let sumSq = 0;
    for (let i = 0; i < pcm16.length; i += 2) {
      const sample = pcm16.readInt16LE(i) / 32768;
      sumSq += sample * sample;
    }
    return Math.sqrt(sumSq / samples);
  }

  private async finalizeSpeech(): Promise<void> {
    if (this.speechBuffer.length === 0) { return; }

    const audioData = Buffer.concat(this.speechBuffer);
    const chunkCount = this.speechBuffer.length;
    this.speechBuffer = [];
    this.statusBar.setProcessing();

    this.outputChannel.appendLine(`[${new Date().toISOString()}] Transcribing ${chunkCount} chunks (${audioData.length} bytes, ~${(audioData.length / 32000).toFixed(1)}s audio)`);

    try {
      const text = await this.transcriber!.transcribe(audioData);
      this.outputChannel.appendLine(`[${new Date().toISOString()}] Raw transcript: "${text}"`);
      if (text.trim()) {
        this.lastTranscript = text.trim();
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Transcript: ${this.lastTranscript}`);

        const config = vscode.workspace.getConfiguration('voxpilot');
        if (config.get<boolean>('autoSendToChat', false)) {
          await this.sendToChat(this.lastTranscript);
          this.statusBar.setSent(this.lastTranscript);
        } else {
          this.showTranscriptNotification(this.lastTranscript);
          this.statusBar.setSent(this.lastTranscript);
        }
      } else {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Transcript was empty`);
      }
    } catch (err: any) {
      this.outputChannel.appendLine(`[${new Date().toISOString()}] Transcription error: ${err.message}`);
      vscode.window.showErrorMessage(`VoxPilot transcription error: ${err.message}`);
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
    ).then(action => {
      if (action === 'Send to Chat') { this.sendToChat(text); }
      else if (action === 'Copy') { vscode.env.clipboard.writeText(text); }
      else if (action === 'Insert at Cursor') { this.insertAtCursor(text); }
    });
  }

  private async sendToChat(text: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('voxpilot');
    const participant = config.get<string>('targetChatParticipant', '');
    const isKiro = vscode.env.appName.toLowerCase().includes('kiro');
    const query = (!isKiro && participant) ? `@${participant} ${text}` : text;

    this.outputChannel.appendLine(`[${new Date().toISOString()}] sendToChat: "${query.slice(0, 50)}..." isKiro=${isKiro}`);

    if (isKiro) {
      // Kiro-specific: focus chat panel, paste transcript, submit
      try {
        await vscode.commands.executeCommand('kiroAgent.acpChatView.focus');
        await new Promise(r => setTimeout(r, 400));

        const original = await vscode.env.clipboard.readText();
        await vscode.env.clipboard.writeText(query);
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        await new Promise(r => setTimeout(r, 150));
        await vscode.commands.executeCommand('workbench.action.chat.submit');
        await vscode.env.clipboard.writeText(original);
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Sent to Kiro chat`);
        return;
      } catch (e: any) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Kiro chat delivery failed: ${e.message}`);
      }
    } else {
      // Standard VS Code
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query,
          isPartialQuery: false,
        });
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Sent via chat.open query arg`);
        return;
      } catch (e: any) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] chat.open query failed: ${e.message}`);
      }
    }

    // Final fallback: clipboard
    await vscode.env.clipboard.writeText(query);
    vscode.window.showInformationMessage(`VoxPilot: Transcript copied to clipboard. Paste into chat with ${isKiro ? 'Cmd' : 'Ctrl'}+V.`);
    this.outputChannel.appendLine(`[${new Date().toISOString()}] Fallback: copied to clipboard`);
  }

  private insertAtCursor(text: string): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, text);
      });
    }
  }

  private async ensureTranscriber(): Promise<void> {
    if (this.transcriber) { return; }

    const config = vscode.workspace.getConfiguration('voxpilot');
    const modelId = config.get<string>('model', 'moonshine-base');

    const runtimeDir = await this.modelManager.ensureOnnxRuntime();
    const cacheDir = path.join(this.context.globalStorageUri.fsPath, 'hf-cache');
    this.transcriber = new Transcriber(modelId, runtimeDir, cacheDir);
    await this.transcriber.load();
    this.outputChannel.appendLine(`Model loaded: ${modelId}`);
  }

  dispose(): void {
    this.stopListening();
    this.audio.dispose();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    // Fire-and-forget async cleanup
    this.transcriber?.dispose().catch(() => {});
    this.transcriber = null;
    this.outputChannel.dispose();
  }
}
