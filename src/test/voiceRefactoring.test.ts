import { describe, it, expect } from 'vitest';
import { matchRefactorCommand } from '../voiceRefactoring';

describe('matchRefactorCommand', () => {
  it('matches "rename to" with argument', () => {
    const result = matchRefactorCommand('rename to handleSubmit');
    expect(result).not.toBeNull();
    expect(result!.command.command).toBe('editor.action.rename');
    expect(result!.argument).toBe('handleSubmit');
  });

  it('matches "rename" with argument', () => {
    const result = matchRefactorCommand('rename getUserData');
    expect(result).not.toBeNull();
    expect(result!.argument).toBe('getUserData');
  });

  it('matches "extract function"', () => {
    const result = matchRefactorCommand('extract function');
    expect(result).not.toBeNull();
    expect(result!.command.command).toBe('editor.action.codeAction');
    expect(result!.argument).toBe('');
  });

  it('matches "extract variable"', () => {
    const result = matchRefactorCommand('extract variable');
    expect(result).not.toBeNull();
    expect(result!.phrase).toBe('extract variable');
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

  it('matches "fix this"', () => {
    const result = matchRefactorCommand('fix this');
    expect(result).not.toBeNull();
    expect(result!.command.command).toBe('editor.action.quickFix');
  });

  it('matches longer phrases before shorter ones', () => {
    // "rename to" should match before "rename"
    const result = matchRefactorCommand('rename to something');
    expect(result!.phrase).toBe('rename to');
    expect(result!.argument).toBe('something');
  });

  it('returns null for non-refactoring text', () => {
    expect(matchRefactorCommand('hello world')).toBeNull();
    expect(matchRefactorCommand('the function is broken')).toBeNull();
  });

  it('is case insensitive', () => {
    const result = matchRefactorCommand('EXTRACT FUNCTION');
    expect(result).not.toBeNull();
    expect(result!.phrase).toBe('extract function');
  });

  it('matches "format document"', () => {
    const result = matchRefactorCommand('format document');
    expect(result).not.toBeNull();
    expect(result!.command.command).toBe('editor.action.formatDocument');
  });

  it('matches "inline variable"', () => {
    const result = matchRefactorCommand('inline variable');
    expect(result).not.toBeNull();
    expect(result!.command.command).toBe('editor.action.codeAction');
  });
});
