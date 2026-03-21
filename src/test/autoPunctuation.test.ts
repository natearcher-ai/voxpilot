import { describe, it, expect } from 'vitest';
import { applyAutoPunctuation } from '../autoPunctuation';

describe('applyAutoPunctuation', () => {
  it('appends period to plain text', () => {
    expect(applyAutoPunctuation('hello world')).toBe('hello world.');
  });

  it('does not double-period', () => {
    expect(applyAutoPunctuation('hello world.')).toBe('hello world.');
  });

  it('leaves question marks alone', () => {
    expect(applyAutoPunctuation('how are you?')).toBe('how are you?');
  });

  it('leaves exclamation marks alone', () => {
    expect(applyAutoPunctuation('wow!')).toBe('wow!');
  });

  it('leaves colons alone', () => {
    expect(applyAutoPunctuation('note:')).toBe('note:');
  });

  it('leaves semicolons alone', () => {
    expect(applyAutoPunctuation('first part;')).toBe('first part;');
  });

  it('leaves ellipsis alone', () => {
    expect(applyAutoPunctuation('thinking…')).toBe('thinking…');
  });

  it('does not add period after open paren', () => {
    expect(applyAutoPunctuation('something (')).toBe('something (');
  });

  it('does not add period after comma', () => {
    expect(applyAutoPunctuation('first,')).toBe('first,');
  });

  it('does not add period after open bracket', () => {
    expect(applyAutoPunctuation('list [')).toBe('list [');
  });

  it('adds period after closing paren', () => {
    expect(applyAutoPunctuation('something (like this)')).toBe('something (like this).');
  });

  it('adds period after closing bracket', () => {
    expect(applyAutoPunctuation('items [done]')).toBe('items [done].');
  });

  it('returns empty string unchanged', () => {
    expect(applyAutoPunctuation('')).toBe('');
  });

  it('returns whitespace-only unchanged', () => {
    expect(applyAutoPunctuation('   ')).toBe('   ');
  });

  it('trims trailing whitespace before adding period', () => {
    expect(applyAutoPunctuation('hello world  ')).toBe('hello world.');
  });

  it('handles single word', () => {
    expect(applyAutoPunctuation('hello')).toBe('hello.');
  });

  it('handles single character', () => {
    expect(applyAutoPunctuation('a')).toBe('a.');
  });
});
