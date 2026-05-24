import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceAudit, PerfTimer } from '../performanceAudit';

describe('PerfTimer', () => {
  it('measures elapsed time', async () => {
    const timer = new PerfTimer('test', 'pipeline');
    await new Promise(r => setTimeout(r, 10));
    const measurement = timer.stop();
    expect(measurement.durationMs).toBeGreaterThanOrEqual(5);
    expect(measurement.name).toBe('test');
    expect(measurement.category).toBe('pipeline');
  });

  it('elapsed returns time without stopping', async () => {
    const timer = new PerfTimer('test', 'pipeline');
    await new Promise(r => setTimeout(r, 5));
    const elapsed = timer.elapsed();
    expect(elapsed).toBeGreaterThanOrEqual(3);
  });

  it('marks slow operations', async () => {
    const timer = new PerfTimer('slow-op', 'pipeline');
    await new Promise(r => setTimeout(r, 110));
    const measurement = timer.stop();
    expect(measurement.slow).toBe(true);
  });

  it('marks fast operations as not slow', () => {
    const timer = new PerfTimer('fast-op', 'pipeline');
    const measurement = timer.stop();
    expect(measurement.slow).toBe(false);
  });
});

describe('PerformanceAudit', () => {
  let audit: PerformanceAudit;

  beforeEach(() => {
    audit = new PerformanceAudit({ enabled: true, slowThresholdMs: 100, maxMeasurements: 100, logSlowOps: false, targetStartupMs: 500, targetPipelineMs: 50 });
  });

  it('starts with no measurements', () => {
    expect(audit.count).toBe(0);
    expect(audit.getMeasurements()).toHaveLength(0);
  });

  it('isEnabled reflects config', () => {
    expect(audit.isEnabled()).toBe(true);
    audit.disable();
    expect(audit.isEnabled()).toBe(false);
    audit.enable();
    expect(audit.isEnabled()).toBe(true);
  });

  it('record adds measurement', () => {
    audit.record({ name: 'test', category: 'pipeline', durationMs: 25, timestamp: Date.now(), slow: false });
    expect(audit.count).toBe(1);
  });

  it('record does nothing when disabled', () => {
    audit.disable();
    audit.record({ name: 'test', category: 'pipeline', durationMs: 25, timestamp: Date.now(), slow: false });
    expect(audit.count).toBe(0);
  });

  it('time measures synchronous function', () => {
    const result = audit.time('add', 'pipeline', () => 1 + 1);
    expect(result).toBe(2);
    expect(audit.count).toBe(1);
  });

  it('timeAsync measures async function', async () => {
    const result = await audit.timeAsync('fetch', 'network', async () => {
      await new Promise(r => setTimeout(r, 5));
      return 'done';
    });
    expect(result).toBe('done');
    expect(audit.count).toBe(1);
  });

  it('recordStartup stores startup time', () => {
    audit.recordStartup(350);
    const summary = audit.getSummary();
    expect(summary.startupMs).toBe(350);
  });

  it('getByCategory filters correctly', () => {
    audit.record({ name: 'a', category: 'pipeline', durationMs: 10, timestamp: Date.now(), slow: false });
    audit.record({ name: 'b', category: 'audio', durationMs: 20, timestamp: Date.now(), slow: false });
    audit.record({ name: 'c', category: 'pipeline', durationMs: 30, timestamp: Date.now(), slow: false });

    expect(audit.getByCategory('pipeline')).toHaveLength(2);
    expect(audit.getByCategory('audio')).toHaveLength(1);
    expect(audit.getByCategory('model')).toHaveLength(0);
  });

  it('getSlowOperations returns only slow ones', () => {
    audit.record({ name: 'fast', category: 'pipeline', durationMs: 10, timestamp: Date.now(), slow: false });
    audit.record({ name: 'slow', category: 'pipeline', durationMs: 200, timestamp: Date.now(), slow: true });
    audit.record({ name: 'medium', category: 'pipeline', durationMs: 50, timestamp: Date.now(), slow: false });

    const slow = audit.getSlowOperations();
    expect(slow).toHaveLength(1);
    expect(slow[0].name).toBe('slow');
  });

  it('getSummary computes averages', () => {
    audit.record({ name: 'p1', category: 'pipeline', durationMs: 20, timestamp: Date.now(), slow: false });
    audit.record({ name: 'p2', category: 'pipeline', durationMs: 40, timestamp: Date.now(), slow: false });
    audit.record({ name: 'p3', category: 'pipeline', durationMs: 60, timestamp: Date.now(), slow: false });

    const summary = audit.getSummary();
    expect(summary.avgPipelineMs).toBe(40);
    expect(summary.totalMeasurements).toBe(3);
    expect(summary.slowOperations).toBe(0);
  });

  it('getSummary computes p95', () => {
    for (let i = 0; i < 100; i++) {
      audit.record({ name: `p${i}`, category: 'pipeline', durationMs: i + 1, timestamp: Date.now(), slow: false });
    }
    const summary = audit.getSummary();
    expect(summary.p95PipelineMs).toBeGreaterThanOrEqual(95);
  });

  it('getSummary returns score', () => {
    audit.recordStartup(300);
    audit.record({ name: 'fast', category: 'pipeline', durationMs: 20, timestamp: Date.now(), slow: false });
    const summary = audit.getSummary();
    expect(summary.score).toBeGreaterThan(80);
  });

  it('getSummary penalizes slow startup', () => {
    audit.recordStartup(2000);
    const summary = audit.getSummary();
    expect(summary.score).toBeLessThan(90);
  });

  it('clear removes all measurements', () => {
    audit.record({ name: 'a', category: 'pipeline', durationMs: 10, timestamp: Date.now(), slow: false });
    audit.record({ name: 'b', category: 'pipeline', durationMs: 20, timestamp: Date.now(), slow: false });
    audit.clear();
    expect(audit.count).toBe(0);
  });

  it('export returns valid JSON', () => {
    audit.record({ name: 'test', category: 'pipeline', durationMs: 25, timestamp: Date.now(), slow: false });
    const json = audit.export();
    const parsed = JSON.parse(json);
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.summary).toBeDefined();
    expect(parsed.measurements).toHaveLength(1);
  });

  it('trims measurements when exceeding max', () => {
    for (let i = 0; i < 150; i++) {
      audit.record({ name: `m${i}`, category: 'pipeline', durationMs: 1, timestamp: Date.now(), slow: false });
    }
    expect(audit.count).toBeLessThanOrEqual(100);
  });

  it('getConfig returns current config', () => {
    const config = audit.getConfig();
    expect(config.slowThresholdMs).toBe(100);
    expect(config.targetStartupMs).toBe(500);
  });

  it('setConfig updates config', () => {
    audit.setConfig({ slowThresholdMs: 200 });
    expect(audit.getConfig().slowThresholdMs).toBe(200);
  });

  it('startTimer creates a timer', () => {
    const timer = audit.startTimer('test-op', 'io');
    expect(timer).toBeInstanceOf(PerfTimer);
  });
});
