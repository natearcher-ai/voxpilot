import { describe, it, expect } from 'vitest';
import { parseReviewCommand } from '../voiceCodeReview';

describe('parseReviewCommand', () => {
  it('parses next change', () => {
    const cmd = parseReviewCommand('next change');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('next-change');
    expect(cmd!.requiresConfirmation).toBe(false);
  });

  it('parses previous change', () => {
    const cmd = parseReviewCommand('previous change');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('prev-change');
  });

  it('parses next file', () => {
    const cmd = parseReviewCommand('next file');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('next-file');
  });

  it('parses approve', () => {
    const cmd = parseReviewCommand('approve');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('approve');
    expect(cmd!.requiresConfirmation).toBe(true);
  });

  it('parses lgtm as approve', () => {
    const cmd = parseReviewCommand('lgtm');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('approve');
  });

  it('parses request changes', () => {
    const cmd = parseReviewCommand('request changes');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('request-changes');
    expect(cmd!.requiresConfirmation).toBe(true);
  });

  it('parses comment with text', () => {
    const cmd = parseReviewCommand('comment this function needs error handling');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('comment');
    expect(cmd!.argument).toBe('this function needs error handling');
  });

  it('parses suggest with text', () => {
    const cmd = parseReviewCommand('suggest use async await here');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('suggest');
    expect(cmd!.argument).toBe('use async await here');
  });

  it('parses resolve thread', () => {
    const cmd = parseReviewCommand('resolve thread');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('resolve-thread');
  });

  it('parses show diff', () => {
    const cmd = parseReviewCommand('show diff');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('show-diff');
  });

  it('parses show files changed', () => {
    const cmd = parseReviewCommand('show files changed');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('show-files');
  });

  it('parses summarize changes', () => {
    const cmd = parseReviewCommand('summarize changes');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('summarize');
  });

  it('parses what changed in with file', () => {
    const cmd = parseReviewCommand('what changed in auth.ts');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('what-changed');
    expect(cmd!.argument).toBe('auth.ts');
  });

  it('parses mark as viewed', () => {
    const cmd = parseReviewCommand('mark as viewed');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('mark-viewed');
  });

  it('parses start review', () => {
    const cmd = parseReviewCommand('start review');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('start-review');
  });

  it('parses submit review', () => {
    const cmd = parseReviewCommand('submit review');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('submit-review');
    expect(cmd!.requiresConfirmation).toBe(true);
  });

  it('returns null for non-review text', () => {
    expect(parseReviewCommand('hello world')).toBeNull();
    expect(parseReviewCommand('create a function')).toBeNull();
  });

  it('handles case insensitivity', () => {
    const cmd = parseReviewCommand('Next Change');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('next-change');
  });
});
