import { describe, it, expect, beforeEach } from 'vitest';
import { TranscriptionExporter, TranscriptEntry, DEFAULT_EXPORT_CONFIG } from '../transcriptionExport';

describe('TranscriptionExporter', () => {
  let exporter: TranscriptionExporter;
  let sampleEntries: TranscriptEntry[];

  beforeEach(() => {
    exporter = new TranscriptionExporter();
    sampleEntries = [
      { text: 'hello world', timestamp: 1700000000000, durationMs: 1500, language: 'en', confidence: 0.95, activeFile: '/src/app.ts', model: 'moonshine-base' },
      { text: 'create a function', timestamp: 1700000002000, durationMs: 2000, language: 'en', confidence: 0.88, activeFile: '/src/app.ts', model: 'moonshine-base' },
      { text: 'save file', timestamp: 1700000005000, durationMs: 800, language: 'en', confidence: 0.92, activeFile: '/src/utils.ts', model: 'moonshine-base' },
    ];
  });

  describe('markdown export', () => {
    it('exports with timestamps by default', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'markdown' });
      expect(result).toContain('# VoxPilot Transcript');
      expect(result).toContain('**Entries:** 3');
      expect(result).toContain('hello world');
      expect(result).toContain('create a function');
      expect(result).toContain('save file');
    });

    it('includes confidence when configured', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'markdown', includeConfidence: true });
      expect(result).toContain('95%');
      expect(result).toContain('88%');
    });

    it('includes file info when configured', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'markdown', includeFileInfo: true });
      expect(result).toContain('app.ts');
      expect(result).toContain('utils.ts');
    });

    it('groups by file when configured', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'markdown', groupByFile: true });
      expect(result).toContain('## /src/app.ts');
      expect(result).toContain('## /src/utils.ts');
    });
  });

  describe('JSON export', () => {
    it('produces valid JSON', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'json' });
      const parsed = JSON.parse(result);
      expect(parsed.format).toBe('voxpilot-transcript-v1');
      expect(parsed.entryCount).toBe(3);
      expect(parsed.entries).toHaveLength(3);
    });

    it('includes timestamps in entries', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'json' });
      const parsed = JSON.parse(result);
      expect(parsed.entries[0].timestamp).toBe(1700000000000);
      expect(parsed.entries[0].time).toBeDefined();
    });

    it('includes confidence when configured', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'json', includeConfidence: true });
      const parsed = JSON.parse(result);
      expect(parsed.entries[0].confidence).toBe(0.95);
    });

    it('excludes confidence when not configured', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'json', includeConfidence: false });
      const parsed = JSON.parse(result);
      expect(parsed.entries[0].confidence).toBeUndefined();
    });

    it('includes exportedAt timestamp', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'json' });
      const parsed = JSON.parse(result);
      expect(parsed.exportedAt).toBeDefined();
    });
  });

  describe('SRT export', () => {
    it('produces valid SRT format', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'srt' });
      const lines = result.split('\n');
      // First entry
      expect(lines[0]).toBe('1');
      expect(lines[1]).toContain('-->');
      expect(lines[2]).toBe('hello world');
      expect(lines[3]).toBe('');
    });

    it('uses relative timestamps from session start', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'srt' });
      // First entry starts at 00:00:00,000
      expect(result).toContain('00:00:00,000');
    });

    it('calculates end time from duration', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'srt' });
      // First entry: start 0, duration 1500ms → end 00:00:01,500
      expect(result).toContain('00:00:01,500');
    });

    it('handles empty entries', () => {
      const result = exporter.export([], { ...DEFAULT_EXPORT_CONFIG, format: 'srt' });
      expect(result).toBe('');
    });

    it('numbers entries sequentially', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'srt' });
      expect(result).toContain('\n2\n');
      expect(result).toContain('\n3\n');
    });
  });

  describe('text export', () => {
    it('produces simple text with timestamps', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'text' });
      expect(result).toContain('hello world');
      expect(result).toContain('create a function');
      expect(result).toContain('save file');
      // Should have brackets for timestamps
      expect(result).toContain('[');
    });

    it('produces plain text without timestamps', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'text', includeTimestamps: false });
      expect(result).toBe('hello world\ncreate a function\nsave file');
    });
  });

  describe('filtering', () => {
    it('filters by date range', () => {
      const result = exporter.export(sampleEntries, {
        ...DEFAULT_EXPORT_CONFIG,
        format: 'json',
        fromDate: 1700000001000,
        toDate: 1700000004000,
      });
      const parsed = JSON.parse(result);
      expect(parsed.entries).toHaveLength(1);
      expect(parsed.entries[0].text).toBe('create a function');
    });

    it('filters by language', () => {
      const mixedEntries = [
        ...sampleEntries,
        { text: 'bonjour', timestamp: 1700000010000, language: 'fr' },
      ];
      const result = exporter.export(mixedEntries, {
        ...DEFAULT_EXPORT_CONFIG,
        format: 'json',
        languageFilter: 'fr',
      });
      const parsed = JSON.parse(result);
      expect(parsed.entries).toHaveLength(1);
      expect(parsed.entries[0].text).toBe('bonjour');
    });

    it('returns all when no filters set', () => {
      const result = exporter.export(sampleEntries, { ...DEFAULT_EXPORT_CONFIG, format: 'json' });
      const parsed = JSON.parse(result);
      expect(parsed.entries).toHaveLength(3);
    });
  });

  describe('getFormats', () => {
    it('returns all supported formats', () => {
      const formats = exporter.getFormats();
      expect(formats).toHaveLength(4);
      expect(formats.map(f => f.format)).toEqual(['markdown', 'json', 'srt', 'text']);
    });

    it('each format has label and description', () => {
      const formats = exporter.getFormats();
      for (const f of formats) {
        expect(f.label).toBeTruthy();
        expect(f.description).toBeTruthy();
      }
    });
  });
});
