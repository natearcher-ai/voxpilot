/**
 * Extension API — public API for other extensions to hook into VoxPilot
 * transcription events and pipeline.
 *
 * Allows third-party extensions to:
 *   - Listen for transcription events (start, partial, complete, error)
 *   - Register custom post-processors in the pipeline
 *   - Trigger recording programmatically
 *   - Query VoxPilot state (listening, model, language)
 *
 * Usage by other extensions:
 *   const voxpilot = vscode.extensions.getExtension('natearcher-ai.voxpilot');
 *   const api = voxpilot?.exports;
 *   api.onTranscript((text) => { ... });
 *   api.registerProcessor({ id: 'my-processor', ... });
 *
 * Enable via `voxpilot.extensionApi` setting (default: true).
 */

import * as vscode from 'vscode';

/** Events emitted by VoxPilot */
export type VoxPilotEventType =
  | 'recording-start'
  | 'recording-stop'
  | 'speech-detected'
  | 'transcript-partial'
  | 'transcript-complete'
  | 'transcript-error'
  | 'model-changed'
  | 'language-changed';

export interface VoxPilotEvent {
  type: VoxPilotEventType;
  timestamp: number;
  data?: unknown;
}

export interface TranscriptEvent extends VoxPilotEvent {
  type: 'transcript-complete' | 'transcript-partial';
  data: {
    text: string;
    language?: string;
    model?: string;
    duration?: number;
    confidence?: number;
  };
}

export interface ErrorEvent extends VoxPilotEvent {
  type: 'transcript-error';
  data: {
    message: string;
    code?: string;
  };
}

/** Callback type for event listeners */
export type EventListener<T extends VoxPilotEvent = VoxPilotEvent> = (event: T) => void;

/**
 * Public API surface exposed to other extensions via `exports`.
 */
export interface VoxPilotAPI {
  /** VoxPilot version */
  readonly version: string;

  /** Whether VoxPilot is currently recording */
  readonly isRecording: boolean;

  /** Current ASR model ID */
  readonly currentModel: string;

  /** Current language code */
  readonly currentLanguage: string;

  /** Subscribe to transcription events */
  onTranscript(callback: (text: string, metadata?: { language?: string; model?: string }) => void): vscode.Disposable;

  /** Subscribe to any VoxPilot event */
  onEvent(type: VoxPilotEventType, callback: EventListener): vscode.Disposable;

  /** Start recording programmatically */
  startRecording(): Promise<void>;

  /** Stop recording programmatically */
  stopRecording(): Promise<void>;

  /** Get the last transcript */
  getLastTranscript(): string | undefined;
}

/**
 * Event emitter for VoxPilot events.
 * Used internally to dispatch events to registered listeners.
 */
export class VoxPilotEventEmitter {
  private listeners: Map<VoxPilotEventType, Set<EventListener>> = new Map();
  private transcriptListeners: Set<(text: string, metadata?: Record<string, unknown>) => void> = new Set();

  /** Register a listener for a specific event type */
  on(type: VoxPilotEventType, callback: EventListener): vscode.Disposable {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    return {
      dispose: () => {
        this.listeners.get(type)?.delete(callback);
      },
    };
  }

  /** Register a transcript-specific listener */
  onTranscript(callback: (text: string, metadata?: Record<string, unknown>) => void): vscode.Disposable {
    this.transcriptListeners.add(callback);
    return {
      dispose: () => {
        this.transcriptListeners.delete(callback);
      },
    };
  }

  /** Emit an event to all registered listeners */
  emit(event: VoxPilotEvent): void {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Don't let listener errors crash VoxPilot
        }
      }
    }

    // Also notify transcript-specific listeners
    if (event.type === 'transcript-complete') {
      const data = (event as TranscriptEvent).data;
      for (const listener of this.transcriptListeners) {
        try {
          listener(data.text, data as Record<string, unknown>);
        } catch {
          // Swallow errors
        }
      }
    }
  }

  /** Get count of listeners for a specific event type */
  listenerCount(type: VoxPilotEventType): number {
    return (this.listeners.get(type)?.size ?? 0) +
      (type === 'transcript-complete' ? this.transcriptListeners.size : 0);
  }

  /** Remove all listeners */
  removeAll(): void {
    this.listeners.clear();
    this.transcriptListeners.clear();
  }

  /** Get all registered event types */
  get registeredTypes(): VoxPilotEventType[] {
    return [...this.listeners.keys()];
  }
}

/**
 * Create the public API object for extension exports.
 */
export function createAPI(
  emitter: VoxPilotEventEmitter,
  getState: () => { isRecording: boolean; model: string; language: string; lastTranscript?: string },
  controls: { start: () => Promise<void>; stop: () => Promise<void> },
  version: string,
): VoxPilotAPI {
  return {
    get version() { return version; },
    get isRecording() { return getState().isRecording; },
    get currentModel() { return getState().model; },
    get currentLanguage() { return getState().language; },

    onTranscript(callback) {
      return emitter.onTranscript(callback);
    },

    onEvent(type, callback) {
      return emitter.on(type, callback);
    },

    async startRecording() {
      await controls.start();
    },

    async stopRecording() {
      await controls.stop();
    },

    getLastTranscript() {
      return getState().lastTranscript;
    },
  };
}
