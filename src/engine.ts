import * as vscode from 'vscode';
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
    this.vad.reset();
    this.audio.start();
    this.isListening = true;
    this.statusBar.setListening();
    this.outputChannel.appendLine(`[${new Date().toISOString()}] Listening started`);
  }

  private stopListening(): void {
    this.audio.stop();
    this.isListening = false;
    this.isQuickCapture = false;
    this.statusBar.setIdle();
    this.outputChannel.appendLine(`[${new Date().toISOString()}] Listening stopped`);
  }

  private onAudioChunk(chunk: Buffer): void {
    const result = this.vad.process(chunk);

    if (result.isSpeech || result.speechEnded) {
      this.speechBuffer.push(chunk);
    }

    if (result.speechEnded) {
      this.finalizeSpeech().then(() => {
        if (this.isQuickCapture) {
          this.stopListening();
        }
      });
    }
  }

  private async finalizeSpeech(): Promise<void> {
    if (this.speechBuffer.length === 0) { return; }

    const audioData = Buffer.concat(this.speechBuffer);
    this.speechBuffer = [];
    this.statusBar.setProcessing();

    try {
      const text = await this.transcriber!.transcribe(audioData);
      if (text.trim()) {
        this.lastTranscript = text.trim();
        this.outputChannel.appendLine(`[${new Date().toISOString()}] Transcript: ${this.lastTranscript}`);

        const config = vscode.workspace.getConfiguration('voxpilot');
        if (config.get<boolean>('autoSendToChat', false)) {
          await this.sendToChat(this.lastTranscript);
        } else {
          this.showTranscriptNotification(this.lastTranscript);
        }
      }
    } catch (err: any) {
      this.outputChannel.appendLine(`[${new Date().toISOString()}] Error: ${err.message}`);
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

    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: participant ? `@${participant} ${text}` : text,
      });
    } catch {
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage('VoxPilot: Transcript copied to clipboard (chat API unavailable).');
    }
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
    const modelId = config.get<string>('model', 'moonshine-tiny');

    const modelPath = await this.modelManager.ensureModel(modelId);
    this.transcriber = new Transcriber(modelPath);
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
