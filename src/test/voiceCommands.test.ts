import { describe, it, expect } from 'vitest';
import { processVoiceCommands } from '../voiceCommands';

describe('processVoiceCommands', () => {
  describe('punctuation commands', () => {
    it('should replace "period" with .', () => {
      const result = processVoiceCommands('hello world period');
      expect(result.text).toBe('hello world.');
      expect(result.commandsApplied).toBeGreaterThan(0);
    });

    it('should replace "full stop" with .', () => {
      const result = processVoiceCommands('end of sentence full stop');
      expect(result.text).toBe('end of sentence.');
    });

    it('should replace "comma" with ,', () => {
      const result = processVoiceCommands('hello comma world');
      expect(result.text).toBe('hello, world');
    });

    it('should replace "question mark" with ?', () => {
      const result = processVoiceCommands('how are you question mark');
      expect(result.text).toBe('how are you?');
    });

    it('should replace "exclamation mark" with !', () => {
      const result = processVoiceCommands('wow exclamation mark');
      expect(result.text).toBe('wow!');
    });

    it('should replace "exclamation point" with !', () => {
      const result = processVoiceCommands('amazing exclamation point');
      expect(result.text).toBe('amazing!');
    });

    it('should replace "colon" with :', () => {
      const result = processVoiceCommands('note colon');
      expect(result.text).toBe('note:');
    });

    it('should replace "semicolon" with ;', () => {
      const result = processVoiceCommands('first semicolon second');
      expect(result.text).toBe('first; second');
    });

    it('should replace "new line" with newline character', () => {
      const result = processVoiceCommands('line one new line line two');
      expect(result.text).toContain('\n');
    });

    it('should replace "open paren" and "close paren"', () => {
      const result = processVoiceCommands('call open paren args close paren');
      expect(result.text).toContain('(');
      expect(result.text).toContain(')');
    });

    it('should handle multiple commands in one transcript', () => {
      const result = processVoiceCommands('hello comma how are you question mark');
      expect(result.text).toBe('hello, how are you?');
      expect(result.commandsApplied).toBeGreaterThanOrEqual(2);
    });

    it('should be case insensitive', () => {
      const result = processVoiceCommands('hello PERIOD');
      expect(result.text).toBe('hello.');
    });
  });

  describe('delete that', () => {
    it('should remove the last word before "delete that"', () => {
      const result = processVoiceCommands('hello world oops delete that');
      expect(result.text).toBe('hello world');
      expect(result.commandsApplied).toBeGreaterThan(0);
    });

    it('should handle "undo that" as alias', () => {
      const result = processVoiceCommands('hello typo undo that');
      expect(result.text).toBe('hello');
    });

    it('should handle delete that at the start (removes everything)', () => {
      const result = processVoiceCommands('oops delete that');
      expect(result.text).toBe('');
    });

    it('should handle multiple delete that commands', () => {
      const result = processVoiceCommands('one two three delete that delete that');
      expect(result.text).toBe('one');
    });
  });

  describe('edge cases', () => {
    it('should return empty text unchanged', () => {
      const result = processVoiceCommands('');
      expect(result.text).toBe('');
      expect(result.commandsApplied).toBe(0);
    });

    it('should return whitespace-only text unchanged', () => {
      const result = processVoiceCommands('   ');
      expect(result.text).toBe('   ');
      expect(result.commandsApplied).toBe(0);
    });

    it('should handle text with no commands', () => {
      const result = processVoiceCommands('hello world');
      expect(result.text).toBe('hello world');
      expect(result.commandsApplied).toBe(0);
    });

    it('should collapse multiple spaces after processing', () => {
      const result = processVoiceCommands('hello   comma   world');
      // After command processing and space collapse
      expect(result.text).not.toContain('  ');
    });
  });
});
