/**
 * Usage Analytics Dashboard — opt-in metrics for productivity insights.
 *
 * Tracks (locally, opt-in only):
 *   - Words per minute (speaking speed)
 *   - Transcription accuracy trends over time
 *   - Most-used voice commands
 *   - Daily/weekly/monthly usage patterns
 *   - Time saved estimates (vs typing)
 *   - Model performance comparison
 *   - Session duration and frequency
 *
 * All data stays local. No telemetry. No cloud. Users can export or delete at any time.
 * Provides a webview dashboard with charts and insights.
 *
 * Enable via `voxpilot.analytics.enabled` setting (default: false — opt-in).
 */

import * as vscode from 'vscode';

/** Time period for aggregation */
export type TimePeriod = 'day' | 'week' | 'month' | 'all';

/** A single usage event */
export interface UsageEvent {
  /** Event type */
  type: 'transcription' | 'command' | 'correction' | 'session-start' | 'session-end';
  /** Timestamp */
  timestamp: number;
  /** Word count (for transcriptions) */
  wordCount?: number;
  /** Duration in ms (for transcriptions) */
  durationMs?: number;
  /** Command ID (for commands) */
  commandId?: string;
  /** Model used */
  model?: string;
  /** Whether correction was needed */
  corrected?: boolean;
}

/** Aggregated metrics for a time period */
export interface UsageMetrics {
  /** Time period */
  period: TimePeriod;
  /** Start of period */
  from: number;
  /** End of period */
  to: number;
  /** Total transcriptions */
  totalTranscriptions: number;
  /** Total words transcribed */
  totalWords: number;
  /** Total speaking time in ms */
  totalSpeakingMs: number;
  /** Average words per minute */
  avgWordsPerMinute: number;
  /** Accuracy rate (1 - corrections/total) */
  accuracyRate: number;
  /** Total corrections made */
  corrections: number;
  /** Total voice commands used */
  commandsUsed: number;
  /** Most used commands (top 10) */
  topCommands: Array<{ id: string; count: number }>;
  /** Sessions count */
  sessions: number;
  /** Average session duration in ms */
  avgSessionMs: number;
  /** Estimated time saved vs typing (ms) */
  estimatedTimeSavedMs: number;
  /** Model usage breakdown */
  modelUsage: Record<string, number>;
  /** Daily breakdown (for week/month views) */
  dailyBreakdown?: Array<{ date: string; words: number; transcriptions: number }>;
}

/** Productivity insights derived from metrics */
export interface ProductivityInsight {
  /** Insight type */
  type: 'improvement' | 'milestone' | 'suggestion' | 'streak';
  /** Human-readable message */
  message: string;
  /** Metric that triggered the insight */
  metric: string;
  /** Current value */
  value: number;
  /** Previous value (for comparison) */
  previousValue?: number;
}

/** Average typing speed for time-saved calculation (WPM) */
const AVG_TYPING_WPM = 40;

/**
 * Usage Analytics engine — tracks events and computes metrics.
 */
export class UsageAnalytics {
  private events: UsageEvent[] = [];
  private context: vscode.ExtensionContext | undefined;
  private enabled: boolean = false;
  private sessionStart: number = 0;

  /** Initialize with extension context */
  init(extensionContext: vscode.ExtensionContext): void {
    this.context = extensionContext;
    this.loadEvents();
    this.enabled = vscode.workspace.getConfiguration('voxpilot').get<boolean>('analytics.enabled', false);
  }

  /** Check if analytics is enabled */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Enable analytics */
  enable(): void {
    this.enabled = true;
    this.saveConfig();
  }

  /** Disable analytics and optionally clear data */
  disable(clearData: boolean = false): void {
    this.enabled = false;
    if (clearData) {
      this.events = [];
      this.saveEvents();
    }
    this.saveConfig();
  }

  /** Record a transcription event */
  recordTranscription(wordCount: number, durationMs: number, model: string): void {
    if (!this.enabled) return;
    this.events.push({
      type: 'transcription',
      timestamp: Date.now(),
      wordCount,
      durationMs,
      model,
    });
    this.trimEvents();
    this.saveEvents();
  }

  /** Record a voice command usage */
  recordCommand(commandId: string): void {
    if (!this.enabled) return;
    this.events.push({
      type: 'command',
      timestamp: Date.now(),
      commandId,
    });
    this.saveEvents();
  }

