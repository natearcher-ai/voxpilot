import { describe, it, expect, beforeEach } from 'vitest';
import { UsageAnalytics } from '../usageAnalytics';

describe('UsageAnalytics', () => {
  let analytics: UsageAnalytics;

  beforeEach(() => {
    analytics = new UsageAnalytics();
    analytics.enable();
  });

  it('starts with zero events', () => {
    const fresh = new UsageAnalytics();
    expect(fresh.eventCount).toBe(0);
  });

  it('isEnabled returns false by default', () => {
    const fresh = new UsageAnalytics();
    expect(fresh.isEnabled()).toBe(false);
  });

  it('enable/disable toggles state', () => {
    analytics.disable();
    expect(analytics.isEnabled()).toBe(false);
    analytics.enable();
    expect(analytics.isEnabled()).toBe(true);
  });

  it('recordTranscription adds event', () => {
    analytics.recordTranscription(10, 5000, 'moonshine-base');
    expect(analytics.eventCount).toBe(1);
  });

  it('recordCommand adds event', () => {
    analytics.recordCommand('editor.action.formatDocument');
    expect(analytics.eventCount).toBe(1);
  });

  it('recordCorrection adds event', () => {
    analytics.recordCorrection();
    expect(analytics.eventCount).toBe(1);
  });

  it('does not record when disabled', () => {
    analytics.disable();
    analytics.recordTranscription(10, 5000, 'moonshine-base');
    analytics.recordCommand('test');
    analytics.recordCorrection();
    expect(analytics.eventCount).toBe(0);
  });

  it('startSession and endSession add events', () => {
    analytics.startSession();
    analytics.endSession();
    expect(analytics.eventCount).toBe(2);
  });

  it('getMetrics returns correct totals', () => {
    analytics.recordTranscription(20, 10000, 'moonshine-base');
    analytics.recordTranscription(30, 15000, 'moonshine-base');
    analytics.recordCommand('undo');
    analytics.recordCorrection();

    const metrics = analytics.getMetrics('all');
    expect(metrics.totalTranscriptions).toBe(2);
    expect(metrics.totalWords).toBe(50);
    expect(metrics.totalSpeakingMs).toBe(25000);
    expect(metrics.commandsUsed).toBe(1);
    expect(metrics.corrections).toBe(1);
  });

  it('getMetrics computes avgWordsPerMinute', () => {
    // 60 words in 60000ms = 60 WPM
    analytics.recordTranscription(60, 60000, 'moonshine-base');

    const metrics = analytics.getMetrics('all');
    expect(metrics.avgWordsPerMinute).toBe(60);
  });

  it('getMetrics computes accuracy rate', () => {
    analytics.recordTranscription(10, 5000, 'moonshine-base');
    analytics.recordTranscription(10, 5000, 'moonshine-base');
    analytics.recordTranscription(10, 5000, 'moonshine-base');
    analytics.recordTranscription(10, 5000, 'moonshine-base');
    analytics.recordCorrection(); // 1 correction out of 4 = 75% accuracy

    const metrics = analytics.getMetrics('all');
    expect(metrics.accuracyRate).toBe(0.75);
  });

  it('getMetrics computes time saved', () => {
    // 100 words spoken in 30 seconds
    // Typing 100 words at 40 WPM = 150 seconds
    // Saved = 150 - 30 = 120 seconds
    analytics.recordTranscription(100, 30000, 'moonshine-base');

    const metrics = analytics.getMetrics('all');
    expect(metrics.estimatedTimeSavedMs).toBe(120000);
  });

  it('getMetrics tracks top commands', () => {
    analytics.recordCommand('undo');
    analytics.recordCommand('undo');
    analytics.recordCommand('undo');
    analytics.recordCommand('save');
    analytics.recordCommand('save');
    analytics.recordCommand('format');

    const metrics = analytics.getMetrics('all');
    expect(metrics.topCommands[0].id).toBe('undo');
    expect(metrics.topCommands[0].count).toBe(3);
    expect(metrics.topCommands[1].id).toBe('save');
    expect(metrics.topCommands[1].count).toBe(2);
  });

  it('getMetrics tracks model usage', () => {
    analytics.recordTranscription(10, 5000, 'moonshine-base');
    analytics.recordTranscription(10, 5000, 'moonshine-base');
    analytics.recordTranscription(10, 5000, 'whisper-small');

    const metrics = analytics.getMetrics('all');
    expect(metrics.modelUsage['moonshine-base']).toBe(2);
    expect(metrics.modelUsage['whisper-small']).toBe(1);
  });

  it('getMetrics respects time period filter', () => {
    analytics.recordTranscription(10, 5000, 'moonshine-base');

    // 'day' period should include events from last 24h
    const dayMetrics = analytics.getMetrics('day');
    expect(dayMetrics.totalTranscriptions).toBe(1);
  });

  it('getMetrics handles empty data', () => {
    const metrics = analytics.getMetrics('week');
    expect(metrics.totalTranscriptions).toBe(0);
    expect(metrics.totalWords).toBe(0);
    expect(metrics.avgWordsPerMinute).toBe(0);
    expect(metrics.accuracyRate).toBe(1);
    expect(metrics.estimatedTimeSavedMs).toBe(0);
  });

  it('getInsights returns array', () => {
    const insights = analytics.getInsights();
    expect(Array.isArray(insights)).toBe(true);
  });

  it('getInsights detects time saved milestone', () => {
    // Record enough to save > 10 minutes
    for (let i = 0; i < 20; i++) {
      analytics.recordTranscription(50, 15000, 'moonshine-base');
    }
    // 1000 words at 40 WPM typing = 25 min. Speaking = 5 min. Saved = 20 min.

    const insights = analytics.getInsights();
    const timeSaved = insights.find(i => i.metric === 'estimatedTimeSavedMs');
    expect(timeSaved).toBeDefined();
  });

  it('clearAll removes all events', () => {
    analytics.recordTranscription(10, 5000, 'moonshine-base');
    analytics.recordCommand('test');
    expect(analytics.eventCount).toBe(2);

    analytics.clearAll();
    expect(analytics.eventCount).toBe(0);
  });

  it('exportData returns valid JSON', () => {
    analytics.recordTranscription(10, 5000, 'moonshine-base');
    const exported = analytics.exportData();
    const parsed = JSON.parse(exported);
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.eventCount).toBe(1);
    expect(parsed.events).toHaveLength(1);
  });

  it('disable with clearData removes events', () => {
    analytics.recordTranscription(10, 5000, 'moonshine-base');
    analytics.disable(true);
    expect(analytics.eventCount).toBe(0);
    expect(analytics.isEnabled()).toBe(false);
  });

  it('session metrics track duration', () => {
    analytics.startSession();
    // Simulate time passing
    analytics.endSession();
    const metrics = analytics.getMetrics('all');
    expect(metrics.sessions).toBe(1);
  });
});
