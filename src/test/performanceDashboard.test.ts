import { describe, it, expect } from 'vitest';
import { PerformanceCollector, percentile, formatDuration, formatRTF } from '../performanceDashboard';

describe('percentile', () => {
  it('returns 0 for empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('returns single value for single-element array', () => {
    expect(percentile([100], 50)).toBe(100);
    expect(percentile([100], 99)).toBe(100);
  });

  it('calculates p50 correctly', () => {
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
  });

  it('calculates p95 correctly', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(sorted, 95)).toBe(95);
  });

  it('calculates p99 correctly', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(sorted, 99)).toBe(99);
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(150)).toBe('150ms');
    expect(formatDuration(0)).toBe('0ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(30000)).toBe('30.0s');
  });

  it('formats minutes', () => {
    expect(formatDuration(90000)).toBe('1.5m');
  });
});

describe('formatRTF', () => {
  it('shows N/A for zero', () => {
    expect(formatRTF(0)).toBe('N/A');
  });

  it('shows faster than real-time for < 1.0', () => {
    expect(formatRTF(0.5)).toBe('0.50x (faster than real-time)');
  });

  it('shows plain factor for >= 1.0', () => {
    expect(formatRTF(1.5)).toBe('1.50x');
  });
});

describe('PerformanceCollector', () => {
  function makeMetric(overrides: Partial<{ processingTimeMs: number; audioDuration: number; model: string; success: boolean }> = {}) {
    return {
      timestamp: Date.now(),
      audioDuration: overrides.audioDuration ?? 2.0,
      processingTimeMs: overrides.processingTimeMs ?? 500,
      model: overrides.model ?? 'moonshine-base',
      language: 'en',
      transcriptLength: 20,
      success: overrides.success ?? true,
    };
  }

  it('starts empty', () => {
    const collector = new PerformanceCollector();
    expect(collector.count).toBe(0);
    expect(collector.getAll()).toEqual([]);
  });

  it('records metrics', () => {
    const collector = new PerformanceCollector();
    collector.record(makeMetric());
    expect(collector.count).toBe(1);
  });

  it('respects max size', () => {
    const collector = new PerformanceCollector(5);
    for (let i = 0; i < 10; i++) {
      collector.record(makeMetric());
    }
    expect(collector.count).toBe(5);
  });

  it('computes stats correctly', () => {
    const collector = new PerformanceCollector();
    collector.record(makeMetric({ processingTimeMs: 100 }));
    collector.record(makeMetric({ processingTimeMs: 200 }));
    collector.record(makeMetric({ processingTimeMs: 300 }));

    const stats = collector.getStats();
    expect(stats.totalTranscriptions).toBe(3);
    expect(stats.successCount).toBe(3);
    expect(stats.errorCount).toBe(0);
    expect(stats.avgLatencyMs).toBe(200);
  });

  it('tracks errors separately', () => {
    const collector = new PerformanceCollector();
    collector.record(makeMetric({ success: true }));
    collector.record(makeMetric({ success: false }));

    const stats = collector.getStats();
    expect(stats.successCount).toBe(1);
    expect(stats.errorCount).toBe(1);
  });

  it('groups stats by model', () => {
    const collector = new PerformanceCollector();
    collector.record(makeMetric({ model: 'moonshine-base', processingTimeMs: 100 }));
    collector.record(makeMetric({ model: 'whisper-base', processingTimeMs: 300 }));
    collector.record(makeMetric({ model: 'moonshine-base', processingTimeMs: 200 }));

    const stats = collector.getStats();
    expect(stats.byModel['moonshine-base'].count).toBe(2);
    expect(stats.byModel['whisper-base'].count).toBe(1);
    expect(stats.byModel['moonshine-base'].avgLatencyMs).toBe(150);
  });

  it('clear removes all metrics', () => {
    const collector = new PerformanceCollector();
    collector.record(makeMetric());
    collector.clear();
    expect(collector.count).toBe(0);
  });

  it('toJSON/load round-trips', () => {
    const collector = new PerformanceCollector();
    collector.record(makeMetric({ processingTimeMs: 123 }));
    const data = collector.toJSON();

    const collector2 = new PerformanceCollector();
    collector2.load(data);
    expect(collector2.count).toBe(1);
  });

  it('returns empty stats for no data', () => {
    const collector = new PerformanceCollector();
    const stats = collector.getStats();
    expect(stats.totalTranscriptions).toBe(0);
    expect(stats.avgLatencyMs).toBe(0);
    expect(stats.p50LatencyMs).toBe(0);
  });
});
