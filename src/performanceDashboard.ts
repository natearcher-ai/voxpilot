/**
 * Performance dashboard — webview panel showing transcription latency,
 * accuracy stats, model benchmarks, and session history.
 *
 * Provides developers with insight into VoxPilot's performance:
 *   - Transcription latency (avg, p50, p95, p99)
 *   - Audio duration vs processing time ratio
 *   - Model comparison benchmarks
 *   - Session history with per-transcription stats
 *   - Error rate and retry counts
 *
 * Data is collected passively during normal use and displayed on demand
 * via the "VoxPilot: Show Performance Dashboard" command.
 *
 * Enable via `voxpilot.performanceDashboard` setting (default: true).
 */

export interface TranscriptionMetric {
  /** Unique ID */
  id: string;
  /** Unix timestamp (ms) */
  timestamp: number;
  /** Audio duration in seconds */
  audioDuration: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Model used */
  model: string;
  /** Language code */
  language: string;
  /** Transcript length in characters */
  transcriptLength: number;
  /** Whether transcription succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

export interface PerformanceStats {
  /** Total transcriptions recorded */
  totalTranscriptions: number;
  /** Successful transcriptions */
  successCount: number;
  /** Failed transcriptions */
  errorCount: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Median latency (p50) */
  p50LatencyMs: number;
  /** 95th percentile latency */
  p95LatencyMs: number;
  /** 99th percentile latency */
  p99LatencyMs: number;
  /** Average real-time factor (processing time / audio duration) */
  avgRealTimeFactor: number;
  /** Total audio processed in seconds */
  totalAudioSeconds: number;
  /** Average transcript length */
  avgTranscriptLength: number;
  /** Metrics by model */
  byModel: Record<string, { count: number; avgLatencyMs: number; avgRtf: number }>;
}

/**
 * Collect and analyze transcription performance metrics.
 */
export class PerformanceCollector {
  private metrics: TranscriptionMetric[] = [];
  private readonly maxMetrics: number;

  constructor(maxMetrics: number = 1000) {
    this.maxMetrics = maxMetrics;
  }

  /** Record a transcription metric */
  record(metric: Omit<TranscriptionMetric, 'id'>): void {
    const entry: TranscriptionMetric = {
      ...metric,
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };

    this.metrics.unshift(entry);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(0, this.maxMetrics);
    }
  }

  /** Get all recorded metrics */
  getAll(): TranscriptionMetric[] {
    return [...this.metrics];
  }

  /** Get metrics from the last N hours */
  getRecent(hours: number = 24): TranscriptionMetric[] {
    const cutoff = Date.now() - hours * 3600 * 1000;
    return this.metrics.filter(m => m.timestamp >= cutoff);
  }

  /** Compute aggregate statistics */
  getStats(metrics?: TranscriptionMetric[]): PerformanceStats {
    const data = metrics ?? this.metrics;
    const successful = data.filter(m => m.success);
    const latencies = successful.map(m => m.processingTimeMs).sort((a, b) => a - b);

    const byModel: Record<string, { count: number; totalLatency: number; totalRtf: number }> = {};
    for (const m of successful) {
      if (!byModel[m.model]) {
        byModel[m.model] = { count: 0, totalLatency: 0, totalRtf: 0 };
      }
      byModel[m.model].count++;
      byModel[m.model].totalLatency += m.processingTimeMs;
      byModel[m.model].totalRtf += m.audioDuration > 0 ? m.processingTimeMs / (m.audioDuration * 1000) : 0;
    }

    const modelStats: Record<string, { count: number; avgLatencyMs: number; avgRtf: number }> = {};
    for (const [model, stats] of Object.entries(byModel)) {
      modelStats[model] = {
        count: stats.count,
        avgLatencyMs: Math.round(stats.totalLatency / stats.count),
        avgRtf: Number((stats.totalRtf / stats.count).toFixed(3)),
      };
    }

    return {
      totalTranscriptions: data.length,
      successCount: successful.length,
      errorCount: data.length - successful.length,
      avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      p99LatencyMs: percentile(latencies, 99),
      avgRealTimeFactor: successful.length > 0
        ? Number((successful.reduce((sum, m) => sum + (m.audioDuration > 0 ? m.processingTimeMs / (m.audioDuration * 1000) : 0), 0) / successful.length).toFixed(3))
        : 0,
      totalAudioSeconds: Number(data.reduce((sum, m) => sum + m.audioDuration, 0).toFixed(1)),
      avgTranscriptLength: successful.length > 0
        ? Math.round(successful.reduce((sum, m) => sum + m.transcriptLength, 0) / successful.length)
        : 0,
      byModel: modelStats,
    };
  }

  /** Clear all metrics */
  clear(): void {
    this.metrics = [];
  }

  /** Export metrics as JSON */
  toJSON(): TranscriptionMetric[] {
    return [...this.metrics];
  }

  /** Import metrics from JSON */
  load(data: TranscriptionMetric[]): void {
    this.metrics = data.slice(0, this.maxMetrics);
  }

  get count(): number {
    return this.metrics.length;
  }
}

/**
 * Calculate a percentile value from a sorted array.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) { return 0; }
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

/**
 * Format milliseconds as a human-readable duration.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) { return `${Math.round(ms)}ms`; }
  if (ms < 60000) { return `${(ms / 1000).toFixed(1)}s`; }
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format a real-time factor as a human-readable string.
 * RTF < 1.0 means faster than real-time.
 */
export function formatRTF(rtf: number): string {
  if (rtf === 0) { return 'N/A'; }
  if (rtf < 1.0) { return `${rtf.toFixed(2)}x (faster than real-time)`; }
  return `${rtf.toFixed(2)}x`;
}
