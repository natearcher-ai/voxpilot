import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalkyTalkyDetector } from '../walkyTalky';

describe('WalkyTalkyDetector', () => {
  let callbacks: { onHoldStart: ReturnType<typeof vi.fn>; onHoldEnd: ReturnType<typeof vi.fn>; onTap: ReturnType<typeof vi.fn> };
  let detector: WalkyTalkyDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    callbacks = {
      onHoldStart: vi.fn(),
      onHoldEnd: vi.fn(),
      onTap: vi.fn(),
    };
    detector = new WalkyTalkyDetector(300, callbacks);
  });

  it('starts in idle state', () => {
    expect(detector.currentState).toBe('idle');
    expect(detector.isHolding).toBe(false);
  });

  it('triggers onTap for quick press and release', () => {
    detector.onKeyDown();
    expect(detector.currentState).toBe('pressed');

    // Release before threshold
    vi.advanceTimersByTime(100);
    detector.onKeyUp();

    expect(callbacks.onTap).toHaveBeenCalledOnce();
    expect(callbacks.onHoldStart).not.toHaveBeenCalled();
    expect(detector.currentState).toBe('idle');
  });

  it('triggers onHoldStart after threshold', () => {
    detector.onKeyDown();

    // Advance past threshold
    vi.advanceTimersByTime(300);

    expect(callbacks.onHoldStart).toHaveBeenCalledOnce();
    expect(detector.currentState).toBe('holding');
    expect(detector.isHolding).toBe(true);
  });

  it('triggers onHoldEnd when key released after hold', () => {
    detector.onKeyDown();
    vi.advanceTimersByTime(300);
    expect(detector.currentState).toBe('holding');

    detector.onKeyUp();

    expect(callbacks.onHoldEnd).toHaveBeenCalledOnce();
    expect(detector.currentState).toBe('idle');
  });

  it('does not trigger onTap when held long enough', () => {
    detector.onKeyDown();
    vi.advanceTimersByTime(300);
    detector.onKeyUp();

    expect(callbacks.onTap).not.toHaveBeenCalled();
    expect(callbacks.onHoldStart).toHaveBeenCalledOnce();
    expect(callbacks.onHoldEnd).toHaveBeenCalledOnce();
  });

  it('ignores repeated onKeyDown while not idle', () => {
    detector.onKeyDown();
    detector.onKeyDown(); // should be ignored
    detector.onKeyDown(); // should be ignored

    vi.advanceTimersByTime(300);
    expect(callbacks.onHoldStart).toHaveBeenCalledTimes(1);
  });

  it('reset() calls onHoldEnd if holding', () => {
    detector.onKeyDown();
    vi.advanceTimersByTime(300);
    expect(detector.currentState).toBe('holding');

    detector.reset();

    expect(callbacks.onHoldEnd).toHaveBeenCalledOnce();
    expect(detector.currentState).toBe('idle');
  });

  it('reset() does not call onHoldEnd if not holding', () => {
    detector.onKeyDown();
    vi.advanceTimersByTime(100); // still pressed, not holding

    detector.reset();

    expect(callbacks.onHoldEnd).not.toHaveBeenCalled();
    expect(detector.currentState).toBe('idle');
  });

  it('setThreshold() updates the threshold', () => {
    detector.setThreshold(500);

    detector.onKeyDown();
    vi.advanceTimersByTime(300); // old threshold
    expect(detector.currentState).toBe('pressed'); // not holding yet

    vi.advanceTimersByTime(200); // now at 500ms
    expect(detector.currentState).toBe('holding');
  });

  it('setThreshold() enforces minimum of 100ms', () => {
    detector.setThreshold(50); // should clamp to 100

    detector.onKeyDown();
    vi.advanceTimersByTime(99);
    expect(detector.currentState).toBe('pressed');

    vi.advanceTimersByTime(1);
    expect(detector.currentState).toBe('holding');
  });
});
