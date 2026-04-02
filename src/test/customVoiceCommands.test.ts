import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateCustomCommands, CustomVoiceCommandsProcessor } from '../customVoiceCommands';

// Mock vscode
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultVal: unknown) => {
        if (key === 'customVoiceCommands') {
          return (global as any).__testCustomCommands ?? defaultVal;
        }
        return defaultVal;
      }),
    })),
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
    })),
  },
}));

describe('validateCustomCommands', () => {
  it('should accept valid insert commands', () => {
    const errors = validateCustomCommands([
      { phrase: 'arrow function', action: 'insert', text: '() => ' },
    ]);
    expect(errors).toHaveLength(0);
  });

  it('should accept valid command-type entries', () => {
    const errors = validateCustomCommands([
      { phrase: 'format file', action: 'command', command: 'editor.action.formatDocument' },
    ]);
    expect(errors).toHaveLength(0);
  });

  it('should reject missing phrase', () => {
    const errors = validateCustomCommands([
      { action: 'insert', text: 'hello' },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('phrase');
  });

  it('should reject empty phrase', () => {
    const errors = validateCustomCommands([
      { phrase: '  ', action: 'insert', text: 'hello' },
    ]);
    expect(errors).toHaveLength(1);
  });

  it('should reject invalid action', () => {
    const errors = validateCustomCommands([
      { phrase: 'test', action: 'unknown' },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('action');
  });

  it('should reject insert without text', () => {
    const errors = validateCustomCommands([
      { phrase: 'test', action: 'insert' },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('text');
  });

  it('should reject command without command id', () => {
    const errors = validateCustomCommands([
      { phrase: 'test', action: 'command' },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('command');
  });

  it('should detect duplicate phrases', () => {
    const errors = validateCustomCommands([
      { phrase: 'hello', action: 'insert', text: 'hi' },
      { phrase: 'Hello', action: 'insert', text: 'hey' },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Duplicate');
  });

  it('should reject non-object entries', () => {
    const errors = validateCustomCommands(['not an object', 42, null] as any);
    expect(errors).toHaveLength(3);
  });

  it('should return empty for empty array', () => {
    const errors = validateCustomCommands([]);
    expect(errors).toHaveLength(0);
  });
});

describe('CustomVoiceCommandsProcessor', () => {
  beforeEach(() => {
    (global as any).__testCustomCommands = undefined;
  });

  function makeContext() {
    return {
      segments: [],
      voiceCommandsApplied: 0,
      punctuationAdded: false,
      capitalized: false,
      pendingCommands: [] as Array<{ command: string; args?: unknown; phrase: string }>,
    };
  }

  it('should return text unchanged when no custom commands defined', () => {
    (global as any).__testCustomCommands = [];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    expect(proc.process('hello world', ctx)).toBe('hello world');
    expect(ctx.voiceCommandsApplied).toBe(0);
  });

  it('should replace insert-type commands', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'arrow function', action: 'insert', text: '() => ' },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    const result = proc.process('type arrow function here', ctx);
    expect(result).toBe('type () =>  here');
    expect(ctx.voiceCommandsApplied).toBe(1);
  });

  it('should be case insensitive', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'hash map', action: 'insert', text: 'HashMap' },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    expect(proc.process('create a Hash Map', ctx)).toBe('create a HashMap');
  });

  it('should handle escape sequences in replacement text', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'blank line', action: 'insert', text: '\\n\\n' },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    const result = proc.process('add blank line here', ctx);
    expect(result).toBe('add \n\n here');
  });

  it('should handle tab escapes', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'indent', action: 'insert', text: '\\t' },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    const result = proc.process('indent code', ctx);
    expect(result).toBe('\t code');
  });

  it('should match longer phrases first', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'arrow', action: 'insert', text: '→' },
      { phrase: 'arrow function', action: 'insert', text: '() => ' },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    // "arrow function" should match first (longer), not "arrow"
    const result = proc.process('type arrow function', ctx);
    expect(result).toBe('type () => ');
  });

  it('should skip command-type entries (not executed in pipeline)', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'format file', action: 'command', command: 'editor.action.formatDocument' },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    const result = proc.process('format file please', ctx);
    expect(result).toBe(' please');
    expect(ctx.voiceCommandsApplied).toBe(1);
    expect(ctx.pendingCommands).toHaveLength(1);
    expect(ctx.pendingCommands[0].command).toBe('editor.action.formatDocument');
    expect(ctx.pendingCommands[0].phrase).toBe('format file');
  });

  it('should queue command with args', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'open terminal', action: 'command', command: 'workbench.action.terminal.new', args: { name: 'Voice' } },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    const result = proc.process('please open terminal', ctx);
    expect(result).toBe('please ');
    expect(ctx.pendingCommands).toHaveLength(1);
    expect(ctx.pendingCommands[0].command).toBe('workbench.action.terminal.new');
    expect(ctx.pendingCommands[0].args).toEqual({ name: 'Voice' });
  });

  it('should queue multiple commands from one transcript', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'save file', action: 'command', command: 'workbench.action.files.save' },
      { phrase: 'format file', action: 'command', command: 'editor.action.formatDocument' },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    proc.process('format file then save file', ctx);
    expect(ctx.pendingCommands).toHaveLength(2);
    expect(ctx.pendingCommands.map(c => c.command)).toContain('editor.action.formatDocument');
    expect(ctx.pendingCommands.map(c => c.command)).toContain('workbench.action.files.save');
    expect(ctx.voiceCommandsApplied).toBe(2);
  });

  it('should not queue command if phrase is not in text', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'format file', action: 'command', command: 'editor.action.formatDocument' },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    proc.process('hello world', ctx);
    expect(ctx.pendingCommands).toHaveLength(0);
    expect(ctx.voiceCommandsApplied).toBe(0);
  });

  it('should handle mixed insert and command actions', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'arrow function', action: 'insert', text: '() => ' },
      { phrase: 'save file', action: 'command', command: 'workbench.action.files.save' },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    const result = proc.process('type arrow function then save file', ctx);
    expect(result).toContain('() => ');
    expect(result).not.toContain('save file');
    expect(ctx.pendingCommands).toHaveLength(1);
    expect(ctx.pendingCommands[0].command).toBe('workbench.action.files.save');
    expect(ctx.voiceCommandsApplied).toBe(2);
  });

  it('should handle multiple replacements in one transcript', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'arrow function', action: 'insert', text: '() => ' },
      { phrase: 'semicolon', action: 'insert', text: ';' },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    const result = proc.process('const fn equals arrow function body semicolon', ctx);
    expect(result).toContain('() => ');
    expect(result).toContain(';');
    expect(ctx.voiceCommandsApplied).toBe(2);
  });

  it('should report correct command count', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'test', action: 'insert', text: 'OK' },
      { phrase: 'skip', action: 'command', command: 'noop' },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    expect(proc.commandCount).toBe(2);
  });

  it('should handle empty replacement text', () => {
    (global as any).__testCustomCommands = [
      { phrase: 'um', action: 'insert', text: '' },
    ];
    const proc = new CustomVoiceCommandsProcessor();
    const ctx = makeContext();
    const result = proc.process('so um I think', ctx);
    expect(result).toBe('so  I think');
    expect(ctx.voiceCommandsApplied).toBe(1);
  });
});
