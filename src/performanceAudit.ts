/**
 * Performance Audit — identify and fix all operations >100ms, reduce startup time.
 *
 * Provides instrumentation and profiling tools for VoxPilot internals:
 *   - Startup time measurement (activation → ready)
 *   - Per-processor timing in the pipeline
 *   - Model load time tracking
 *   - Audio capture latency measurement
 *   - Memory usage snapshots
 *   - Slow operation detection (>100ms threshold)
 *   - Performance regression detection between versions
 *   - Exportable performance report
 *
 * All measurements are local and opt-in. No data leaves the device.
 * Enable via `voxpilot.performanceAudit.enabled` setting (default: false).
 */

import * as vscode from 'vscode';

/** Performance measurement entry */
export interface PerfMeasurement {
  /** Operation name */
  name: string;
  /** Category */
  category: 'startup' | 'pipeline' | 'model' | 'audio' | 'ui' | 'io' | 'network';
  /** Duration in ms */
  durationMs: number;
  /** Timestamp when measured */
  timestamp: number;
  /** Whether this exceeded the slow threshold */
  slow: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/** Performance summary for a time period */
export interface PerfSummary {
  /** Total measurements taken */
  totalMeasurements: number;
  /** Slow operations (>threshold) */
  slowOperations: number;
  /** Average pipeline processing time */
  avgPipelineMs: number;
  /** P95 pipeline processing time */
  p95PipelineMs: number;
  /** Startup time (last measured) */
  startupMs: number;
  /** Model load time (last measured) */
  modelLoadMs: number;
  /** Audio capture latency (average) */
  avgAudioLatencyMs: number;
  /** Memory usage (MB) */
  memoryMb: number;
  /** Slowest operations (top 10) */
  slowest: PerfMeasurement[];
  /** Performance score (0-100) */
  score: number;
}

/** Performance configuration */
export interface PerfConfig {
  /** Whether auditing is enabled */
  enabled: boolean;
  /** Slow operation threshold in ms */
  slowThresholdMs: number;
  /** Maximum measurements to retain */
  maxMeasurements: number;
  /** Whether to log slow operations to output channel */
  logSlowOps: boolean;
  /** Target startup time in ms */
  targetStartupMs: number;
  /** Target pipeline time in ms */
  targetPipelineMs: number;
}

/** Default configuration */
export const DEFAULT_PERF_CONFIG: PerfConfig = {
  enabled: false,
  slowThresholdMs: 100,
  maxMeasurements: 10000,
  logSlowOps: true,
  targetStartupMs: 500,
  targetPipelineMs: 50,
};

/**
 * High-resolution timer utility.
 */
export class PerfTimer {
  private startTime: number = 0;
  private name: string;
  private category: PerfMeasurement['category'];

  constructor(name: string, category: PerfMeasurement['category'] = 'pipeline') {
    this.name = name;
    this.category = category;
    this.startTime = performance.now();
  }

  /** Stop the timer and return the measurement */
  stop(metadata?: Record<string, unknown>): PerfMeasurement {
    const durationMs = Math.round((performance.now() - this.startTime) * 100) / 100;
    return {
      name: this.name,
      category: this.category,
      durationMs,
      timestamp: Date.now(),
      slow: durationMs > DEFAULT_PERF_CONFIG.slowThresholdMs,
      metadata,
    };
  }

  /** Get elapsed time without stopping */
  elapsed(): number {
    return Math.round((performance.now() - this.startTime) * 100) / 100;
  }
}

/**
 * Performance Audit engine — collects, analyzes, and reports performance data.
 */
export class PerformanceAudit {
  private measurements: PerfMeasurement[] = [];
  private config: PerfConfig;
  private startupTime: number = 0;
  private outputChannel: vscode.OutputChannel | undefined;

  constructor(config: PerfConfig = DEFAULT_PERF_CONFIG) {
    this.config = { ...config };
  }

  /** Initialize with extension context */
  init(context: vscode.ExtensionContext): void {
    if (this.config.logSlowOps) {
      this.outputChannel = vscode.window.createOutputChannel('VoxPilot Performance');
      context.subscriptions.push(this.outputChannel);
    }
  }

  /** Get current configuration */
  getConfig(): PerfConfig {
    return { ...this.config };
  }

