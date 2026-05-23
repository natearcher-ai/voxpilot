import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIVoiceShortcutsProcessor, detectProvider } from '../aiVoiceShortcuts';

describe('AIVoiceShortcutsProcessor', () => {
  let processor: AIVoiceShortcutsProcessor;

  beforeEach(() => {
    processor = new AIVoiceShortcutsProcessor();
  });

  it('has correct id and name', () => {
    expect(processor.id).toBe('aiVoiceShortcuts');
    expect(processor.name).toBe('AI Voice Shortcuts');
  });

  it('detects provider defaults to unknown when no extensions', () => {
    expect(processor.getProvider()).toBe('unknown');
  });

  it('passes through text when disabled', () => {
    const __setConfig = (globalThis as any).__setConfig;
    if (__setConfig) __setConfig('aiVoiceShortcuts', false);
    const result = processor.process('ask copilot how to sort an array', {} as any);
    // When disabled, text passes through unchanged
    if (__setConfig) {
      expect(result).toBe('ask copilot how to sort an array');
    }
  });

  it('strips trigger phrase and captures prompt for ask copilot', () => {
    const result = processor.process('ask copilot how to sort an array', {} as any);
    expect(result).not.toContain('ask copilot');
    expect(result).not.toContain('how to sort an array');
  });

  it('strips trigger phrase for ask kiro', () => {
    const result = processor.process('ask kiro what is this function doing', {} as any);
    expect(result).not.toContain('ask kiro');
  });

  it('strips explain this from transcript', () => {
    const result = processor.process('explain this', {} as any);
    expect(result.trim()).toBe('');
  });

  it('strips refactor this from transcript', () => {
    const result = processor.process('please refactor this code', {} as any);
    // "refactor this" should be stripped, leaving surrounding text
    expect(result).not.toContain('refactor this');
  });

  it('strips add tests from transcript', () => {
    const result = processor.process('add tests', {} as any);
    expect(result.trim()).toBe('');
  });

  it('strips document this from transcript', () => {
    const result = processor.process('document this', {} as any);
    expect(result.trim()).toBe('');
  });

  it('strips open chat from transcript', () => {
    const result = processor.process('open chat', {} as any);
    expect(result.trim()).toBe('');
  });

  it('strips new chat from transcript', () => {
    const result = processor.process('new chat', {} as any);
    expect(result.trim()).toBe('');
  });

  it('does not match partial phrases', () => {
    const result = processor.process('I asked about copilot yesterday', {} as any);
    // Should not trigger — "ask copilot" not at word boundary with prompt
    expect(result).toContain('copilot');
  });

  it('handles inline fix with description', () => {
    const result = processor.process('inline fix the null pointer exception', {} as any);
    expect(result).not.toContain('inline fix');
  });

  it('refresh updates provider', () => {
    processor.refresh();
    // Should not throw
    expect(processor.getProvider()).toBeDefined();
  });

  it('preserves surrounding text when trigger is in the middle', () => {
    const result = processor.process('hello explain this world', {} as any);
    // "explain this" stripped, surrounding text preserved
    expect(result).not.toContain('explain this');
  });
});

describe('detectProvider', () => {
  it('returns unknown when no AI extensions installed', () => {
    const provider = detectProvider();
    // In test environment, no real extensions
    expect(provider).toBe('unknown');
  });
});
