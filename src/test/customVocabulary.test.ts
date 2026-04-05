import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode before importing the module under test
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue([]),
    }),
  },
}));

import * as vscode from 'vscode';
import { applyCodeVocabulary, reloadCustomVocabulary } from '../codeVocabulary';

/** Helper to set up mock customVocabulary setting */
function mockCustomVocabulary(entries: Array<{ from: string; to: string }>) {
  const mockGet = vi.fn().mockImplementation((key: string) => {
    if (key === 'customVocabulary') { return entries; }
    return undefined;
  });
  (vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>).mockReturnValue({ get: mockGet });
  reloadCustomVocabulary();
}

describe('customVocabulary', () => {
  beforeEach(() => {
    // Reset to empty custom vocabulary
    mockCustomVocabulary([]);
  });

  it('applies user-defined corrections', () => {
    mockCustomVocabulary([
      { from: 'my lib', to: 'MyLib' },
      { from: 'k eight s', to: 'Kubernetes' },
    ]);

    expect(applyCodeVocabulary('use my lib with k eight s').text).toBe('use MyLib with Kubernetes');
  });

  it('user entries override built-in rules', () => {
    // Built-in: "jason" → "JSON". User overrides to something else.
    mockCustomVocabulary([{ from: 'jason', to: 'Jason' }]);

    expect(applyCodeVocabulary('call jason').text).toBe('call Jason');
  });

  it('matches case-insensitively', () => {
    mockCustomVocabulary([{ from: 'my app', to: 'MyApp' }]);

    expect(applyCodeVocabulary('open MY APP now').text).toBe('open MyApp now');
  });

  it('longer phrases match first', () => {
    mockCustomVocabulary([
      { from: 'react', to: 'React' },
      { from: 'react query', to: 'TanStack Query' },
    ]);

    expect(applyCodeVocabulary('use react query').text).toBe('use TanStack Query');
  });

  it('respects word boundaries', () => {
    mockCustomVocabulary([{ from: 'go', to: 'Go' }]);

    // "go" inside "google" should not be replaced
    const { text } = applyCodeVocabulary('google is not go');
    expect(text).toContain('google');
    expect(text).toContain('Go');
  });

  it('skips invalid entries gracefully', () => {
    mockCustomVocabulary([
      { from: '', to: 'Empty' },
      { from: 'valid', to: 'Valid' },
      null as unknown as { from: string; to: string },
      { from: 'also valid', to: 'AlsoValid' },
    ]);

    expect(applyCodeVocabulary('valid and also valid').text).toBe('Valid and AlsoValid');
  });

  it('works with empty custom vocabulary (built-ins still apply)', () => {
    mockCustomVocabulary([]);

    expect(applyCodeVocabulary('java script').text).toBe('JavaScript');
  });

  it('handles special regex characters in from phrase', () => {
    mockCustomVocabulary([{ from: 'c++', to: 'C++' }]);

    expect(applyCodeVocabulary('I love c++').text).toBe('I love C++');
  });
});