  /** Update configuration */
  setConfig(updates: Partial<PerfConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /** Whether auditing is enabled */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** Enable auditing */
  enable(): void {
    this.config.enabled = true;
  }

  /** Disable auditing */
  disable(): void {
    this.config.enabled = false;
  }

  /** Start a new timer */
  startTimer(name: string, category: PerfMeasurement['category'] = 'pipeline'): PerfTimer {
    return new PerfTimer(name, category);
  }

  /** Record a measurement */
  record(measurement: PerfMeasurement): void {
    if (!this.config.enabled) return;

    this.measurements.push(measurement);

    // Log slow operations
    if (measurement.slow && this.config.logSlowOps && this.outputChannel) {
      this.outputChannel.appendLine(
        `⚠️ SLOW [${measurement.category}] ${measurement.name}: ${measurement.durationMs}ms`,
      );
    }

    // Trim buffer
    if (this.measurements.length > this.config.maxMeasurements) {
      this.measurements = this.measurements.slice(-Math.floor(this.config.maxMeasurements / 2));
    }
  }

  /** Record a timed operation (convenience wrapper) */
  time<T>(name: string, category: PerfMeasurement['category'], fn: () => T): T {
    if (!this.config.enabled) return fn();

    const timer = this.startTimer(name, category);
    const result = fn();
    this.record(timer.stop());
    return result;
  }

  /** Record an async timed operation */
  async timeAsync<T>(name: string, category: PerfMeasurement['category'], fn: () => Promise<T>): Promise<T> {
    if (!this.config.enabled) return fn();

    const timer = this.startTimer(name, category);
    const result = await fn();
    this.record(timer.stop());
    return result;
  }

  /** Record startup time */
  recordStartup(durationMs: number): void {
    this.startupTime = durationMs;
    this.record({
      name: 'extension.activate',
      category: 'startup',
      durationMs,
      timestamp: Date.now(),
      slow: durationMs > this.config.targetStartupMs,
    });
  }

  /** Get all measurements */
  getMeasurements(): PerfMeasurement[] {
    return [...this.measurements];
  }

  /** Get measurements by category */
  getByCategory(category: PerfMeasurement['category']): PerfMeasurement[] {
    return this.measurements.filter(m => m.category === category);
  }

  /** Get slow operations only */
  getSlowOperations(): PerfMeasurement[] {
    return this.measurements.filter(m => m.slow);
  }

  /** Get performance summary */
  getSummary(): PerfSummary {
    const pipeline = this.getByCategory('pipeline');
    const audio = this.getByCategory('audio');
    const model = this.getByCategory('model');
    const slow = this.getSlowOperations();

    // Pipeline stats
    const pipelineTimes = pipeline.map(m => m.durationMs).sort((a, b) => a - b);
    const avgPipelineMs = pipelineTimes.length > 0
      ? Math.round(pipelineTimes.reduce((a, b) => a + b, 0) / pipelineTimes.length)
      : 0;
    const p95PipelineMs = pipelineTimes.length > 0
      ? pipelineTimes[Math.floor(pipelineTimes.length * 0.95)] || pipelineTimes[pipelineTimes.length - 1]
      : 0;

    // Audio latency
    const audioTimes = audio.map(m => m.durationMs);
    const avgAudioLatencyMs = audioTimes.length > 0
      ? Math.round(audioTimes.reduce((a, b) => a + b, 0) / audioTimes.length)
      : 0;

    // Model load time (last)
    const modelLoadMs = model.length > 0 ? model[model.length - 1].durationMs : 0;

    // Memory (approximate from process)
    const memoryMb = Math.round((process.memoryUsage?.()?.heapUsed || 0) / 1048576);

    // Slowest operations
    const slowest = [...this.measurements]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10);

    // Performance score (0-100)
    const score = this.calculateScore(avgPipelineMs, this.startupTime, slow.length, this.measurements.length);

    return {
      totalMeasurements: this.measurements.length,
      slowOperations: slow.length,
      avgPipelineMs,
      p95PipelineMs,
      startupMs: this.startupTime,
      modelLoadMs,
      avgAudioLatencyMs,
      memoryMb,
      slowest,
      score,
    };
  }

  /** Clear all measurements */
  clear(): void {
    this.measurements = [];
  }

  /** Export measurements as JSON */
  export(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      config: this.config,
      summary: this.getSummary(),
      measurements: this.measurements,
    }, null, 2);
  }

  /** Get measurement count */
  get count(): number {
    return this.measurements.length;
  }

  private calculateScore(avgPipelineMs: number, startupMs: number, slowCount: number, totalCount: number): number {
    let score = 100;

    // Penalize slow pipeline (target: <50ms)
    if (avgPipelineMs > this.config.targetPipelineMs) {
      score -= Math.min(30, (avgPipelineMs - this.config.targetPipelineMs) / 5);
    }

    // Penalize slow startup (target: <500ms)
    if (startupMs > this.config.targetStartupMs) {
      score -= Math.min(20, (startupMs - this.config.targetStartupMs) / 100);
    }

    // Penalize high slow operation ratio
    if (totalCount > 0) {
      const slowRatio = slowCount / totalCount;
      score -= Math.min(30, slowRatio * 100);
    }

    return Math.max(0, Math.round(score));
  }
}

/** Singleton instance */
export const performanceAudit = new PerformanceAudit();
