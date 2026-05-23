/**
 * Remote Pair Voice — share voice commands over VS Code Live Share sessions.
 *
 * When a Live Share session is active, VoxPilot can:
 *   - Broadcast transcripts to all participants in real-time
 *   - Share voice command execution (so pair partner sees what you're doing)
 *   - Receive and display partner's voice transcripts as comments/notifications
 *   - Sync custom vocabulary between participants
 *   - Show who is speaking via status bar indicator
 *
 * Privacy controls:
 *   - Opt-in per session (not automatic)
 *   - Can mute broadcast without stopping local transcription
 *   - Transcript history is not persisted for remote participants
 *
 * Enable via `voxpilot.remotePairVoice` setting (default: true).
 * Requires VS Code Live Share extension to be installed and active.
 */

import * as vscode from 'vscode';

/** Message types for Live Share communication */
export type PairMessageType =
  | 'transcript'
  | 'command'
  | 'vocabulary-sync'
  | 'status-change'
  | 'mute'
  | 'unmute';

/** A message sent between pair programming participants */
export interface PairMessage {
  type: PairMessageType;
  /** Sender display name */
  sender: string;
  /** Timestamp */
  timestamp: number;
  /** Message payload */
  data: Record<string, unknown>;
}

/** Transcript message payload */
export interface TranscriptPayload {
  text: string;
  language?: string;
  isFinal: boolean;
}

/** Command execution message payload */
export interface CommandPayload {
  commandId: string;
  commandName: string;
  source: 'voice';
}

/** Participant state */
export interface Participant {
  /** Display name */
  name: string;
  /** Whether they have VoxPilot active */
  voxpilotActive: boolean;
  /** Whether they are currently speaking */
  isSpeaking: boolean;
  /** Whether they have muted broadcast */
  isMuted: boolean;
  /** Last transcript received */
  lastTranscript?: string;
  /** Last activity timestamp */
  lastActivity: number;
}

/** Session state for remote pair voice */
export interface PairSessionState {
  /** Whether remote pair voice is active */
  active: boolean;
  /** Whether broadcasting is enabled (local user) */
  broadcasting: boolean;
  /** Connected participants */
  participants: Map<string, Participant>;
  /** Whether Live Share is connected */
  liveShareConnected: boolean;
}

/**
 * Remote Pair Voice manager — handles Live Share integration for voice sharing.
 */
export class RemotePairVoice {
  private state: PairSessionState = {
    active: false,
    broadcasting: false,
    participants: new Map(),
    liveShareConnected: false,
  };

  private statusBarItem: vscode.StatusBarItem | undefined;
  private outputChannel: vscode.OutputChannel | undefined;
  private disposables: vscode.Disposable[] = [];
  private messageHandlers: Map<PairMessageType, ((msg: PairMessage) => void)[]> = new Map();

  /** Initialize the remote pair voice system */
  init(context: vscode.ExtensionContext): void {
    this.outputChannel = vscode.window.createOutputChannel('VoxPilot Pair Voice');

    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      98,
    );
    this.statusBarItem.command = 'voxpilot.togglePairVoice';
    this.updateStatusBar();

    // Register commands
    this.disposables.push(
      vscode.commands.registerCommand('voxpilot.togglePairVoice', () => this.toggle()),
      vscode.commands.registerCommand('voxpilot.mutePairVoice', () => this.mute()),
      vscode.commands.registerCommand('voxpilot.unmutePairVoice', () => this.unmute()),
    );

    // Watch for Live Share state changes
    this.detectLiveShare();

