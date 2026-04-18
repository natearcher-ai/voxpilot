import { describe, it, expect, vi } from 'vitest';
import { matchRefactorCommand, REFACTOR_COMMANDS } from '../voiceRefactoring';

// Mock vscode
vi.mock('vscode', () => ({
  commands: { executeCommand: async () => {} },
  window: { showWarningMessage: () => {} },
}));

describe('matchRefactorCommand', () => {
  it('matches "rename to" with argument', () => {
    const result = matchRefactorCommand('rename to getUserName');
    expect(result).not.toBeNull();
    expect(result!.command.command).toBe('editor.action.rename');
    expect(result!.argument).toBe('getUserName');
  });

  it('matches "rename" with argument', () => {
    const result = matchRefactorCommand('rename fetchData');
    expect(result).not.toBeNull();
    expect(result!.argument).toBe('fetchData');
  });

  it('matches "extract function"', () => {
    const result = matchRefactorCommand('extract function');
    expect(result).not.toBeNull();
    expect(result!.command.command).toBe('editor.action.codeAction');
  });

  it('matches "extract variable"', () => {
    const result = matchRefactorCommand('extract variable');
    expect(result).not.toBeNull();
  });

  it('matches "organize imports"', () => {
    const result = matchRefactorCommand('organize imports');
    expect(result).not.toBeNull();
    expect(result!.command.command).toBe('editor.action.organizeImports');
  });

  it('matches "quick fix"', () => {
    const result = matchRefactorCommand('quick fix');
    expect(result).not.toBeNull();
    expect(result!.command.command).toBe('editor.action.quickFix');
  });

  it('matches "fix this" as quick fix', () => {
    const result = matchRefactorCommand('fix this');
    expect(result).not.toBeNull();
    expect(result!.command.command).toBe('editor.action.quickFix');
  });

  it('matches "refactor"', () => {
    const result = matchRefactorCommand('refactor');
    expect(result).not.toBeNull();
    expect(result!.command.command).toBe('editor.action.refactor');
  });

  it('matches "format document"', () => {
    const result = matchRefactorCommand('format document');
    expect(result).not.toBeNull();
    expect(result!.command.command).toBe('editor.action.formatDocument');
  });

  it('matches case-insensitively', () => {
    const result = matchRefactorCommand('Organize Imports');
    expect(result).not.toBeNull();
  });

  it('returns null for non-refactoring text', () => {
    expect(matchRefactorCommand('hello world')).toBeNull();
    expect(matchRefactorCommand('create a function')).toBeNull();
  });

  it('prefers longer phrase (greedy match)', () => {
    const result = matchRefactorCommand('extract to function');
    expect(result).not.toBeNull();
    expect(result!.phrase).toBe('extract to function');
  });

  it('matches "inline variable"', () => {
    const result = matchRefactorCommand('inline variable');
    expect(result).not.toBeNull();
  });
});

describe('REFACTOR_COMMANDS', () => {
  it('has at least 10 commands', () => {
    expect(REFACTOR_COMMANDS.length).toBeGreaterThanOrEqual(10);
  });

  it('all commands have required fields', () => {
    for (const cmd of REFACTOR_COMMANDS) {
      expect(cmd.phrases.length).toBeGreaterThan(0);
      expect(cmd.command).toBeTruthy();
      expect(cmd.description).toBeTruthy();
    }
  });
});
