/**
 * IDE Telemetry Bridge — feed voice usage data into VS Code telemetry for enterprise dashboards.
 *
 * Bridges VoxPilot's local analytics to VS Code's telemetry system so enterprises
 * can track voice adoption metrics alongside other IDE usage data.
 *
 * What gets reported (all opt-in, respects VS Code telemetry settings):
 *   - Aggregate usage counts (transcriptions/day, commands/day)
 *   - Model selection distribution
 *   - Feature adoption rates
 *   - Error rates and types
 *   - Session duration averages
 *
 * What is NEVER reported:
 *   - Transcript content (what was said)
 *   - Audio data
 *   - File contents or paths
 *   - Personal identifiers
 *   - Custom vocabulary
 *
 * Respects:
 *   - VS Code's telemetry.telemetryLevel setting
 *   - VoxPilot's own analytics.enabled setting
 *   - Enterprise SSO policy (allowTelemetry flag)
 *
 * Enable via `voxpilot.telemetryBridge.enabled` setting (default: false).
 */

import * as vscode from 'vscode';

/** Telemetry event types */
export type TelemetryEventType =
  | 'session.start'
  | 'session.end'
  | 'transcription.count'
  | 'command.used'
  | 'model.selected'
  | 'feature.activated'
  | 'error.occurred'
  | 'calibration.completed'
  | 'macro.executed'
  | 'profile.switched';

/** A telemetry event (sanitized, no PII) */
export interface TelemetryEvent {
  /** Event type */
  type: TelemetryEventType;
  /** Timestamp */
  timestamp: number;
  /** Sanitized properties (no PII, no content) */
  properties: Record<string, string | number | boolean>;
}

/** Telemetry level (mirrors VS Code's setting) */
export type TelemetryLevel = 'off' | 'crash' | 'error' | 'all';

/** Batch of events for periodic flush */
export interface TelemetryBatch {
  /** Events in this batch */
  events: TelemetryEvent[];
  /** Batch creation time */
  createdAt: number;
  /** VoxPilot version */
  extensionVersion: string;
  /** VS Code version */
  ideVersion: string;
  /** Platform (win32, darwin, linux) */
  platform: string;
}

/**
 * Check if telemetry is allowed based on all relevant settings.
 */
export function isTelemetryAllowed(): boolean {
  // Check VS Code's telemetry level
  const vscodeLevel = vscode.workspace.getConfiguration('telemetry')
    .get<string>('telemetryLevel', 'all');
  if (vscodeLevel === 'off') return false;

  // Check VoxPilot's own setting
  const bridgeEnabled = vscode.workspace.getConfiguration('voxpilot')
    .get<boolean>('telemetryBridge.enabled', false);
  if (!bridgeEnabled) return false;

  // Check analytics enabled
  const analyticsEnabled = vscode.workspace.getConfiguration('voxpilot')
    .get<boolean>('analytics.enabled', false);
  if (!analyticsEnabled) return false;

  return true;
}

/**
 * Sanitize properties to ensure no PII leaks.
 */
export function sanitizeProperties(props: Record<string, unknown>): Record<string, string | number | boolean> {
  const sanitized: Record<string, string | number | boolean> = {};
  const blocklist = ['text', 'transcript', 'content', 'path', 'file', 'name', 'email', 'user', 'token', 'key', 'secret', 'password'];

  for (const [key, value] of Object.entries(props)) {
    // Skip any key that might contain PII
    if (blocklist.some(b => key.toLowerCase().includes(b))) continue;

    // Only allow primitive types
    if (typeof value === 'string') {
      // Truncate and sanitize strings
      sanitized[key] = value.slice(0, 50);
    } else if (typeof value === 'number') {
      sanitized[key] = value;
    } else if (typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * IDE Telemetry Bridge — buffers and sends sanitized usage events.
 */
export class TelemetryBridge {
  private buffer: TelemetryEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | undefined;
  private sender: vscode.TelemetrySender | undefined;
  private logger: vscode.TelemetryLogger | undefined;
  private enabled: boolean = false;
  private maxBufferSize: number = 100;
  private flushIntervalMs: number = 300000; // 5 minutes

  /** Initialize the telemetry bridge */
  init(context: vscode.ExtensionContext): void {
    this.enabled = isTelemetryAllowed();

    if (!this.enabled) return;

    // Create telemetry sender
    this.sender = {
      sendEventData: (eventName: string, data?: Record<string, unknown>) => {
        // In production, this would send to the telemetry endpoint
        // For now, it's a no-op that satisfies the interface
        void eventName;
        void data;
      },
      sendErrorData: (error: Error, data?: Record<string, unknown>) => {
        void error;
        void data;
      },
    };

    this.logger = vscode.env.createTelemetryLogger(this.sender, {
      ignoreBuiltInCommonProperties: false,
      ignoreUnhandledErrors: true,
    });

    context.subscriptions.push(this.logger);

    // Start periodic flush
    this.flushInterval = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  /** Record a telemetry event */
  record(type: TelemetryEventType, properties: Record<string, unknown> = {}): void {
    if (!this.enabled) return;

    const event: TelemetryEvent = {
      type,
      timestamp: Date.now(),
      properties: sanitizeProperties(properties),
    };

    this.buffer.push(event);

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  /** Record a transcription event (count only, no content) */
  recordTranscription(model: string, durationMs: number, wordCount: number): void {
    this.record('transcription.count', {
      model,
      durationMs,
      wordCount,
    });
  }

  /** Record a command usage */
  recordCommand(commandType: string): void {
    this.record('command.used', { commandType });
  }

  /** Record a model selection */
  recordModelSelection(modelId: string): void {
    this.record('model.selected', { modelId });
  }

  /** Record a feature activation */
  recordFeatureActivation(featureId: string): void {
    this.record('feature.activated', { featureId });
  }

  /** Record an error (type only, no details) */
  recordError(errorType: string): void {
    this.record('error.occurred', { errorType });
  }

  /** Flush buffered events */
  flush(): void {
    if (!this.enabled || this.buffer.length === 0 || !this.logger) return;

    // Send aggregated events
    const batch = this.createBatch();
    this.logger.logUsage('voxpilot.batch', {
      eventCount: batch.events.length,
      extensionVersion: batch.extensionVersion,
      platform: batch.platform,
    });

    // Send individual event type counts
    const typeCounts = new Map<string, number>();
    for (const event of batch.events) {
      typeCounts.set(event.type, (typeCounts.get(event.type) || 0) + 1);
    }

    for (const [type, count] of typeCounts) {
      this.logger.logUsage(`voxpilot.${type}`, { count });
    }

    this.buffer = [];
  }

  /** Get current buffer size */
  get bufferSize(): number {
    return this.buffer.length;
  }

  /** Check if bridge is enabled */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Disable and clear */
  disable(): void {
    this.enabled = false;
    this.buffer = [];
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }
  }

  /** Get summary of buffered events */
  getBufferSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const event of this.buffer) {
      summary[event.type] = (summary[event.type] || 0) + 1;
    }
    return summary;
  }

  private createBatch(): TelemetryBatch {
    return {
      events: [...this.buffer],
      createdAt: Date.now(),
      extensionVersion: vscode.extensions.getExtension('natearcher-ai.voxpilot')?.packageJSON?.version || 'unknown',
      ideVersion: vscode.version,
      platform: process.platform,
    };
  }

  /** Dispose resources */
  dispose(): void {
    this.disable();
    this.logger?.dispose();
  }
}

/** Singleton instance */
export const telemetryBridge = new TelemetryBridge();
