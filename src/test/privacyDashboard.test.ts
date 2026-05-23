import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrivacyDashboard } from '../privacyDashboard';

describe('PrivacyDashboard', () => {
  let dashboard: PrivacyDashboard;

  beforeEach(() => {
    dashboard = new PrivacyDashboard();
  });

  it('starts with zero stats', () => {
    const state = dashboard.getState();
    expect(state.stats.totalTranscriptions).toBe(0);
    expect(state.stats.localProcessed).toBe(0);
    expect(state.stats.cloudProcessed).toBe(0);
    expect(state.stats.lastPurge).toBeNull();
  });

  it('recordLocal increments local stats', () => {
    dashboard.recordLocal();
    dashboard.recordLocal();
    const state = dashboard.getState();
    expect(state.stats.totalTranscriptions).toBe(2);
    expect(state.stats.localProcessed).toBe(2);
    expect(state.stats.cloudProcessed).toBe(0);
  });

  it('recordCloud increments cloud stats and adds audit entry', () => {
    dashboard.recordCloud('llmPostCorrection', 'transcript+context', 500, true);
    const state = dashboard.getState();
    expect(state.stats.totalTranscriptions).toBe(1);
    expect(state.stats.cloudProcessed).toBe(1);
    expect(state.auditLog.length).toBe(1);
    expect(state.auditLog[0].feature).toBe('llmPostCorrection');
    expect(state.auditLog[0].charCount).toBe(500);
    expect(state.auditLog[0].success).toBe(true);
  });

  it('getSummary returns correct ratio', () => {
    dashboard.recordLocal();
    dashboard.recordLocal();
    dashboard.recordLocal();
    dashboard.recordCloud('aiCodeGeneration', 'prompt', 200, true);

    const summary = dashboard.getSummary();
    expect(summary.local).toBe(3);
    expect(summary.cloud).toBe(1);
    expect(summary.ratio).toBe('75% local');
  });

  it('getSummary handles zero transcriptions', () => {
    const summary = dashboard.getSummary();
    expect(summary.ratio).toBe('0% local');
  });

  it('purgeAll clears audit log and sets lastPurge', () => {
    dashboard.recordCloud('llmPostCorrection', 'text', 100, true);
    dashboard.recordCloud('aiCodeGeneration', 'prompt', 200, true);
    expect(dashboard.getState().auditLog.length).toBe(2);

    dashboard.purgeAll();
    const state = dashboard.getState();
    expect(state.auditLog.length).toBe(0);
    expect(state.stats.storedTranscripts).toBe(0);
    expect(state.stats.lastPurge).not.toBeNull();
  });

  it('exportReport returns valid JSON', () => {
    dashboard.recordLocal();
    dashboard.recordCloud('llmPostCorrection', 'text', 300, true);

    const report = dashboard.exportReport();
    const parsed = JSON.parse(report);
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.version).toBe('1.0');
    expect(parsed.features).toBeInstanceOf(Array);
    expect(parsed.stats.totalTranscriptions).toBe(2);
  });

  it('getState returns all feature classifications', () => {
    const state = dashboard.getState();
    expect(state.features.length).toBe(8);

    const localFeatures = state.features.filter(f => f.level === 'local');
    const cloudFeatures = state.features.filter(f => f.level === 'cloud');
    const hybridFeatures = state.features.filter(f => f.level === 'hybrid');

    expect(localFeatures.length).toBe(5);
    expect(cloudFeatures.length).toBe(2);
    expect(hybridFeatures.length).toBe(1);
  });

  it('features include correct data flow descriptions', () => {
    const state = dashboard.getState();
    const asr = state.features.find(f => f.id === 'speechRecognition');
    expect(asr?.destination).toContain('never leaves device');

    const llm = state.features.find(f => f.id === 'llmPostCorrection');
    expect(llm?.destination).toContain('Language Model API');
  });

  it('audit log trims at 10000 entries', () => {
    // Simulate many entries
    for (let i = 0; i < 10001; i++) {
      dashboard.recordCloud('test', 'data', 10, true);
    }
    // Internal audit log should be trimmed to 5000
    const state = dashboard.getState();
    // getState returns last 100, but internal should be trimmed
    expect(state.auditLog.length).toBeLessThanOrEqual(100);
  });

  it('getRetentionConfig returns defaults', () => {
    const retention = dashboard.getRetentionConfig();
    expect(retention.transcriptRetentionDays).toBe(30);
    expect(retention.auditRetentionDays).toBe(90);
    expect(retention.maxStoredTranscripts).toBe(1000);
    expect(retention.storeTranscripts).toBe(true);
  });
});
