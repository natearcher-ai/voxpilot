import { describe, it, expect } from 'vitest';
import { formatSize, formatSpeed, totalDiskUsage, findUnusedModels, getRecommendedModel, compareModels, MODEL_CATALOG, DownloadedModel } from '../offlineModelManager';

describe('formatSize', () => {
  it('formats bytes', () => {
    expect(formatSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatSize(65_000_000)).toBe('62.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatSize(1_500_000_000)).toBe('1.40 GB');
  });
});

describe('formatSpeed', () => {
  it('formats bytes per second', () => {
    expect(formatSpeed(500)).toBe('500 B/s');
  });

  it('formats KB/s', () => {
    expect(formatSpeed(5120)).toBe('5.0 KB/s');
  });

  it('formats MB/s', () => {
    expect(formatSpeed(5_242_880)).toBe('5.0 MB/s');
  });
});

describe('totalDiskUsage', () => {
  it('sums disk usage', () => {
    const models: DownloadedModel[] = [
      { id: 'a', path: '/a', diskSizeBytes: 100, downloadedAt: '' },
      { id: 'b', path: '/b', diskSizeBytes: 200, downloadedAt: '' },
    ];
    expect(totalDiskUsage(models)).toBe(300);
  });

  it('returns 0 for empty list', () => {
    expect(totalDiskUsage([])).toBe(0);
  });
});

describe('findUnusedModels', () => {
  it('finds models never used', () => {
    const models: DownloadedModel[] = [
      { id: 'a', path: '/a', diskSizeBytes: 100, downloadedAt: '2026-01-01' },
    ];
    expect(findUnusedModels(models, 30)).toHaveLength(1);
  });

  it('finds models not used in N days', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date().toISOString();
    const models: DownloadedModel[] = [
      { id: 'old', path: '/old', diskSizeBytes: 100, downloadedAt: '', lastUsedAt: old },
      { id: 'new', path: '/new', diskSizeBytes: 100, downloadedAt: '', lastUsedAt: recent },
    ];
    const unused = findUnusedModels(models, 30);
    expect(unused).toHaveLength(1);
    expect(unused[0].id).toBe('old');
  });
});

describe('getRecommendedModel', () => {
  it('recommends moonshine-base for English', () => {
    const model = getRecommendedModel(false);
    expect(model.id).toBe('moonshine-base');
    expect(model.recommended).toBe(true);
  });

  it('recommends whisper-base for multilingual', () => {
    const model = getRecommendedModel(true);
    expect(model.id).toBe('whisper-base');
  });
});

describe('compareModels', () => {
  it('compares two models', () => {
    const moonshine = MODEL_CATALOG.find(m => m.id === 'moonshine-base')!;
    const whisperSmall = MODEL_CATALOG.find(m => m.id === 'whisper-small')!;
    const result = compareModels(moonshine, whisperSmall);
    expect(result.sizeRatio).toContain('smaller');
    expect(result.speedDiff).toBeGreaterThan(0); // moonshine is faster
    expect(result.recommendation).toBeTruthy();
  });
});

describe('MODEL_CATALOG', () => {
  it('has 8 models', () => {
    expect(MODEL_CATALOG).toHaveLength(8);
  });

  it('has exactly one recommended model', () => {
    const recommended = MODEL_CATALOG.filter(m => m.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0].id).toBe('moonshine-base');
  });

  it('all models have required fields', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.sizeBytes).toBeGreaterThan(0);
      expect(model.accuracy).toBeGreaterThanOrEqual(1);
      expect(model.speed).toBeGreaterThanOrEqual(1);
      expect(model.repo).toBeTruthy();
    }
  });

  it('models are sorted by size within families', () => {
    const moonshine = MODEL_CATALOG.filter(m => m.family === 'moonshine');
    for (let i = 1; i < moonshine.length; i++) {
      expect(moonshine[i].sizeBytes).toBeGreaterThanOrEqual(moonshine[i - 1].sizeBytes);
    }
  });
});
