import { describe, it, expect, vi } from 'vitest';
import { PrefixCommandsProcessor } from '../prefixCommands';
import type { ProcessorContext } from '../postProcessingPipeline';

// Mock vscode
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => {
        if (key === 'prefixCommands') { return true; }
        return undefined;
      },
    }),
  },
}));

function makeContext(): ProcessorContext {
  return {
    segments: [],
    voiceCommandsApplied: 0,
    punctuationAdded: false,
    capitalized: false,
    pendingCommands: [],
  };
}

describe('PrefixCommandsProcessor', () => {
  const processor = new PrefixCommandsProcessor();
  const ctx = () => makeContext();

  it('wraps "comment" prefix as line comment', () => {
    expect(processor.process('comment hello world', ctx())).toBe('// hello world');
  });

  it('wraps "block comment" prefix (greedy match over "comment")', () => {
    expect(processor.process('block comment hello world', ctx())).toBe('/* hello world */');
  });

  it('wraps "todo" prefix', () => {
    expect(processor.process('todo fix this bug', ctx())).toBe('// TODO: fix this bug');
  });

  it('wraps "fixme" prefix', () => {
    expect(processor.process('fixme broken handler', ctx())).toBe('// FIXME: broken handler');
  });

  it('wraps "function" prefix with sanitized name', () => {
    expect(processor.process('function greet user', ctx())).toBe('function greet_user() {}');
  });

  it('wraps "variable" prefix', () => {
    expect(processor.process('variable count', ctx())).toBe('const count = ');
  });

  it('wraps "const" prefix same as variable', () => {
    expect(processor.process('const total', ctx())).toBe('const total = ');
  });

  it('wraps "let" prefix', () => {
    expect(processor.process('let name', ctx())).toBe('let name = ');
  });

  it('wraps "log" prefix', () => {
    expect(processor.process('log hello world', ctx())).toBe('console.log("hello world");');
  });

  it('wraps "print" prefix same as log', () => {
    expect(processor.process('print debug message', ctx())).toBe('console.log("debug message");');
  });

  it('wraps "return" prefix', () => {
    expect(processor.process('return value', ctx())).toBe('return value;');
  });

  it('wraps "import" prefix', () => {
    expect(processor.process('import react', ctx())).toBe('import react;');
  });

  it('wraps "class" prefix with capitalized name', () => {
    expect(processor.process('class animal', ctx())).toBe('class Animal {}');
  });

  it('wraps "if" prefix', () => {
    expect(processor.process('if logged in', ctx())).toBe('if (logged in) {}');
  });

  it('is case-insensitive for prefix matching', () => {
    expect(processor.process('Comment hello', ctx())).toBe('// hello');
    expect(processor.process('TODO fix it', ctx())).toBe('// TODO: fix it');
  });

  it('passes through text with no matching prefix', () => {
    expect(processor.process('hello world', ctx())).toBe('hello world');
  });

  it('does not match prefix as substring of a word', () => {
    expect(processor.process('lettering is fun', ctx())).toBe('lettering is fun');
  });

  it('handles prefix with no remaining text', () => {
    expect(processor.process('comment', ctx())).toBe('// ');
  });
});
