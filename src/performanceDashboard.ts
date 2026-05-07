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

import * as vscode from 'vscode';

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

/**
 * Webview panel that renders the performance dashboard UI.
 */
export class PerformanceDashboardPanel {
  private static instance: PerformanceDashboardPanel | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private collector: PerformanceCollector;

  private constructor(private context: vscode.ExtensionContext, collector: PerformanceCollector) {
    this.collector = collector;
  }

  static create(context: vscode.ExtensionContext, collector: PerformanceCollector): PerformanceDashboardPanel {
    if (!PerformanceDashboardPanel.instance) {
      PerformanceDashboardPanel.instance = new PerformanceDashboardPanel(context, collector);
    }
    return PerformanceDashboardPanel.instance;
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'voxpilot.performanceDashboard',
      'VoxPilot Performance',
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    this.panel.onDidDispose(() => { this.panel = undefined; });

    this.panel.webview.onDidReceiveMessage((msg: { type: string; hours?: number }) => {
      switch (msg.type) {
        case 'refresh':
          this.refresh();
          break;
        case 'clear':
          this.collector.clear();
          this.refresh();
          break;
        case 'filter':
          this.refresh(msg.hours);
          break;
        case 'export': {
          const data = JSON.stringify(this.collector.toJSON(), null, 2);
          const uri = vscode.Uri.parse('untitled:voxpilot-performance.json');
          vscode.workspace.openTextDocument(uri).then(doc => vscode.window.showTextDocument(doc)).then(editor => {
            editor.edit(eb => eb.insert(new vscode.Position(0, 0), data));
          });
          break;
        }
      }
    });

    this.refresh();
  }

  refresh(hours?: number): void {
    if (!this.panel) { return; }
    const metrics = hours ? this.collector.getRecent(hours) : this.collector.getAll();
    const stats = this.collector.getStats(metrics);
    this.panel.webview.html = this.getHtml(stats, metrics);
  }

  dispose(): void {
    this.panel?.dispose();
    PerformanceDashboardPanel.instance = undefined;
  }

  private getHtml(stats: PerformanceStats, metrics: TranscriptionMetric[]): string {
    const modelRows = Object.entries(stats.byModel).map(([model, s]) =>
      `<tr><td>${esc(model)}</td><td>${s.count}</td><td>${s.avgLatencyMs}ms</td><td>${s.avgRtf.toFixed(3)}x</td></tr>`
    ).join('');

    const recentRows = metrics.slice(0, 50).map(m => {
      const date = new Date(m.timestamp);
      const time = date.toLocaleTimeString();
      const status = m.success ? '✅' : '❌';
      const latency = m.success ? `${m.processingTimeMs}ms` : (m.error || 'error');
      return `<tr><td>${status}</td><td>${time}</td><td>${esc(m.model)}</td><td>${m.audioDuration.toFixed(1)}s</td><td>${latency}</td><td>${m.transcriptLength}</td></tr>`;
    }).join('');

    const errorRate = stats.totalTranscriptions > 0
      ? ((stats.errorCount / stats.totalTranscriptions) * 100).toFixed(1)
      : '0.0';

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
  h2 { margin: 16px 0 8px; font-size: 14px; font-weight: 600; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
  .toolbar { display: flex; gap: 6px; margin-bottom: 12px; align-items: center; }
  .toolbar button, .toolbar select { padding: 4px 10px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
  .toolbar button:hover { background: var(--vscode-button-hoverBackground); color: var(--vscode-button-foreground); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px; text-align: center; }
  .card .value { font-size: 20px; font-weight: 700; color: var(--vscode-textLink-foreground); }
  .card .label { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 5px 8px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); }
  th { font-weight: 600; background: var(--vscode-editor-background); position: sticky; top: 0; }
  .empty { text-align: center; padding: 40px; color: var(--vscode-descriptionForeground); }
  .section { margin-bottom: 20px; }
</style></head><body>
<div class="toolbar">
  <select id="timeFilter" aria-label="Time range filter">
    <option value="0">All time</option>
    <option value="1">Last hour</option>
    <option value="6">Last 6 hours</option>
    <option value="24">Last 24 hours</option>
    <option value="168">Last 7 days</option>
  </select>
  <button id="refreshBtn" aria-label="Refresh dashboard">↻ Refresh</button>
  <button id="exportBtn" aria-label="Export metrics as JSON">Export JSON</button>
  <button id="clearBtn" aria-label="Clear all metrics">Clear</button>
</div>

<div class="cards">
  <div class="card"><div class="value">${stats.totalTranscriptions}</div><div class="label">Total Transcriptions</div></div>
  <div class="card"><div class="value">${stats.avgLatencyMs}ms</div><div class="label">Avg Latency</div></div>
  <div class="card"><div class="value">${stats.p50LatencyMs}ms</div><div class="label">P50 Latency</div></div>
  <div class="card"><div class="value">${stats.p95LatencyMs}ms</div><div class="label">P95 Latency</div></div>
  <div class="card"><div class="value">${stats.p99LatencyMs}ms</div><div class="label">P99 Latency</div></div>
  <div class="card"><div class="value">${formatRTF(stats.avgRealTimeFactor)}</div><div class="label">Avg RTF</div></div>
  <div class="card"><div class="value">${stats.totalAudioSeconds.toFixed(0)}s</div><div class="label">Total Audio</div></div>
  <div class="card"><div class="value">${errorRate}%</div><div class="label">Error Rate</div></div>
</div>

<div class="section">
<h2>Model Benchmarks</h2>
${modelRows ? `<table><thead><tr><th>Model</th><th>Count</th><th>Avg Latency</th><th>Avg RTF</th></tr></thead><tbody>${modelRows}</tbody></table>` : '<div class="empty">No model data yet</div>'}
</div>

<div class="section">
<h2>Recent Transcriptions</h2>
${recentRows ? `<table><thead><tr><th></th><th>Time</th><th>Model</th><th>Audio</th><th>Latency</th><th>Chars</th></tr></thead><tbody>${recentRows}</tbody></table>` : '<div class="empty">No transcriptions recorded yet. Start talking!</div>'}
</div>

<script>
  const vscode = acquireVsCodeApi();
  document.getElementById('refreshBtn').onclick = () => vscode.postMessage({type:'refresh'});
  document.getElementById('exportBtn').onclick = () => vscode.postMessage({type:'export'});
  document.getElementById('clearBtn').onclick = () => { if (confirm('Clear all performance metrics?')) vscode.postMessage({type:'clear'}); };
  document.getElementById('timeFilter').onchange = (e) => {
    const hours = parseInt(e.target.value);
    vscode.postMessage({type:'filter', hours: hours || undefined});
  };
</script>
</body></html>`;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
