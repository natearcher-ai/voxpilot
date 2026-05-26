import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeForWakeWord, containsWakePhrase, WakeWordDetector } from '../wakeWord';

describe('normalizeForWakeWord', () => {
  it('lowercases text', () => {
    expect(normalizeForWakeWord('Hey Vox')).toBe('hey vox');
  });

  it('strips punctuation', () => {
    expect(normalizeForWakeWord('hey, vox!')).toBe('hey vox');
  });

  it('collapses whitespace', () => {
    expect(normalizeForWakeWord('hey   vox')).toBe('hey vox');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeForWakeWord('  hey vox  ')).toBe('hey vox');
  });
});

describe('containsWakePhrase', () => {
  it('detects exact wake phrase', () => {
    expect(containsWakePhrase('hey vox', 'hey vox')).toBe(true);
  });

  it('detects wake phrase within longer text', () => {
    expect(containsWakePhrase('okay hey vox start recording', 'hey vox')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(containsWakePhrase('Hey Vox', 'hey vox')).toBe(true);
  });

  it('handles fuzzy variants for "hey vox"', () => {
    expect(containsWakePhrase('hey box', 'hey vox')).toBe(true);
    expect(containsWakePhrase('hey fox', 'hey vox')).toBe(true);
    expect(containsWakePhrase('a vox', 'hey vox')).toBe(true);
  });

  it('returns false for non-matching text', () => {
    expect(containsWakePhrase('hello world', 'hey vox')).toBe(false);
    expect(containsWakePhrase('the fox jumped', 'hey vox')).toBe(false);
  });

  it('returns false for empty wake phrase', () => {
    expect(containsWakePhrase('hey vox', '')).toBe(false);
  });
});

describe('WakeWordDetector', () => {
  let detector: WakeWordDetector;

  beforeEach(() => {
    detector = new WakeWordDetector('hey vox');
  });

  it('starts disabled', () => {
    expect(detector.enabled).toBe(false);
  });

  it('does not detect when disabled', () => {
    const result = detector.checkTranscript('hey vox');
    expect(result).toBe(false);
  });

  it('detects wake phrase when enabled', () => {
    detector.enable();
    const callback = vi.fn();
    detector.onWake(callback);

    const result = detector.checkTranscript('hey vox');

    expect(result).toBe(true);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('respects cooldown period', () => {
    vi.useFakeTimers();
    detector.enable();
    const callback = vi.fn();
    detector.onWake(callback);

    detector.checkTranscript('hey vox'); // first detection
    expect(callback).toHaveBeenCalledTimes(1);

    detector.checkTranscript('hey vox'); // within cooldown - should not fire
    expect(callback).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3001); // past cooldown

    detector.checkTranscript('hey vox'); // should fire again
    expect(callback).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('allows changing wake phrase', () => {
    detector.enable();
    detector.setWakePhrase('computer');

    expect(detector.wakePhrase).toBe('computer');
    expect(detector.checkTranscript('computer')).toBe(true);
    expect(detector.checkTranscript('hey vox')).toBe(false);
  });

  it('dispose pattern works for onWake', () => {
    detector.enable();
    const callback = vi.fn();
    const disposable = detector.onWake(callback);

    disposable.dispose();

    detector.checkTranscript('hey vox');
    expect(callback).not.toHaveBeenCalled();
  });

  it('resetCooldown allows immediate re-detection', () => {
    vi.useFakeTimers();
    detector.enable();
    const callback = vi.fn();
    detector.onWake(callback);

    detector.checkTranscript('hey vox');
    expect(callback).toHaveBeenCalledTimes(1);

    detector.resetCooldown();

    detector.checkTranscript('hey vox');
    expect(callback).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
