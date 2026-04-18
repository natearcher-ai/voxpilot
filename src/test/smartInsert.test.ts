import { describe, it, expect } from 'vitest';
import { detectCursorContext, formatForContext } from '../smartInsert';

describe('detectCursorContext', () => {
  it('detects line comment context (//) ', () => {
    expect(detectCursorContext('  // some comment here', 22)).toBe('comment');
    expect(detectCursorContext('  // ', 5)).toBe('comment');
  });

  it('detects hash comment context (#)', () => {
    expect(detectCursorContext('  # python comment', 18)).toBe('comment');
  });

  it('detects block comment context', () => {
    expect(detectCursorContext('  /* block comment ', 19)).toBe('comment');
  });

  it('does not detect closed block comment', () => {
    expect(detectCursorContext('  /* closed */ code', 19)).toBe('code');
  });

  it('detects single-quoted string context', () => {
    expect(detectCursorContext("const x = 'hello ", 17)).toBe('string');
  });

  it('detects double-quoted string context', () => {
    expect(detectCursorContext('const x = "hello ', 17)).toBe('string');
  });

  it('detects backtick string context', () => {
    expect(detectCursorContext('const x = `hello ', 17)).toBe('string');
  });

  it('does not detect closed string', () => {
    expect(detectCursorContext('const x = "hello" + ', 20)).toBe('code');
  });

  it('detects function signature context', () => {
    expect(detectCursorContext('function greet(', 15)).toBe('function-sig');
    expect(detectCursorContext('const fn = (', 12)).toBe('function-sig');
  });

  it('does not detect closed parens as function sig', () => {
    expect(detectCursorContext('function greet() { ', 19)).toBe('code');
  });

  it('returns code for plain code context', () => {
    expect(detectCursorContext('const x = ', 10)).toBe('code');
  });

  it('returns unknown for empty line', () => {
    expect(detectCursorContext('', 0)).toBe('unknown');
  });

  it('ignores comment markers inside strings', () => {
    expect(detectCursorContext('const x = "// not a comment" + ', 31)).toBe('code');
  });
});

describe('formatForContext', () => {
  it('returns raw text for string context', () => {
    expect(formatForContext('hello world', 'string')).toBe('hello world');
  });

  it('capitalizes and punctuates for comment context', () => {
    expect(formatForContext('fix this bug', 'comment')).toBe('Fix this bug.');
  });

  it('does not double-punctuate comments', () => {
    expect(formatForContext('fix this bug.', 'comment')).toBe('Fix this bug.');
    expect(formatForContext('is this right?', 'comment')).toBe('Is this right?');
  });

  it('converts to camelCase for function-sig context', () => {
    expect(formatForContext('user name', 'function-sig')).toBe('userName');
    expect(formatForContext('max retry count', 'function-sig')).toBe('maxRetryCount');
  });

  it('returns text unchanged for code context', () => {
    expect(formatForContext('hello world', 'code')).toBe('hello world');
  });

  it('returns text unchanged for unknown context', () => {
    expect(formatForContext('hello world', 'unknown')).toBe('hello world');
  });

  it('handles empty text', () => {
    expect(formatForContext('', 'comment')).toBe('');
    expect(formatForContext('', 'function-sig')).toBe('');
  });
});
