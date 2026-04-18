import { describe, it, expect } from 'vitest';
import { formatForReadback } from '../readback';

describe('formatForReadback', () => {
  it('expands common abbreviations', () => {
    expect(formatForReadback('fn greet')).toBe('function greet');
    expect(formatForReadback('const val')).toBe('constant val');
    expect(formatForReadback('check err')).toBe('check error');
  });

  it('expands param and args', () => {
    expect(formatForReadback('pass param to fn')).toBe('pass parameter to function');
    expect(formatForReadback('parse args')).toBe('parse arguments');
  });

  it('expands ctx, req, res', () => {
    expect(formatForReadback('get ctx')).toBe('get context');
    expect(formatForReadback('handle req and res')).toBe('handle request and response');
  });

  it('adds pauses at punctuation', () => {
    expect(formatForReadback('hello.world')).toBe('hello. world');
    expect(formatForReadback('end;next')).toBe('end; next');
  });

  it('handles empty string', () => {
    expect(formatForReadback('')).toBe('');
  });

  it('preserves normal text', () => {
    expect(formatForReadback('hello world')).toBe('hello world');
  });

  it('is case-insensitive for expansions', () => {
    expect(formatForReadback('FN greet')).toBe('function greet');
    expect(formatForReadback('Const val')).toBe('constant val');
  });
});
