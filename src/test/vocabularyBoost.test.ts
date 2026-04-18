import { describe, it, expect, vi } from 'vitest';
import { compileBoostEntry, validateEntry, applyBoostRules, VocabBoostEntry } from '../vocabularyBoost';

// Mock vscode
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => {
        if (key === 'vocabularyBoost') { return []; }
        if (key === 'vocabularyBoostEnabled') { return true; }
        return undefined;
      },
    }),
  },
}));

describe('validateEntry', () => {
  it('validates a complete entry', () => {
    const result = validateEntry({ term: 'kubectl', boost: 8.0, phoneme: 'cube-control' });
    expect(result).toEqual({ term: 'kubectl', boost: 8.0, phoneme: 'cube-control' });
  });

  it('defaults boost to 5.0', () => {
    const result = validateEntry({ term: 'nginx' });
    expect(result?.boost).toBe(5.0);
  });

  it('clamps boost to 1.0-10.0', () => {
    expect(validateEntry({ term: 'a', boost: 0 })?.boost).toBe(1.0);
    expect(validateEntry({ term: 'a', boost: 15 })?.boost).toBe(10.0);
  });

  it('rejects missing term', () => {
    expect(validateEntry({ boost: 5.0 })).toBeNull();
    expect(validateEntry({ term: '', boost: 5.0 })).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(validateEntry(null)).toBeNull();
    expect(validateEntry('string')).toBeNull();
    expect(validateEntry(42)).toBeNull();
  });

  it('strips empty phoneme', () => {
    const result = validateEntry({ term: 'test', phoneme: '  ' });
    expect(result?.phoneme).toBeUndefined();
  });
});

describe('compileBoostEntry', () => {
  it('creates pattern for term', () => {
    const entry: VocabBoostEntry = { term: 'kubectl', boost: 8.0 };
    const rule = compileBoostEntry(entry);
    expect(rule.patterns.length).toBe(1);
    expect(rule.replacement).toBe('kubectl');
    expect(rule.boost).toBe(8.0);
  });

  it('creates patterns for term + phoneme', () => {
    const entry: VocabBoostEntry = { term: 'kubectl', boost: 8.0, phoneme: 'cube-control' };
    const rule = compileBoostEntry(entry);
    // term + phoneme-with-hyphen + phoneme-with-space = 3 patterns
    expect(rule.patterns.length).toBe(3);
  });

  it('does not duplicate pattern when phoneme has no hyphens', () => {
    const entry: VocabBoostEntry = { term: 'nginx', boost: 5.0, phoneme: 'engine x' };
    const rule = compileBoostEntry(entry);
    expect(rule.patterns.length).toBe(2); // term + phoneme
  });
});

describe('applyBoostRules', () => {
  it('replaces phoneme with correct term', () => {
    const entry: VocabBoostEntry = { term: 'kubectl', boost: 8.0, phoneme: 'cube control' };
    const rules = [compileBoostEntry(entry)];
    expect(applyBoostRules('run cube control get pods', rules)).toBe('run kubectl get pods');
  });

  it('replaces term case-insensitively', () => {
    const entry: VocabBoostEntry = { term: 'Kubernetes', boost: 7.0 };
    const rules = [compileBoostEntry(entry)];
    expect(applyBoostRules('deploy to kubernetes', rules)).toBe('deploy to Kubernetes');
  });

  it('does not match partial words', () => {
    const entry: VocabBoostEntry = { term: 'go', boost: 5.0 };
    const rules = [compileBoostEntry(entry)];
    expect(applyBoostRules('google is good', rules)).toBe('google is good');
  });

  it('applies higher-boost rules first', () => {
    const rules = [
      compileBoostEntry({ term: 'Kubernetes', boost: 8.0, phoneme: 'kube' }),
      compileBoostEntry({ term: 'Docker', boost: 3.0, phoneme: 'docker' }),
    ].sort((a, b) => b.boost - a.boost);
    const result = applyBoostRules('deploy kube and docker', rules);
    expect(result).toBe('deploy Kubernetes and Docker');
  });

  it('returns text unchanged with no rules', () => {
    expect(applyBoostRules('hello world', [])).toBe('hello world');
  });
});
