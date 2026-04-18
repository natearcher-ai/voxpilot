import { describe, it, expect, vi } from 'vitest';
import { normalizePhrase, findMatchingMacro, VoiceMacro, EXAMPLE_MACROS } from '../voiceMacros';

// Mock vscode
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => {
        if (key === 'voiceMacroDefinitions') { return []; }
        return undefined;
      },
    }),
  },
  window: {
    activeTextEditor: undefined,
    activeTerminal: undefined,
    createTerminal: () => ({ show: () => {}, sendText: () => {} }),
  },
  commands: {
    executeCommand: async () => {},
  },
  SnippetString: class { constructor(public value: string) {} },
}));

describe('normalizePhrase', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizePhrase('Insert Header!')).toBe('insert header');
  });

  it('collapses whitespace', () => {
    expect(normalizePhrase('  wrap   try   catch  ')).toBe('wrap try catch');
  });

  it('handles empty string', () => {
    expect(normalizePhrase('')).toBe('');
  });
});

describe('findMatchingMacro', () => {
  const macros: VoiceMacro[] = [
    { phrase: 'insert header', actions: [{ type: 'insert', value: '// header' }] },
    { phrase: 'wrap try catch', actions: [{ type: 'wrap', value: 'try {', suffix: '}' }] },
    { phrase: 'run tests', actions: [{ type: 'terminal', value: 'npm test' }] },
  ];

  it('matches exact phrase', () => {
    const result = findMatchingMacro('insert header', macros);
    expect(result?.phrase).toBe('insert header');
  });

  it('matches case-insensitively', () => {
    const result = findMatchingMacro('Insert Header', macros);
    expect(result?.phrase).toBe('insert header');
  });

  it('matches phrase at start of transcript', () => {
    const result = findMatchingMacro('run tests please', macros);
    expect(result?.phrase).toBe('run tests');
  });

  it('returns undefined for no match', () => {
    expect(findMatchingMacro('hello world', macros)).toBeUndefined();
  });

  it('prefers longer phrase (greedy match)', () => {
    const macrosWithOverlap: VoiceMacro[] = [
      { phrase: 'wrap', actions: [{ type: 'insert', value: 'a' }] },
      { phrase: 'wrap try catch', actions: [{ type: 'insert', value: 'b' }] },
    ];
    const result = findMatchingMacro('wrap try catch block', macrosWithOverlap);
    expect(result?.phrase).toBe('wrap try catch');
  });

  it('does not match partial words', () => {
    // "insert" should not match "insert header" if transcript is just "insert"
    const result = findMatchingMacro('insert', macros);
    expect(result).toBeUndefined(); // "insert" !== "insert header"
  });

  it('handles empty macros list', () => {
    expect(findMatchingMacro('anything', [])).toBeUndefined();
  });
});

describe('EXAMPLE_MACROS', () => {
  it('has 4 built-in examples', () => {
    expect(EXAMPLE_MACROS).toHaveLength(4);
  });

  it('all examples have valid structure', () => {
    for (const macro of EXAMPLE_MACROS) {
      expect(macro.phrase).toBeTruthy();
      expect(macro.actions.length).toBeGreaterThan(0);
      expect(macro.description).toBeTruthy();
    }
  });
});
