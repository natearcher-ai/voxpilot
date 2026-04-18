import { describe, it, expect, vi } from 'vitest';
import { matchAnnotation, getCommentStyle, formatAnnotation } from '../voiceAnnotations';

// Mock vscode
vi.mock('vscode', () => ({
  Position: class { constructor(public line: number, public character: number) {} },
  Range: class { constructor(public start: any, public end: any) {} },
  window: { activeTextEditor: undefined },
}));

describe('matchAnnotation', () => {
  it('matches "annotate" with text', () => {
    const result = matchAnnotation('annotate fix this later');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('inline');
    expect(result!.text).toBe('fix this later');
  });

  it('matches "note" as inline', () => {
    const result = matchAnnotation('note remember to test');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('inline');
    expect(result!.text).toBe('remember to test');
  });

  it('matches "annotate above"', () => {
    const result = matchAnnotation('annotate above needs refactor');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('above');
    expect(result!.text).toBe('needs refactor');
  });

  it('matches "comment below"', () => {
    const result = matchAnnotation('comment below deprecated');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('below');
    expect(result!.text).toBe('deprecated');
  });

  it('matches "bookmark"', () => {
    const result = matchAnnotation('bookmark important section');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('bookmark');
    expect(result!.text).toBe('important section');
  });

  it('is case-insensitive', () => {
    const result = matchAnnotation('Annotate Fix This');
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Fix This');
  });

  it('prefers longer trigger (annotate above > annotate)', () => {
    const result = matchAnnotation('annotate above something');
    expect(result!.type).toBe('above');
  });

  it('returns null for non-annotation text', () => {
    expect(matchAnnotation('hello world')).toBeNull();
    expect(matchAnnotation('create a function')).toBeNull();
  });

  it('returns empty text for trigger-only input', () => {
    const result = matchAnnotation('annotate');
    expect(result).not.toBeNull();
    expect(result!.text).toBe('');
  });
});

describe('getCommentStyle', () => {
  it('returns // for JavaScript', () => {
    expect(getCommentStyle('javascript')).toEqual({ prefix: '// ', suffix: '' });
  });

  it('returns # for Python', () => {
    expect(getCommentStyle('python')).toEqual({ prefix: '# ', suffix: '' });
  });

  it('returns <!-- --> for HTML', () => {
    expect(getCommentStyle('html')).toEqual({ prefix: '<!-- ', suffix: ' -->' });
  });

  it('returns /* */ for CSS', () => {
    expect(getCommentStyle('css')).toEqual({ prefix: '/* ', suffix: ' */' });
  });

  it('returns -- for SQL', () => {
    expect(getCommentStyle('sql')).toEqual({ prefix: '-- ', suffix: '' });
  });

  it('defaults to // for unknown languages', () => {
    expect(getCommentStyle('unknown')).toEqual({ prefix: '// ', suffix: '' });
  });
});

describe('formatAnnotation', () => {
  it('formats inline annotation', () => {
    expect(formatAnnotation('fix this', 'inline', 'javascript')).toBe('// fix this');
  });

  it('formats bookmark with prefix', () => {
    expect(formatAnnotation('important', 'bookmark', 'javascript')).toBe('// BOOKMARK: important');
  });

  it('formats todo with prefix', () => {
    expect(formatAnnotation('add tests', 'todo', 'python')).toBe('# TODO: add tests');
  });

  it('formats fixme with prefix', () => {
    expect(formatAnnotation('broken', 'fixme', 'typescript')).toBe('// FIXME: broken');
  });

  it('uses HTML comment style', () => {
    expect(formatAnnotation('fix layout', 'inline', 'html')).toBe('<!-- fix layout -->');
  });
});
