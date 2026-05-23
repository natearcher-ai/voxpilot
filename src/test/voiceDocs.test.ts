import { describe, it, expect } from 'vitest';
import { parseDocCommand, generateFunctionDoc, generateClassDoc, generateFileHeader, generateChangelogEntry, generateTodo, generateDeprecated } from '../voiceDocs';

describe('parseDocCommand', () => {
  it('parses document function', () => {
    const cmd = parseDocCommand('document function');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('doc-function');
  });

  it('parses document class', () => {
    const cmd = parseDocCommand('document class');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('doc-class');
  });

  it('parses document file', () => {
    const cmd = parseDocCommand('document file');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('doc-file');
  });

  it('parses generate readme', () => {
    const cmd = parseDocCommand('generate readme');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('gen-readme');
  });

  it('parses changelog entry with text', () => {
    const cmd = parseDocCommand('add changelog entry added user authentication');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('changelog-entry');
    expect(cmd!.argument).toBe('added user authentication');
  });

  it('parses todo with text', () => {
    const cmd = parseDocCommand('add todo refactor this function');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('todo');
    expect(cmd!.argument).toBe('refactor this function');
  });

  it('parses deprecated with reason', () => {
    const cmd = parseDocCommand('mark deprecated use newFunction instead');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('deprecated');
    expect(cmd!.argument).toBe('use newFunction instead');
  });

  it('parses describe with text', () => {
    const cmd = parseDocCommand('describe this as handles user authentication');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('describe');
    expect(cmd!.argument).toBe('handles user authentication');
  });

  it('parses param', () => {
    const cmd = parseDocCommand('explain parameter userId');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('param');
    expect(cmd!.argument).toBe('userId');
  });

  it('parses example', () => {
    const cmd = parseDocCommand('add example fetchUser(123)');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('example');
    expect(cmd!.argument).toBe('fetchUser(123)');
  });

  it('parses returns', () => {
    const cmd = parseDocCommand('add returns the user object or null');
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('returns');
    expect(cmd!.argument).toBe('the user object or null');
  });

  it('returns null for non-doc text', () => {
    expect(parseDocCommand('hello world')).toBeNull();
    expect(parseDocCommand('create a function')).toBeNull();
  });
});

describe('generateFunctionDoc', () => {
  it('generates JSDoc for TypeScript function', () => {
    const doc = generateFunctionDoc('function fetchUser(id: string, options?: RequestOptions): Promise<User>', 'typescript');
    expect(doc).toContain('/**');
    expect(doc).toContain('*/');
    expect(doc).toContain('@param id');
    expect(doc).toContain('@param options');
    expect(doc).toContain('@returns');
    expect(doc).toContain('fetchUser');
  });

  it('generates docstring for Python function', () => {
    const doc = generateFunctionDoc('def fetch_user(self, user_id: str, timeout: int = 30) -> User:', 'python');
    expect(doc).toContain('"""');
    expect(doc).toContain('Args:');
    expect(doc).toContain('user_id');
    expect(doc).toContain('timeout');
    expect(doc).toContain('Returns:');
    expect(doc).not.toContain('self'); // self should be excluded
  });

  it('includes @async for async functions', () => {
    const doc = generateFunctionDoc('async function loadData(): Promise<void>', 'typescript');
    expect(doc).toContain('@async');
  });

  it('omits @returns for void functions', () => {
    const doc = generateFunctionDoc('function logMessage(msg: string): void', 'typescript');
    expect(doc).not.toContain('@returns');
  });

  it('handles functions with no parameters', () => {
    const doc = generateFunctionDoc('function init()', 'typescript');
    expect(doc).toContain('/**');
    expect(doc).not.toContain('@param');
  });
});

describe('generateClassDoc', () => {
  it('generates JSDoc for TypeScript class', () => {
    const doc = generateClassDoc('UserService', 'typescript');
    expect(doc).toContain('/**');
    expect(doc).toContain('UserService');
    expect(doc).toContain('@class');
  });

  it('generates docstring for Python class', () => {
    const doc = generateClassDoc('UserService', 'python');
    expect(doc).toContain('"""');
    expect(doc).toContain('UserService');
  });
});

describe('generateFileHeader', () => {
  it('generates JSDoc file header', () => {
    const doc = generateFileHeader('auth.ts', 'typescript');
    expect(doc).toContain('@file auth.ts');
    expect(doc).toContain('@description');
    expect(doc).toContain('@created');
  });

  it('generates Python file header', () => {
    const doc = generateFileHeader('auth.py', 'python');
    expect(doc).toContain('"""');
    expect(doc).toContain('auth.py');
    expect(doc).toContain('Created:');
  });
});

describe('generateChangelogEntry', () => {
  it('generates changelog entry with date', () => {
    const entry = generateChangelogEntry('user authentication via OAuth2');
    expect(entry).toContain('## [Unreleased]');
    expect(entry).toContain('### Added');
    expect(entry).toContain('user authentication via OAuth2');
  });

  it('supports different types', () => {
    expect(generateChangelogEntry('bug fix', 'fixed')).toContain('### Fixed');
    expect(generateChangelogEntry('API change', 'changed')).toContain('### Changed');
    expect(generateChangelogEntry('old feature', 'removed')).toContain('### Removed');
  });
});

describe('generateTodo', () => {
  it('generates TODO for TypeScript', () => {
    const todo = generateTodo('refactor this', 'typescript');
    expect(todo).toBe('// TODO: refactor this');
  });

  it('generates TODO for Python', () => {
    const todo = generateTodo('add error handling', 'python');
    expect(todo).toBe('# TODO: add error handling');
  });

  it('generates TODO for SQL', () => {
    const todo = generateTodo('optimize query', 'sql');
    expect(todo).toBe('-- TODO: optimize query');
  });
});

describe('generateDeprecated', () => {
  it('generates @deprecated for TypeScript', () => {
    const dep = generateDeprecated('use newFunction instead', 'typescript');
    expect(dep).toContain('@deprecated');
    expect(dep).toContain('use newFunction instead');
  });

  it('generates deprecation warning for Python', () => {
    const dep = generateDeprecated('use new_function instead', 'python');
    expect(dep).toContain('DeprecationWarning');
    expect(dep).toContain('use new_function instead');
  });
});
