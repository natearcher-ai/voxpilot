import { describe, it, expect, vi } from 'vitest';
import { splitIdentifier } from '../autoVocabulary';

// Mock vscode
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => {
        if (key === 'autoVocabulary') { return true; }
        return undefined;
      },
    }),
    textDocuments: [],
    onDidOpenTextDocument: () => ({ dispose: () => {} }),
    onDidSaveTextDocument: () => ({ dispose: () => {} }),
  },
}));

describe('splitIdentifier', () => {
  it('splits camelCase', () => {
    expect(splitIdentifier('getUserName')).toEqual(['get', 'user', 'name']);
  });

  it('splits PascalCase', () => {
    expect(splitIdentifier('MyComponent')).toEqual(['my', 'component']);
  });

  it('splits snake_case', () => {
    expect(splitIdentifier('max_retry_count')).toEqual(['max', 'retry', 'count']);
  });

  it('splits SCREAMING_SNAKE_CASE', () => {
    expect(splitIdentifier('MAX_RETRY_COUNT')).toEqual(['max', 'retry', 'count']);
  });

  it('splits kebab-case', () => {
    expect(splitIdentifier('my-component')).toEqual(['my', 'component']);
  });

  it('handles consecutive uppercase (acronyms)', () => {
    expect(splitIdentifier('XMLParser')).toEqual(['xml', 'parser']);
    expect(splitIdentifier('parseHTTPResponse')).toEqual(['parse', 'http', 'response']);
  });

  it('strips leading/trailing underscores', () => {
    expect(splitIdentifier('__init__')).toEqual(['init']);
    expect(splitIdentifier('_private')).toEqual(['private']);
  });

  it('returns empty for single-word identifiers', () => {
    expect(splitIdentifier('name')).toEqual(['name']);
  });

  it('returns empty for empty string', () => {
    expect(splitIdentifier('')).toEqual([]);
  });

  it('handles mixed camelCase with numbers', () => {
    expect(splitIdentifier('getUser2Name')).toEqual(['get', 'user2', 'name']);
  });
});
