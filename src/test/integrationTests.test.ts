import { describe, it, expect } from 'vitest';
import { runTestCase, runAllTests, getTestCategories, getTestCount, formatReport, INTEGRATION_TESTS } from '../integrationTests';

describe('Integration Tests Framework', () => {
  // Simple passthrough processor for testing the framework itself
  const passthroughProcessor = (text: string) => text;

  // Processor that handles basic punctuation commands
  const basicProcessor = (text: string) => {
    return text
      .replace(/\s+period$/i, '.')
      .replace(/\s+period\s+/i, '. ')
      .replace(/\s+comma\s+/i, ', ')
      .replace(/\s+question mark$/i, '?')
      .replace(/\s+exclamation mark$/i, '!')
      .replace(/\s+new line\s+/i, '\n')
      .replace(/\s+colon\s+/i, ': ')
      .replace(/\s+semicolon\s+/i, '; ');
  };

  describe('INTEGRATION_TESTS', () => {
    it('has test cases defined', () => {
      expect(INTEGRATION_TESTS.length).toBeGreaterThan(40);
    });

    it('all test cases have required fields', () => {
      for (const test of INTEGRATION_TESTS) {
        expect(test.name).toBeTruthy();
        expect(test.category).toBeTruthy();
        expect(typeof test.input).toBe('string');
        expect(typeof test.expectedOutput).toBe('string');
      }
    });

    it('covers multiple categories', () => {
      const categories = new Set(INTEGRATION_TESTS.map(t => t.category));
      expect(categories.size).toBeGreaterThan(8);
    });
  });

  describe('runTestCase', () => {
    it('returns passed for matching output', () => {
      const result = runTestCase(
        { name: 'test', category: 'test', input: 'hello', expectedOutput: 'hello' },
        passthroughProcessor,
      );
      expect(result.passed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns failed for mismatching output', () => {
      const result = runTestCase(
        { name: 'test', category: 'test', input: 'hello', expectedOutput: 'world' },
        passthroughProcessor,
      );
      expect(result.passed).toBe(false);
      expect(result.error).toContain('Expected');
    });

    it('handles processor errors gracefully', () => {
      const result = runTestCase(
        { name: 'test', category: 'test', input: 'hello', expectedOutput: '' },
        () => { throw new Error('processor crashed'); },
      );
      expect(result.passed).toBe(false);
      expect(result.error).toContain('processor crashed');
    });

    it('measures duration', () => {
      const result = runTestCase(
        { name: 'test', category: 'test', input: 'hello', expectedOutput: 'hello' },
        passthroughProcessor,
      );
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('includes input and output in result', () => {
      const result = runTestCase(
        { name: 'test', category: 'test', input: 'hello world', expectedOutput: 'hello world' },
        passthroughProcessor,
      );
      expect(result.input).toBe('hello world');
      expect(result.actual).toBe('hello world');
      expect(result.expected).toBe('hello world');
    });
  });

  describe('runAllTests', () => {
    it('runs all tests with passthrough processor', () => {
      const suite = runAllTests(passthroughProcessor);
      expect(suite.total).toBe(INTEGRATION_TESTS.length);
      expect(suite.passed + suite.failed + suite.skipped).toBe(suite.total);
      expect(suite.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('passthrough tests pass for passthrough category', () => {
      const suite = runAllTests(passthroughProcessor, { category: 'passthrough' });
      expect(suite.passed).toBeGreaterThan(0);
      expect(suite.failed).toBe(0);
    });

    it('filters by category', () => {
      const suite = runAllTests(passthroughProcessor, { category: 'punctuation' });
      expect(suite.results.every(r => r.category === 'punctuation')).toBe(true);
      expect(suite.skipped).toBeGreaterThan(0);
    });

    it('skips specified categories', () => {
      const suite = runAllTests(passthroughProcessor, { skip: ['punctuation', 'editor'] });
      expect(suite.results.every(r => r.category !== 'punctuation' && r.category !== 'editor')).toBe(true);
    });

    it('basic processor passes punctuation tests', () => {
      const suite = runAllTests(basicProcessor, { category: 'punctuation' });
      expect(suite.passed).toBeGreaterThan(3);
    });

    it('returns timestamp', () => {
      const suite = runAllTests(passthroughProcessor, { category: 'passthrough' });
      expect(suite.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getTestCategories', () => {
    it('returns all categories with counts', () => {
      const categories = getTestCategories();
      expect(categories.length).toBeGreaterThan(8);
      expect(categories.every(c => c.count > 0)).toBe(true);
    });

    it('sorted by count descending', () => {
      const categories = getTestCategories();
      for (let i = 1; i < categories.length; i++) {
        expect(categories[i].count).toBeLessThanOrEqual(categories[i - 1].count);
      }
    });

    it('includes expected categories', () => {
      const categories = getTestCategories().map(c => c.category);
      expect(categories).toContain('punctuation');
      expect(categories).toContain('editor');
      expect(categories).toContain('git');
      expect(categories).toContain('terminal');
      expect(categories).toContain('ai');
      expect(categories).toContain('passthrough');
    });
  });

  describe('getTestCount', () => {
    it('returns total test count', () => {
      expect(getTestCount()).toBe(INTEGRATION_TESTS.length);
      expect(getTestCount()).toBeGreaterThan(40);
    });
  });

  describe('formatReport', () => {
    it('produces markdown report', () => {
      const suite = runAllTests(passthroughProcessor, { category: 'passthrough' });
      const report = formatReport(suite);
      expect(report).toContain('# VoxPilot Integration Tests');
      expect(report).toContain('## Summary');
      expect(report).toContain('✅ Passed:');
    });

    it('includes failures section when tests fail', () => {
      const suite = runAllTests(passthroughProcessor, { category: 'punctuation' });
      const report = formatReport(suite);
      if (suite.failed > 0) {
        expect(report).toContain('## Failures');
        expect(report).toContain('❌');
      }
    });

    it('includes duration', () => {
      const suite = runAllTests(passthroughProcessor, { category: 'passthrough' });
      const report = formatReport(suite);
      expect(report).toContain('Duration:');
    });
  });
});
