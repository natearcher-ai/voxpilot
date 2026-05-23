/**
 * Extension API — public API for other extensions to hook into VoxPilot
 * transcription events and pipeline.
 *
 * Allows third-party extensions to:
 *   - Listen for transcription events (start, partial, complete, error)
 *   - Register custom post-processors in the pipeline
 *   - Register custom voice commands
 *   - Trigger recording programmatically
 *   - Query VoxPilot state (listening, model, language)
 *   - Access pipeline diagnostics and metrics
 *
 * Usage by other extensions:
 *   const voxpilot = vscode.extensions.getExtension('natearcher-ai.voxpilot');
 *   const api = voxpilot?.exports;
 *   api.onTranscript((text) => { ... });
 *   api.registerProcessor({ id: 'my-processor', process: (text, ctx) => text.toUpperCase() });
 *   api.registerCommand({ phrase: 'deploy app', action: 'command', command: 'myext.deploy' });
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

/** External processor definition for third-party extensions */
export interface ExternalProcessor {
  /** Unique processor ID (must not conflict with built-ins) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Processing function: receives text and context, returns transformed text */
  process: (text: string, context: { language?: string; fileType?: string }) => string;
  /** Optional priority (higher = runs later). Default: 100 */
  priority?: number;
  /** Optional description for UI display */
  description?: string;
}

/** External voice command definition */
export interface ExternalVoiceCommand {
  /** The spoken phrase to match (case-insensitive) */
  phrase: string;
  /** Action: "insert" replaces phrase with text, "command" runs a VS Code command, "callback" invokes a function */
  action: 'insert' | 'command' | 'callback';
  /** Replacement text for "insert" actions */
  text?: string;
  /** VS Code command ID for "command" actions */
  command?: string;
  /** Arguments for "command" actions */
  args?: unknown;
  /** Callback function for "callback" actions */
  callback?: () => void | Promise<void>;
  /** Description for UI display */
  description?: string;
}

/** Pipeline metrics snapshot */
export interface PipelineMetrics {
  /** Total transcriptions processed */
  totalProcessed: number;
  /** Average processing time in ms */
  avgProcessingMs: number;
  /** Registered processor count (built-in + external) */
  processorCount: number;
  /** External processor count */
  externalProcessorCount: number;
  /** Registered external command count */
  externalCommandCount: number;
}

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

  /**
   * Register a custom post-processor in the pipeline.
   * Returns a Disposable to unregister it.
   */
  registerProcessor(processor: ExternalProcessor): vscode.Disposable;

  /**
   * Register a custom voice command.
   * Returns a Disposable to unregister it.
   */
  registerCommand(command: ExternalVoiceCommand): vscode.Disposable;

  /**
   * Unregister a previously registered processor by ID.
   */
  unregisterProcessor(id: string): void;

  /**
   * Unregister a previously registered command by phrase.
   */
  unregisterCommand(phrase: string): void;

  /**
   * Get pipeline metrics and diagnostics.
   */
  getMetrics(): PipelineMetrics;

  /**
   * List all registered processors (built-in and external).
   */
  listProcessors(): Array<{ id: string; name: string; external: boolean; enabled: boolean }>;
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
  pipeline?: { register: (p: { id: string; name: string; process: (text: string, ctx: unknown) => string }) => void; unregister?: (id: string) => void; getProcessorInfo: () => Array<{ id: string; name?: string; enabled: boolean }> },
): VoxPilotAPI {
  const externalProcessors = new Map<string, ExternalProcessor>();
  const externalCommands = new Map<string, ExternalVoiceCommand>();
  let totalProcessed = 0;
  let totalProcessingMs = 0;

  // Track transcriptions for metrics
  emitter.on('transcript-complete', () => {
    totalProcessed++;
  });

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

    registerProcessor(processor: ExternalProcessor): vscode.Disposable {
      if (!processor.id || !processor.process) {
        throw new Error('Processor must have an id and process function');
      }
      if (externalProcessors.has(processor.id)) {
        throw new Error(`Processor "${processor.id}" is already registered`);
      }

      externalProcessors.set(processor.id, processor);

      // Register in the actual pipeline if available
      if (pipeline) {
        const priority = processor.priority ?? 100;
        pipeline.register({
          id: processor.id,
          name: processor.name,
          process: (text: string, ctx: unknown) => {
            const start = Date.now();
            try {
              const result = processor.process(text, ctx as { language?: string; fileType?: string });
              totalProcessingMs += Date.now() - start;
              return result;
            } catch {
              // External processor errors should not crash the pipeline
              return text;
            }
          },
        });
      }

      return {
        dispose: () => {
          externalProcessors.delete(processor.id);
          if (pipeline?.unregister) {
            pipeline.unregister(processor.id);
          }
        },
      };
    },

    registerCommand(command: ExternalVoiceCommand): vscode.Disposable {
      if (!command.phrase) {
        throw new Error('Command must have a phrase');
      }
      const key = command.phrase.toLowerCase();
      if (externalCommands.has(key)) {
        throw new Error(`Command for phrase "${command.phrase}" is already registered`);
      }

      externalCommands.set(key, command);

      return {
        dispose: () => {
          externalCommands.delete(key);
        },
      };
    },

    unregisterProcessor(id: string): void {
      externalProcessors.delete(id);
      if (pipeline?.unregister) {
        pipeline.unregister(id);
      }
    },

    unregisterCommand(phrase: string): void {
      externalCommands.delete(phrase.toLowerCase());
    },

    getMetrics(): PipelineMetrics {
      return {
        totalProcessed,
        avgProcessingMs: totalProcessed > 0 ? totalProcessingMs / totalProcessed : 0,
        processorCount: (pipeline?.getProcessorInfo().length ?? 0) + externalProcessors.size,
        externalProcessorCount: externalProcessors.size,
        externalCommandCount: externalCommands.size,
      };
    },

    listProcessors(): Array<{ id: string; name: string; external: boolean; enabled: boolean }> {
      const builtIn = pipeline?.getProcessorInfo().map(p => ({
        id: p.id,
        name: p.name ?? p.id,
        external: externalProcessors.has(p.id),
        enabled: p.enabled,
      })) ?? [];

      // Add any external processors not yet in pipeline info
      for (const [id, proc] of externalProcessors) {
        if (!builtIn.find(b => b.id === id)) {
          builtIn.push({ id, name: proc.name, external: true, enabled: true });
        }
      }

      return builtIn;
    },
  };
}
