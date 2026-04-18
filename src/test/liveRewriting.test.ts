import { describe, it, expect } from 'vitest';
import { findTextDiff } from '../liveRewriting';

describe('findTextDiff', () => {
  it('finds common prefix for similar strings', () => {
    const result = findTextDiff('hello world', 'hello there');
    expect(result.commonPrefix).toBe(6); // "hello " is common
    expect(result.changed).toBe('there');
  });

  it('returns full new text when no common prefix', () => {
    const result = findTextDiff('abc', 'xyz');
    expect(result.commonPrefix).toBe(0);
    expect(result.changed).toBe('xyz');
  });

  it('handles identical strings', () => {
    const result = findTextDiff('hello', 'hello');
    expect(result.commonPrefix).toBe(5);
    expect(result.changed).toBe('');
  });

  it('handles empty old text', () => {
    const result = findTextDiff('', 'hello');
    expect(result.commonPrefix).toBe(0);
    expect(result.changed).toBe('hello');
  });

  it('handles empty new text', () => {
    const result = findTextDiff('hello', '');
    expect(result.commonPrefix).toBe(0);
    expect(result.changed).toBe('');
  });

  it('handles both empty', () => {
    const result = findTextDiff('', '');
    expect(result.commonPrefix).toBe(0);
    expect(result.changed).toBe('');
  });

  it('handles new text extending old text', () => {
    const result = findTextDiff('hello', 'hello world');
    expect(result.commonPrefix).toBe(5);
    expect(result.changed).toBe(' world');
  });

  it('handles old text longer than new text', () => {
    const result = findTextDiff('hello world', 'hello');
    expect(result.commonPrefix).toBe(5);
    expect(result.changed).toBe('');
  });
});