  /** Record a correction (user edited transcription) */
  recordCorrection(): void {
    if (!this.enabled) return;
    this.events.push({
      type: 'correction',
      timestamp: Date.now(),
      corrected: true,
    });
    this.saveEvents();
  }

  /** Record session start */
  startSession(): void {
    if (!this.enabled) return;
    this.sessionStart = Date.now();
    this.events.push({
      type: 'session-start',
      timestamp: this.sessionStart,
    });
    this.saveEvents();
  }

  /** Record session end */
  endSession(): void {
    if (!this.enabled) return;
    this.events.push({
      type: 'session-end',
      timestamp: Date.now(),
      durationMs: this.sessionStart > 0 ? Date.now() - this.sessionStart : 0,
    });
    this.sessionStart = 0;
    this.saveEvents();
  }

  /** Get metrics for a time period */
  getMetrics(period: TimePeriod = 'week'): UsageMetrics {
    const now = Date.now();
    const from = this.getPeriodStart(period, now);
    const filtered = this.events.filter(e => e.timestamp >= from && e.timestamp <= now);

    const transcriptions = filtered.filter(e => e.type === 'transcription');
    const commands = filtered.filter(e => e.type === 'command');
    const corrections = filtered.filter(e => e.type === 'correction');
    const sessions = filtered.filter(e => e.type === 'session-end');

    const totalWords = transcriptions.reduce((sum, e) => sum + (e.wordCount || 0), 0);
    const totalSpeakingMs = transcriptions.reduce((sum, e) => sum + (e.durationMs || 0), 0);
    const avgWpm = totalSpeakingMs > 0 ? (totalWords / (totalSpeakingMs / 60000)) : 0;

    const totalTranscriptions = transcriptions.length;
    const accuracyRate = totalTranscriptions > 0
      ? 1 - (corrections.length / totalTranscriptions)
      : 1;

    // Time saved: words / typing_speed - words / speaking_speed
    const typingTimeMs = totalWords > 0 ? (totalWords / AVG_TYPING_WPM) * 60000 : 0;
    const estimatedTimeSavedMs = Math.max(0, typingTimeMs - totalSpeakingMs);

    // Top commands
    const commandCounts = new Map<string, number>();
    for (const cmd of commands) {
      if (cmd.commandId) {
        commandCounts.set(cmd.commandId, (commandCounts.get(cmd.commandId) || 0) + 1);
      }
    }
    const topCommands = [...commandCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ id, count }));

    // Model usage
    const modelUsage: Record<string, number> = {};
    for (const t of transcriptions) {
      if (t.model) {
        modelUsage[t.model] = (modelUsage[t.model] || 0) + 1;
      }
    }

    // Session stats
    const totalSessionMs = sessions.reduce((sum, e) => sum + (e.durationMs || 0), 0);
    const avgSessionMs = sessions.length > 0 ? totalSessionMs / sessions.length : 0;

    // Daily breakdown
    const dailyBreakdown = this.getDailyBreakdown(transcriptions, from, now);

    return {
      period,
      from,
      to: now,
      totalTranscriptions,
      totalWords,
      totalSpeakingMs,
      avgWordsPerMinute: Math.round(avgWpm),
      accuracyRate: Math.round(accuracyRate * 1000) / 1000,
      corrections: corrections.length,
      commandsUsed: commands.length,
      topCommands,
      sessions: sessions.length,
      avgSessionMs: Math.round(avgSessionMs),
      estimatedTimeSavedMs: Math.round(estimatedTimeSavedMs),
      modelUsage,
      dailyBreakdown,
    };
  }

  /** Get productivity insights */
  getInsights(): ProductivityInsight[] {
    const insights: ProductivityInsight[] = [];
    const thisWeek = this.getMetrics('week');
    const lastWeek = this.getMetricsForPreviousPeriod('week');

    // WPM improvement
    if (lastWeek && thisWeek.avgWordsPerMinute > lastWeek.avgWordsPerMinute) {
      const improvement = thisWeek.avgWordsPerMinute - lastWeek.avgWordsPerMinute;
      if (improvement > 5) {
        insights.push({
          type: 'improvement',
          message: `Speaking speed up ${improvement} WPM this week`,
          metric: 'avgWordsPerMinute',
          value: thisWeek.avgWordsPerMinute,
          previousValue: lastWeek.avgWordsPerMinute,
        });
      }
    }

    // Accuracy milestone
    if (thisWeek.accuracyRate >= 0.95 && thisWeek.totalTranscriptions >= 10) {
      insights.push({
        type: 'milestone',
        message: '95%+ accuracy this week — voice commands are working well',
        metric: 'accuracyRate',
        value: thisWeek.accuracyRate,
      });
    }

    // Time saved
    if (thisWeek.estimatedTimeSavedMs > 600000) { // > 10 minutes
      const minutes = Math.round(thisWeek.estimatedTimeSavedMs / 60000);
      insights.push({
        type: 'milestone',
        message: `Saved ~${minutes} minutes vs typing this week`,
        metric: 'estimatedTimeSavedMs',
        value: thisWeek.estimatedTimeSavedMs,
      });
    }

    // Usage streak
    if (thisWeek.dailyBreakdown) {
      const activeDays = thisWeek.dailyBreakdown.filter(d => d.transcriptions > 0).length;
      if (activeDays >= 5) {
        insights.push({
          type: 'streak',
          message: `${activeDays}-day voice coding streak this week`,
          metric: 'activeDays',
          value: activeDays,
        });
      }
    }

    return insights;
  }

  /** Get total event count */
  get eventCount(): number {
    return this.events.length;
  }

  /** Clear all analytics data */
  clearAll(): void {
    this.events = [];
    this.saveEvents();
  }

  /** Export analytics as JSON */
  exportData(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      eventCount: this.events.length,
      events: this.events,
    }, null, 2);
  }

  private getMetricsForPreviousPeriod(period: TimePeriod): UsageMetrics | null {
    const now = Date.now();
    const currentStart = this.getPeriodStart(period, now);
    const previousStart = this.getPeriodStart(period, currentStart - 1);
    const filtered = this.events.filter(e => e.timestamp >= previousStart && e.timestamp < currentStart);

    if (filtered.length === 0) return null;

    // Simplified: just compute avgWPM for comparison
    const transcriptions = filtered.filter(e => e.type === 'transcription');
    const totalWords = transcriptions.reduce((sum, e) => sum + (e.wordCount || 0), 0);
    const totalMs = transcriptions.reduce((sum, e) => sum + (e.durationMs || 0), 0);

    return {
      ...this.getMetrics(period),
      avgWordsPerMinute: totalMs > 0 ? Math.round(totalWords / (totalMs / 60000)) : 0,
      from: previousStart,
      to: currentStart,
    };
  }

  private getPeriodStart(period: TimePeriod, from: number): number {
    switch (period) {
      case 'day': return from - 86400000;
      case 'week': return from - 604800000;
      case 'month': return from - 2592000000;
      case 'all': return 0;
    }
  }

  private getDailyBreakdown(transcriptions: UsageEvent[], from: number, to: number): Array<{ date: string; words: number; transcriptions: number }> {
    const days = new Map<string, { words: number; transcriptions: number }>();
    const msPerDay = 86400000;

    for (let t = from; t <= to; t += msPerDay) {
      const date = new Date(t).toISOString().slice(0, 10);
      days.set(date, { words: 0, transcriptions: 0 });
    }

    for (const event of transcriptions) {
      const date = new Date(event.timestamp).toISOString().slice(0, 10);
      const day = days.get(date);
      if (day) {
        day.words += event.wordCount || 0;
        day.transcriptions++;
      }
    }

    return [...days.entries()].map(([date, data]) => ({ date, ...data }));
  }

  private trimEvents(): void {
    // Keep max 100K events (~3 months of heavy use)
    if (this.events.length > 100000) {
      this.events = this.events.slice(-50000);
    }
  }

  private loadEvents(): void {
    if (!this.context) return;
    const saved = this.context.globalState.get<UsageEvent[]>('usageAnalytics');
    if (saved) this.events = saved;
  }

  private saveEvents(): void {
    if (!this.context) return;
    this.context.globalState.update('usageAnalytics', this.events);
  }

  private saveConfig(): void {
    vscode.workspace.getConfiguration('voxpilot').update('analytics.enabled', this.enabled, true);
  }
}

/** Singleton instance */
export const usageAnalytics = new UsageAnalytics();
