import { describe, it, expect, vi } from 'vitest';
import { matchNavigation, inferTestFilePath, parseLineNumber } from '../voiceNavigation';

// Mock vscode
vi.mock('vscode', () => ({
  commands: { executeCommand: async () => {} },
  window: { activeTextEditor: undefined, showWarningMessage: () => {} },
  workspace: { openTextDocument: async () => ({}) },
  Uri: { file: (p: string) => ({ fsPath: p }) },
}));

describe('matchNavigation', () => {
  it('matches "go to file" with argument', () => {
    const result = matchNavigation('go to file app.ts');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('go-to-file');
    expect(result!.argument).toBe('app.ts');
  });

  it('matches "find function" with argument', () => {
    const result = matchNavigation('find function handleClick');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('find-function');
    expect(result!.argument).toBe('handleClick');
  });

  it('matches "find class"', () => {
    const result = matchNavigation('find class UserService');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('find-class');
  });

  it('matches "open test"', () => {
    const result = matchNavigation('open test');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('open-test');
  });

  it('matches "go back" as switch-previous', () => {
    const result = matchNavigation('go back');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('switch-previous');
  });

  it('matches "go to line 42"', () => {
    const result = matchNavigation('go to line 42');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('go-to-line');
    expect(result!.argument).toBe('42');
  });

  it('matches "open recent"', () => {
    const result = matchNavigation('open recent');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('open-recent');
  });

  it('is case-insensitive', () => {
    const result = matchNavigation('Go To File main.ts');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('go-to-file');
  });

  it('returns null for non-navigation text', () => {
    expect(matchNavigation('hello world')).toBeNull();
    expect(matchNavigation('create a function')).toBeNull();
  });
});

describe('inferTestFilePath', () => {
  it('generates test file candidates for TypeScript', () => {
    const candidates = inferTestFilePath('src/utils/helper.ts');
    expect(candidates).toContain('src/utils/test/helper.test.ts');
    expect(candidates).toContain('src/utils/__tests__/helper.test.ts');
    expect(candidates).toContain('src/utils/helper.spec.ts');
  });

  it('generates test candidates with src→test swap', () => {
    const candidates = inferTestFilePath('src/components/Button.tsx');
    expect(candidates).toContain('test/components/Button.test.tsx');
  });

  it('generates Python test candidates', () => {
    const candidates = inferTestFilePath('src/utils/helper.py');
    expect(candidates.some(c => c.includes('test_helper.py'))).toBe(true);
  });
});

describe('parseLineNumber', () => {
  it('parses numeric strings', () => {
    expect(parseLineNumber('42')).toBe(42);
    expect(parseLineNumber('100')).toBe(100);
  });

  it('parses word numbers', () => {
    expect(parseLineNumber('ten')).toBe(10);
    expect(parseLineNumber('twenty')).toBe(20);
  });

  it('parses compound word numbers', () => {
    expect(parseLineNumber('forty two')).toBe(42);
  });

  it('returns null for non-numeric text', () => {
    expect(parseLineNumber('hello')).toBeNull();
    expect(parseLineNumber('')).toBeNull();
  });

  it('handles "line" prefix', () => {
    expect(parseLineNumber('line 55')).toBe(55);
  });
});
