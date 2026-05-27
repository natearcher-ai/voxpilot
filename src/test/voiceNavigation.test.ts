import { describe, it, expect } from 'vitest';
import { matchNavigation, inferTestFilePath, parseLineNumber } from '../voiceNavigation';

describe('matchNavigation', () => {
  it('matches "go to file" with argument', () => {
    const result = matchNavigation('go to file app.ts');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('go-to-file');
    expect(result!.argument).toBe('app.ts');
  });

  it('matches "go to file" without argument', () => {
    const result = matchNavigation('go to file');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('go-to-file');
    expect(result!.argument).toBe('');
  });

  it('matches "find function" with name', () => {
    const result = matchNavigation('find function handleClick');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('find-function');
    expect(result!.argument).toBe('handleClick');
  });

  it('matches "open test"', () => {
    const result = matchNavigation('open test');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('open-test');
  });

  it('matches "go to line 42"', () => {
    const result = matchNavigation('go to line 42');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('go-to-line');
    expect(result!.argument).toBe('42');
  });

  it('matches "switch to previous"', () => {
    const result = matchNavigation('switch to previous');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('switch-previous');
  });

  it('matches longer triggers before shorter ones', () => {
    // "go to file" should match before "go to" would if it existed
    const result = matchNavigation('go to file main.ts');
    expect(result!.type).toBe('go-to-file');
  });

  it('returns null for non-navigation text', () => {
    expect(matchNavigation('hello world')).toBeNull();
    expect(matchNavigation('the file is broken')).toBeNull();
  });

  it('is case insensitive', () => {
    const result = matchNavigation('GO TO FILE app.ts');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('go-to-file');
  });
});

describe('inferTestFilePath', () => {
  it('generates test file candidates from source path', () => {
    const candidates = inferTestFilePath('src/utils/helper.ts');
    expect(candidates).toContain('src/utils/test/helper.test.ts');
    expect(candidates).toContain('src/utils/__tests__/helper.test.ts');
    expect(candidates).toContain('src/utils/helper.spec.ts');
  });

  it('handles src → test directory swap', () => {
    const candidates = inferTestFilePath('src/services/auth.ts');
    expect(candidates).toContain('test/services/auth.test.ts');
  });

  it('generates Python test file conventions', () => {
    const candidates = inferTestFilePath('src/utils/helper.py');
    expect(candidates.some(c => c.includes('test_helper.py'))).toBe(true);
  });
});

describe('parseLineNumber', () => {
  it('parses numeric string', () => {
    expect(parseLineNumber('42')).toBe(42);
  });

  it('parses number with extra text', () => {
    expect(parseLineNumber('line 100')).toBe(100);
  });

  it('parses word numbers', () => {
    expect(parseLineNumber('twenty')).toBe(20);
    expect(parseLineNumber('forty two')).toBe(42);
  });

  it('returns null for unparseable text', () => {
    expect(parseLineNumber('')).toBeNull();
    expect(parseLineNumber('hello')).toBeNull();
  });
});
