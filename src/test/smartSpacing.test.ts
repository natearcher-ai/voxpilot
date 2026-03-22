import { describe, it, expect } from 'vitest';
import { stitchSegments, normalizeSpaces } from '../smartSpacing';

describe('normalizeSpaces', () => {
  it('collapses multiple spaces into one', () => {
    expect(normalizeSpaces('hello   world')).toBe('hello world');
  });

  it('collapses tabs and mixed whitespace', () => {
    expect(normalizeSpaces("hello \t  world")).toBe('hello world');
  });

  it('leaves single spaces alone', () => {
    expect(normalizeSpaces('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(normalizeSpaces('')).toBe('');
  });
});

describe('stitchSegments', () => {
  it('returns empty string for empty array', () => {
    expect(stitchSegments([])).toBe('');
  });

  it('returns single segment trimmed and normalized', () => {
    expect(stitchSegments(['  hello   world  '])).toBe('hello world');
  });

  it('joins two segments with exactly one space', () => {
    expect(stitchSegments(['hello', 'world'])).toBe('hello world');
  });

  it('does not double-space when segment has leading space', () => {
    expect(stitchSegments(['hello ', ' world'])).toBe('hello world');
  });

  it('does not double-space when both segments have trailing/leading spaces', () => {
    expect(stitchSegments(['hello  ', '  world'])).toBe('hello world');
  });

  it('handles segment with only whitespace', () => {
    expect(stitchSegments(['hello', '   ', 'world'])).toBe('hello world');
  });

  it('attaches punctuation without leading space', () => {
    expect(stitchSegments(['hello', ', world'])).toBe('hello, world');
  });

  it('attaches period without leading space', () => {
    expect(stitchSegments(['hello world', '.'])).toBe('hello world.');
  });

  it('attaches closing paren without leading space', () => {
    expect(stitchSegments(['(hello', ')'])).toBe('(hello)');
  });

  it('attaches closing bracket without leading space', () => {
    expect(stitchSegments(['array[0', ']'])).toBe('array[0]');
  });

  it('handles three segments cleanly', () => {
    expect(stitchSegments(['one', 'two', 'three'])).toBe('one two three');
  });

  it('normalizes internal double spaces within segments', () => {
    expect(stitchSegments(['hello  there', 'how  are  you'])).toBe('hello there how are you');
  });

  it('handles empty strings in array', () => {
    expect(stitchSegments(['', 'hello', '', 'world', ''])).toBe('hello world');
  });

  it('handles exclamation mark attachment', () => {
    expect(stitchSegments(['wow', '!'])).toBe('wow!');
  });

  it('handles question mark attachment', () => {
    expect(stitchSegments(['really', '?'])).toBe('really?');
  });

  it('handles semicolon attachment', () => {
    expect(stitchSegments(['first', '; second'])).toBe('first; second');
  });

  it('handles ellipsis attachment', () => {
    expect(stitchSegments(['well', '… okay'])).toBe('well… okay');
  });
});