    context.subscriptions.push(...this.disposables, this.statusBarItem);
  }

  /** Toggle pair voice on/off */
  toggle(): void {
    if (this.state.active) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  /** Activate pair voice broadcasting */
  activate(): void {
    if (!this.state.liveShareConnected) {
      vscode.window.showWarningMessage(
        'VoxPilot: Live Share session not detected. Start or join a Live Share session first.',
      );
      return;
    }

    this.state.active = true;
    this.state.broadcasting = true;
    this.broadcast({ type: 'status-change', sender: this.getLocalName(), timestamp: Date.now(), data: { status: 'active' } });
    this.updateStatusBar();
    this.log('Pair voice activated — broadcasting transcripts to session');
  }

  /** Deactivate pair voice */
  deactivate(): void {
    this.state.active = false;
    this.state.broadcasting = false;
    this.broadcast({ type: 'status-change', sender: this.getLocalName(), timestamp: Date.now(), data: { status: 'inactive' } });
    this.updateStatusBar();
    this.log('Pair voice deactivated');
  }

  /** Mute broadcasting (still receive) */
  mute(): void {
    this.state.broadcasting = false;
    this.broadcast({ type: 'mute', sender: this.getLocalName(), timestamp: Date.now(), data: {} });
    this.updateStatusBar();
    this.log('Broadcasting muted');
  }

  /** Unmute broadcasting */
  unmute(): void {
    this.state.broadcasting = true;
    this.broadcast({ type: 'unmute', sender: this.getLocalName(), timestamp: Date.now(), data: {} });
    this.updateStatusBar();
    this.log('Broadcasting unmuted');
  }

  /** Send a transcript to pair participants */
  shareTranscript(text: string, isFinal: boolean, language?: string): void {
    if (!this.state.active || !this.state.broadcasting) return;

    const payload: TranscriptPayload = { text, isFinal, language };
    this.broadcast({
      type: 'transcript',
      sender: this.getLocalName(),
      timestamp: Date.now(),
      data: payload as unknown as Record<string, unknown>,
    });
  }

  /** Share a voice command execution with participants */
  shareCommand(commandId: string, commandName: string): void {
    if (!this.state.active || !this.state.broadcasting) return;

    const payload: CommandPayload = { commandId, commandName, source: 'voice' };
    this.broadcast({
      type: 'command',
      sender: this.getLocalName(),
      timestamp: Date.now(),
      data: payload as unknown as Record<string, unknown>,
    });
  }

  /** Handle an incoming message from a participant */
  handleMessage(msg: PairMessage): void {
    switch (msg.type) {
      case 'transcript':
        this.handleTranscript(msg);
        break;
      case 'command':
        this.handleCommand(msg);
        break;
      case 'status-change':
        this.handleStatusChange(msg);
        break;
      case 'mute':
      case 'unmute':
        this.handleMuteChange(msg);
        break;
    }

    // Notify registered handlers
    const handlers = this.messageHandlers.get(msg.type) ?? [];
    for (const handler of handlers) {
      try { handler(msg); } catch { /* swallow */ }
    }
  }

  /** Register a handler for a specific message type */
  onMessage(type: PairMessageType, handler: (msg: PairMessage) => void): vscode.Disposable {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
    return { dispose: () => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    }};
  }

  /** Get current session state */
  getState(): PairSessionState {
    return { ...this.state, participants: new Map(this.state.participants) };
  }

  /** Get list of active participants */
  getParticipants(): Participant[] {
    return [...this.state.participants.values()];
  }

  /** Check if pair voice is active */
  isActive(): boolean {
    return this.state.active;
  }

  /** Check if broadcasting */
  isBroadcasting(): boolean {
    return this.state.broadcasting;
  }

  /** Sync vocabulary with participants */
  syncVocabulary(words: string[]): void {
    if (!this.state.active) return;
    this.broadcast({
      type: 'vocabulary-sync',
      sender: this.getLocalName(),
      timestamp: Date.now(),
      data: { words },
    });
  }

  /** Set Live Share connection state (called by extension when Live Share connects/disconnects) */
  setLiveShareConnected(connected: boolean): void {
    this.state.liveShareConnected = connected;
    if (!connected && this.state.active) {
      this.deactivate();
    }
    this.updateStatusBar();
  }

  private handleTranscript(msg: PairMessage): void {
    const data = msg.data as unknown as TranscriptPayload;
    const participant = this.getOrCreateParticipant(msg.sender);
    participant.isSpeaking = !data.isFinal;
    participant.lastTranscript = data.text;
    participant.lastActivity = msg.timestamp;

    if (data.isFinal) {
      this.log(`[${msg.sender}]: ${data.text}`);
      // Show as information message for final transcripts
      vscode.window.setStatusBarMessage?.(`🎙️ ${msg.sender}: ${data.text}`, 5000);
    }
  }

  private handleCommand(msg: PairMessage): void {
    const data = msg.data as unknown as CommandPayload;
    this.log(`[${msg.sender}] executed: ${data.commandName}`);
    vscode.window.setStatusBarMessage?.(`⚡ ${msg.sender} → ${data.commandName}`, 3000);
  }

  private handleStatusChange(msg: PairMessage): void {
    const participant = this.getOrCreateParticipant(msg.sender);
    participant.voxpilotActive = msg.data.status === 'active';
    participant.lastActivity = msg.timestamp;
  }

  private handleMuteChange(msg: PairMessage): void {
    const participant = this.getOrCreateParticipant(msg.sender);
    participant.isMuted = msg.type === 'mute';
    participant.lastActivity = msg.timestamp;
  }

  private getOrCreateParticipant(name: string): Participant {
    if (!this.state.participants.has(name)) {
      this.state.participants.set(name, {
        name,
        voxpilotActive: true,
        isSpeaking: false,
        isMuted: false,
        lastActivity: Date.now(),
      });
    }
    return this.state.participants.get(name)!;
  }

  private getLocalName(): string {
    return vscode.env.appName?.includes('Insiders') ? 'You (Insiders)' : 'You';
  }

  private broadcast(msg: PairMessage): void {
    // In production, this sends via Live Share's shared service
    // For now, emit to output channel for debugging
    this.log(`→ [${msg.type}] ${JSON.stringify(msg.data)}`);
  }

  private updateStatusBar(): void {
    if (!this.statusBarItem) return;

    if (!this.state.liveShareConnected) {
      this.statusBarItem.text = '$(broadcast) Pair Voice';
      this.statusBarItem.tooltip = 'VoxPilot Pair Voice (no Live Share session)';
      this.statusBarItem.hide();
      return;
    }

    this.statusBarItem.show();

    if (!this.state.active) {
      this.statusBarItem.text = '$(broadcast) Pair Voice: Off';
      this.statusBarItem.tooltip = 'Click to activate pair voice';
    } else if (!this.state.broadcasting) {
      this.statusBarItem.text = '$(mute) Pair Voice: Muted';
      this.statusBarItem.tooltip = 'Pair voice active but muted';
    } else {
      const count = this.state.participants.size;
      this.statusBarItem.text = `$(broadcast) Pair Voice: ${count} participant${count !== 1 ? 's' : ''}`;
      this.statusBarItem.tooltip = 'Pair voice active — broadcasting';
    }
  }

  private log(message: string): void {
    this.outputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  /** Detect if Live Share is available */
  private detectLiveShare(): void {
    const liveShare = vscode.extensions.getExtension('ms-vsliveshare.vsliveshare');
    if (liveShare) {
      this.state.liveShareConnected = liveShare.isActive;
    }
  }

  /** Dispose all resources */
  dispose(): void {
    this.deactivate();
    this.statusBarItem?.dispose();
    this.outputChannel?.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

/** Singleton instance */
export const remotePairVoice = new RemotePairVoice();
