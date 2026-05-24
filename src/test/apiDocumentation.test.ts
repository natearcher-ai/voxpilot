import { describe, it, expect } from 'vitest';
import { generateApiDocs, exportAsMarkdown, exportAsJson, getPublicApiCount, searchDocs } from '../apiDocumentation';

describe('apiDocumentation', () => {
  it('generateApiDocs returns complete doc set', () => {
    const docs = generateApiDocs('0.9.5');
    expect(docs.version).toBe('0.9.5');
    expect(docs.generatedAt).toBeTruthy();
    expect(docs.entries.length).toBeGreaterThan(5);
    expect(docs.migrations.length).toBeGreaterThan(0);
    expect(docs.quickStart).toContain('Quick Start');
  });

  it('all entries have required fields', () => {
    const docs = generateApiDocs();
    for (const entry of docs.entries) {
      expect(entry.name).toBeTruthy();
      expect(entry.kind).toBeTruthy();
      expect(entry.module).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.since).toBeTruthy();
      expect(typeof entry.public).toBe('boolean');
      expect(typeof entry.deprecated).toBe('boolean');
    }
  });

  it('getPublicApiCount returns correct count', () => {
    const count = getPublicApiCount();
    expect(count).toBeGreaterThan(5);
  });

  it('exportAsMarkdown produces valid markdown', () => {
    const docs = generateApiDocs();
    const md = exportAsMarkdown(docs);
    expect(md).toContain('# VoxPilot API Reference');
    expect(md).toContain('## VoxPilotAPI');
    expect(md).toContain('## onTranscript');
    expect(md).toContain('## registerProcessor');
    expect(md).toContain('# Migration Guide');
    expect(md).toContain('```typescript');
  });

  it('exportAsMarkdown includes properties tables', () => {
    const docs = generateApiDocs();
    const md = exportAsMarkdown(docs);
    expect(md).toContain('| Name | Type | Description | Optional |');
    expect(md).toContain('`version`');
    expect(md).toContain('`isRecording`');
  });

  it('exportAsMarkdown includes examples', () => {
    const docs = generateApiDocs();
    const md = exportAsMarkdown(docs);
    expect(md).toContain('natearcher-ai.voxpilot');
    expect(md).toContain('registerProcessor');
  });

  it('exportAsJson produces valid JSON', () => {
    const docs = generateApiDocs();
    const json = exportAsJson(docs);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBeDefined();
    expect(parsed.entries).toBeInstanceOf(Array);
    expect(parsed.migrations).toBeInstanceOf(Array);
  });

  it('searchDocs finds by name', () => {
    const results = searchDocs('registerProcessor');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('registerProcessor');
  });

  it('searchDocs finds by description', () => {
    const results = searchDocs('pipeline');
    expect(results.length).toBeGreaterThan(0);
  });

  it('searchDocs finds by module', () => {
    const results = searchDocs('extensionApi');
    expect(results.length).toBeGreaterThan(5);
  });

  it('searchDocs returns empty for no match', () => {
    const results = searchDocs('xyznonexistent');
    expect(results).toHaveLength(0);
  });

  it('searchDocs is case-insensitive', () => {
    const results = searchDocs('VOXPILOTAPI');
    expect(results.length).toBeGreaterThan(0);
  });

  it('migrations have required fields', () => {
    const docs = generateApiDocs();
    for (const step of docs.migrations) {
      expect(step.change).toBeTruthy();
      expect(step.before).toBeTruthy();
      expect(step.after).toBeTruthy();
      expect(step.version).toBeTruthy();
      expect(typeof step.breaking).toBe('boolean');
    }
  });

  it('quickStart contains code examples', () => {
    const docs = generateApiDocs();
    expect(docs.quickStart).toContain('getExtension');
    expect(docs.quickStart).toContain('onTranscript');
    expect(docs.quickStart).toContain('registerProcessor');
    expect(docs.quickStart).toContain('registerCommand');
    expect(docs.quickStart).toContain('startRecording');
  });
});
