/**
 * Walky-talky mode — press and hold a keybinding to record, release to stop and transcribe.
 *
 * Similar to VS Code Speech's walky-talky behavior:
 *   1. User presses and holds the keybinding (e.g. Ctrl+Shift+V)
 *   2. Recording starts immediately
 *   3. User speaks while holding the key
 *   4. On key release, recording stops and transcript is delivered
 *
 * This provides a natural push-to-talk experience without needing to
 * press once to start and again to stop.
 *
 * Implementation:
 *   - Track keydown/keyup events via VS Code's keybinding system
 *   - Use a hold threshold (default 300ms) to distinguish tap (toggle) from hold (walky-talky)
 *   - If key is held longer than threshold, enter walky-talky mode
 *   - On release, finalize speech and deliver transcript
 *
 * Enable via `voxpilot.walkyTalky` setting (default: true).
 * Hold threshold via `voxpilot.walkyTalkyThresholdMs` (default: 300).
 */

/**
 * State machine for walky-talky detection.
 * Distinguishes between a quick tap (toggle recording) and a press-and-hold (walky-talky).
 */
export type WalkyTalkyState = 'idle' | 'pressed' | 'holding' | 'releasing';

export interface WalkyTalkyCallbacks {
  /** Called when walky-talky hold is detected (start recording) */
  onHoldStart: () => void;
  /** Called when key is released after hold (stop recording + deliver) */
  onHoldEnd: () => void;
  /** Called on quick tap (toggle recording as normal) */
  onTap: () => void;
}

export class WalkyTalkyDetector {
  private state: WalkyTalkyState = 'idle';
  private pressTime = 0;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly thresholdMs: number;
  private callbacks: WalkyTalkyCallbacks;

  /**
   * @param thresholdMs How long the key must be held to enter walky-talky mode (ms).
   * @param callbacks Event handlers for hold/tap detection.
   */
  constructor(thresholdMs: number, callbacks: WalkyTalkyCallbacks) {
    this.thresholdMs = Math.max(100, thresholdMs);
    this.callbacks = callbacks;
  }

  /** Current state of the detector */
  get currentState(): WalkyTalkyState {
    return this.state;
  }

  /** Whether currently in a walky-talky hold */
  get isHolding(): boolean {
    return this.state === 'holding';
  }

  /**
   * Call when the keybinding is pressed down.
   * Starts a timer to detect hold vs tap.
   */
  onKeyDown(): void {
    if (this.state !== 'idle') { return; }

    this.state = 'pressed';
    this.pressTime = Date.now();

    // Start hold detection timer
    this.holdTimer = setTimeout(() => {
      if (this.state === 'pressed') {
        this.state = 'holding';
        this.callbacks.onHoldStart();
      }
    }, this.thresholdMs);
  }

  /**
   * Call when the keybinding is released.
   * If held long enough → walky-talky end. If quick tap → toggle.
   */
  onKeyUp(): void {
    const elapsed = Date.now() - this.pressTime;

    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }

    if (this.state === 'holding') {
      // Was holding → end walky-talky
      this.state = 'releasing';
      this.callbacks.onHoldEnd();
      this.state = 'idle';
    } else if (this.state === 'pressed') {
      // Quick tap → toggle
      this.state = 'idle';
      this.callbacks.onTap();
    } else {
      this.state = 'idle';
    }
  }

  /**
   * Force reset to idle state (e.g. on focus loss).
   */
  reset(): void {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.state === 'holding') {
      this.callbacks.onHoldEnd();
    }
    this.state = 'idle';
    this.pressTime = 0;
  }

  /**
   * Update the hold threshold dynamically.
   */
  setThreshold(ms: number): void {
    (this as any).thresholdMs = Math.max(100, ms);
  }
}
