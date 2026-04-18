import { describe, it, expect } from 'vitest';
import { normalizeForWakeWord, containsWakePhrase, WakeWordDetector } from '../wakeWord';

describe('normalizeForWakeWord', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeForWakeWord('Hey, Vox!')).toBe('hey vox');
  });

  it('collapses whitespace', () => {
    expect(normalizeForWakeWord('  hey   vox  ')).toBe('hey vox');
  });

  it('handles empty string', () => {
    expect(normalizeForWakeWord('')).toBe('');
  });
});

describe('containsWakePhrase', () => {
  it('detects exact wake phrase', () => {
    expect(containsWakePhrase('hey vox start recording', 'hey vox')).toBe(true);
  });

  it('detects wake phrase case-insensitively', () => {
    expect(containsWakePhrase('Hey Vox!', 'hey vox')).toBe(true);
  });

  it('detects fuzzy variant "hey box"', () => {
    expect(containsWakePhrase('hey box', 'hey vox')).toBe(true);
  });

  it('detects fuzzy variant "hey fox"', () => {
    expect(containsWakePhrase('hey fox', 'hey vox')).toBe(true);
  });

  it('returns false for unrelated text', () => {
    expect(containsWakePhrase('hello world', 'hey vox')).toBe(false);
  });

  it('returns false for empty transcript', () => {
    expect(containsWakePhrase('', 'hey vox')).toBe(false);
  });

  it('returns false for empty wake phrase', () => {
    expect(containsWakePhrase('hey vox', '')).toBe(false);
  });

  it('works with custom wake phrase', () => {
    expect(containsWakePhrase('okay computer do something', 'okay computer')).toBe(true);
  });
});

describe('WakeWordDetector', () => {
  it('starts disabled', () => {
    const detector = new WakeWordDetector();
    expect(detector.enabled).toBe(false);
  });

  it('does not detect when disabled', () => {
    const detector = new WakeWordDetector();
    expect(detector.checkTranscript('hey vox')).toBe(false);
  });

  it('detects wake word when enabled', () => {
    const detector = new WakeWordDetector();
    detector.enable();
    expect(detector.checkTranscript('hey vox')).toBe(true);
  });

  it('fires callback on detection', () => {
    const detector = new WakeWordDetector();
    detector.enable();
    let fired = false;
    detector.onWake(() => { fired = true; });
    detector.checkTranscript('hey vox');
    expect(fired).toBe(true);
  });

  it('respects cooldown period', () => {
    const detector = new WakeWordDetector();
    detector.enable();
    expect(detector.checkTranscript('hey vox')).toBe(true);
    // Immediately after — should be in cooldown
    expect(detector.checkTranscript('hey vox')).toBe(false);
  });

  it('resetCooldown allows immediate re-detection', () => {
    const detector = new WakeWordDetector();
    detector.enable();
    detector.checkTranscript('hey vox');
    detector.resetCooldown();
    expect(detector.checkTranscript('hey vox')).toBe(true);
  });

  it('setWakePhrase changes the phrase', () => {
    const detector = new WakeWordDetector();
    detector.enable();
    detector.setWakePhrase('okay start');
    expect(detector.checkTranscript('hey vox')).toBe(false);
    expect(detector.checkTranscript('okay start')).toBe(true);
  });

  it('dispose removes callback', () => {
    const detector = new WakeWordDetector();
    detector.enable();
    let count = 0;
    const disposable = detector.onWake(() => { count++; });
    detector.checkTranscript('hey vox');
    expect(count).toBe(1);
    disposable.dispose();
    detector.resetCooldown();
    detector.checkTranscript('hey vox');
    expect(count).toBe(1); // callback was removed
  });
});
