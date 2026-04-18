import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WalkyTalkyDetector, WalkyTalkyCallbacks } from '../walkyTalky';

function makeCallbacks(): WalkyTalkyCallbacks & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    onHoldStart: () => calls.push('holdStart'),
    onHoldEnd: () => calls.push('holdEnd'),
    onTap: () => calls.push('tap'),
  };
}

describe('WalkyTalkyDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle state', () => {
    const cb = makeCallbacks();
    const detector = new WalkyTalkyDetector(300, cb);
    expect(detector.currentState).toBe('idle');
    expect(detector.isHolding).toBe(false);
  });

  it('detects quick tap (release before threshold)', () => {
    const cb = makeCallbacks();
    const detector = new WalkyTalkyDetector(300, cb);

    detector.onKeyDown();
    expect(detector.currentState).toBe('pressed');

    vi.advanceTimersByTime(100); // Before threshold
    detector.onKeyUp();

    expect(cb.calls).toEqual(['tap']);
    expect(detector.currentState).toBe('idle');
  });

  it('detects hold (release after threshold)', () => {
    const cb = makeCallbacks();
    const detector = new WalkyTalkyDetector(300, cb);

    detector.onKeyDown();
    vi.advanceTimersByTime(350); // Past threshold

    expect(cb.calls).toEqual(['holdStart']);
    expect(detector.isHolding).toBe(true);

    detector.onKeyUp();
    expect(cb.calls).toEqual(['holdStart', 'holdEnd']);
    expect(detector.currentState).toBe('idle');
  });

  it('ignores duplicate keyDown while pressed', () => {
    const cb = makeCallbacks();
    const detector = new WalkyTalkyDetector(300, cb);

    detector.onKeyDown();
    detector.onKeyDown(); // duplicate
    vi.advanceTimersByTime(350);

    expect(cb.calls).toEqual(['holdStart']); // Only one holdStart
  });

  it('reset cancels hold and returns to idle', () => {
    const cb = makeCallbacks();
    const detector = new WalkyTalkyDetector(300, cb);

    detector.onKeyDown();
    vi.advanceTimersByTime(350);
    expect(detector.isHolding).toBe(true);

    detector.reset();
    expect(detector.currentState).toBe('idle');
    expect(cb.calls).toEqual(['holdStart', 'holdEnd']);
  });

  it('reset from pressed state does not fire callbacks', () => {
    const cb = makeCallbacks();
    const detector = new WalkyTalkyDetector(300, cb);

    detector.onKeyDown();
    detector.reset();

    expect(cb.calls).toEqual([]);
    expect(detector.currentState).toBe('idle');
  });

  it('enforces minimum threshold of 100ms', () => {
    const cb = makeCallbacks();
    const detector = new WalkyTalkyDetector(10, cb); // Below minimum

    detector.onKeyDown();
    vi.advanceTimersByTime(50); // Should still be below 100ms minimum
    // Timer fires at 100ms (clamped minimum)
    expect(detector.currentState).toBe('pressed');

    vi.advanceTimersByTime(60); // Now past 100ms
    expect(cb.calls).toEqual(['holdStart']);
  });
});
