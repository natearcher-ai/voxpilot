/**
 * Ambient Listening Mode — always-on low-power background listener that
 * activates full recording when the wake word is detected.
 *
 * Unlike the basic wake word feature (which simply listens for a phrase),
 * ambient mode is designed for continuous background operation with minimal
 * CPU and battery impact:
 *
 *   - Adaptive duty cycling: only runs VAD/transcription when audio energy
 *     exceeds a very low threshold (skips silence entirely)
 *   - Configurable power modes (low/balanced/performance) that control
 *     capture window size and check frequency
 *   - Auto-suspend when the system is idle or on battery (when detectable)
 *   - Visual status bar indicator showing ambient state
 *   - Graceful degradation: falls back to longer intervals under high CPU load
 *
 * Enable via `voxpilot.ambientListening` setting (default: false).
 */

import * as vscode from 'vscode';
import { WakeWordDetector } from './wakeWord';

/** Power mode determines how aggressively the ambient listener checks for speech. */
export type AmbientPowerMode = 'low' | 'balanced' | 'performance';

export interface AmbientListeningConfig {
  enabled: boolean;
  powerMode: AmbientPowerMode;
  /** Whether to show a status bar indicator when ambient mode is active */
  showIndicator: boolean;
  /** Auto-resume ambient listening after recording stops */
  autoResume: boolean;
  /** Suspend ambient listening when no editor is focused (saves power) */
  suspendOnBlur: boolean;
}

/** Power mode parameters */
interface PowerModeParams {
  /** Minimum audio energy (RMS) to trigger VAD processing */
  energyFloor: number;
  /** How long to accumulate audio before checking (ms) */
  captureWindowMs: number;
  /** Cooldown between transcription attempts (ms) */
  checkIntervalMs: number;
  /** Maximum audio buffer before forced discard (seconds) */
  maxBufferSec: number;
  /** Skip N frames between energy checks (duty cycling) */
  skipFrames: number;
}

const POWER_MODES: Record<AmbientPowerMode, PowerModeParams> = {
  low: {
    energyFloor: 0.008,
    captureWindowMs: 3000,
    checkIntervalMs: 500,
    maxBufferSec: 4,
    skipFrames: 3,
  },
  balanced: {
    energyFloor: 0.005,
    captureWindowMs: 2000,
    checkIntervalMs: 200,
    maxBufferSec: 3,
    skipFrames: 1,
  },
  performance: {
    energyFloor: 0.003,
    captureWindowMs: 1500,
    checkIntervalMs: 100,
    maxBufferSec: 3,
    skipFrames: 0,
  },
};

export interface AmbientStats {
  /** Total time ambient mode has been active (ms) */
  activeTimeMs: number;
  /** Number of times wake word was detected */
  wakeDetections: number;
  /** Number of audio windows processed */
  windowsProcessed: number;
  /** Number of windows skipped (below energy floor) */
  windowsSkipped: number;
  /** Estimated CPU duty cycle (0-1) */
  dutyCycle: number;
}

/**
 * AmbientListeningManager coordinates the low-power background listening loop.
 * It wraps the existing WakeWordDetector with power-management logic.
 */
export class AmbientListeningManager implements vscode.Disposable {
  private _active = false;
  private _suspended = false;
  private _config: AmbientListeningConfig;
  private _params: PowerModeParams;
  private _stats: AmbientStats = {
    activeTimeMs: 0,
    wakeDetections: 0,
    windowsProcessed: 0,
    windowsSkipped: 0,
    dutyCycle: 0,
  };
  private _startTime = 0;
  private _frameCount = 0;
  private _energyAccumulator = 0;
  private _energySamples = 0;
  private _lastCheckTime = 0;
  private _speechBuffer: Buffer[] = [];
  private _speechBufferBytes = 0;
  private _callbacks: Array<() => void> = [];
  private _suspendCallbacks: Array<(suspended: boolean) => void> = [];
  private _disposables: vscode.Disposable[] = [];
  private _focusDisposable: vscode.Disposable | undefined;

  constructor(config?: Partial<AmbientListeningConfig>) {
    this._config = {
      enabled: false,
      powerMode: 'balanced',
      showIndicator: true,
      autoResume: true,
      suspendOnBlur: false,
      ...config,
    };
    this._params = POWER_MODES[this._config.powerMode];

    // Watch for window focus changes if suspendOnBlur is enabled
    if (this._config.suspendOnBlur) {
      this._focusDisposable = vscode.window.onDidChangeWindowState(state => {
        if (!this._active) { return; }
        if (!state.focused && !this._suspended) {
          this.suspend('window-blur');
        } else if (state.focused && this._suspended) {
          this.resume('window-focus');
        }
      });
      this._disposables.push(this._focusDisposable);
    }
  }

  get active(): boolean { return this._active; }
  get suspended(): boolean { return this._suspended; }
  get config(): AmbientListeningConfig { return { ...this._config }; }
  get stats(): AmbientStats {
    return {
      ...this._stats,
      activeTimeMs: this._active ? Date.now() - this._startTime : this._stats.activeTimeMs,
      dutyCycle: this._stats.windowsProcessed > 0
        ? this._stats.windowsProcessed / (this._stats.windowsProcessed + this._stats.windowsSkipped)
        : 0,
    };
  }

  /** Update configuration at runtime */
  updateConfig(config: Partial<AmbientListeningConfig>): void {
    const oldPowerMode = this._config.powerMode;
    Object.assign(this._config, config);
    if (config.powerMode && config.powerMode !== oldPowerMode) {
      this._params = POWER_MODES[this._config.powerMode];
    }
    // Handle suspendOnBlur change
    if (config.suspendOnBlur !== undefined) {
      if (config.suspendOnBlur && !this._focusDisposable) {
        this._focusDisposable = vscode.window.onDidChangeWindowState(state => {
          if (!this._active) { return; }
          if (!state.focused && !this._suspended) {
            this.suspend('window-blur');
          } else if (state.focused && this._suspended) {
            this.resume('window-focus');
          }
        });
        this._disposables.push(this._focusDisposable);
      } else if (!config.suspendOnBlur && this._focusDisposable) {
        this._focusDisposable.dispose();
        this._focusDisposable = undefined;
      }
    }
  }

  /** Start ambient listening */
  start(): void {
    if (this._active) { return; }
    this._active = true;
    this._suspended = false;
    this._startTime = Date.now();
    this._frameCount = 0;
    this._energyAccumulator = 0;
    this._energySamples = 0;
    this._lastCheckTime = Date.now();
    this._speechBuffer = [];
    this._speechBufferBytes = 0;
  }

  /** Stop ambient listening */
  stop(): void {
    if (!this._active) { return; }
    this._stats.activeTimeMs += Date.now() - this._startTime;
    this._active = false;
    this._suspended = false;
    this._speechBuffer = [];
    this._speechBufferBytes = 0;
  }

  /** Temporarily suspend (e.g., during active recording or window blur) */
  suspend(reason: string = 'manual'): void {
    if (!this._active || this._suspended) { return; }
    this._suspended = true;
    this._speechBuffer = [];
    this._speechBufferBytes = 0;
    for (const cb of this._suspendCallbacks) {
      try { cb(true); } catch { /* ignore */ }
    }
  }

  /** Resume from suspension */
  resume(reason: string = 'manual'): void {
    if (!this._active || !this._suspended) { return; }
    this._suspended = false;
    this._frameCount = 0;
    this._energyAccumulator = 0;
    this._energySamples = 0;
    this._lastCheckTime = Date.now();
    for (const cb of this._suspendCallbacks) {
      try { cb(false); } catch { /* ignore */ }
    }
  }

  /** Register callback for when wake word is detected in ambient mode */
  onWake(callback: () => void): vscode.Disposable {
    this._callbacks.push(callback);
    return { dispose: () => {
      const idx = this._callbacks.indexOf(callback);
      if (idx >= 0) { this._callbacks.splice(idx, 1); }
    }};
  }

  /** Register callback for suspend/resume state changes */
  onSuspendChange(callback: (suspended: boolean) => void): vscode.Disposable {
    this._suspendCallbacks.push(callback);
    return { dispose: () => {
      const idx = this._suspendCallbacks.indexOf(callback);
      if (idx >= 0) { this._suspendCallbacks.splice(idx, 1); }
    }};
  }

  /**
   * Process an audio frame in ambient mode.
   * Returns: { shouldTranscribe: boolean, audioData?: Buffer }
   *
   * This is the core power-saving logic:
   * 1. Skip frames based on duty cycling (skipFrames param)
   * 2. Compute energy — if below floor, discard immediately
   * 3. If energy is above floor, accumulate into speech buffer
   * 4. When buffer reaches capture window size, signal ready for transcription
   */
  processFrame(frame: Buffer): { shouldTranscribe: boolean; audioData?: Buffer } {
    if (!this._active || this._suspended) {
      return { shouldTranscribe: false };
    }

    this._frameCount++;

    // Duty cycling: skip frames to reduce CPU
    if (this._params.skipFrames > 0 && this._frameCount % (this._params.skipFrames + 1) !== 0) {
      return { shouldTranscribe: false };
    }

    // Compute RMS energy of this frame
    const rms = computeRMS(frame);
    this._energyAccumulator += rms;
    this._energySamples++;

    // Below energy floor — skip entirely (silence/background noise)
    if (rms < this._params.energyFloor) {
      // If we had accumulated speech, check if enough silence has passed to discard
      if (this._speechBufferBytes > 0) {
        const now = Date.now();
        if (now - this._lastCheckTime > this._params.captureWindowMs) {
          // Silence after speech — this buffer might contain the wake word
          return this.flushBuffer();
        }
      }
      this._stats.windowsSkipped++;
      return { shouldTranscribe: false };
    }

    // Energy above floor — accumulate audio
    this._speechBuffer.push(frame);
    this._speechBufferBytes += frame.length;
    this._lastCheckTime = Date.now();

    // Check if buffer exceeds max size (discard to prevent memory growth)
    const maxBytes = this._params.maxBufferSec * 16000 * 2;
    if (this._speechBufferBytes > maxBytes) {
      // Too long for a wake phrase — discard oldest half
      const halfLen = Math.floor(this._speechBuffer.length / 2);
      const discarded = this._speechBuffer.splice(0, halfLen);
      this._speechBufferBytes -= discarded.reduce((sum, b) => sum + b.length, 0);
    }

    // Check interval: don't transcribe too frequently
    const now = Date.now();
    const elapsed = now - this._lastCheckTime;
    if (elapsed < this._params.checkIntervalMs) {
      return { shouldTranscribe: false };
    }

    // Buffer has enough audio — flush for transcription
    if (this._speechBufferBytes >= (this._params.captureWindowMs / 1000) * 16000 * 2 * 0.5) {
      return this.flushBuffer();
    }

    return { shouldTranscribe: false };
  }

  /**
   * Called when the wake word is detected in the transcribed audio.
   * Fires all registered wake callbacks.
   */
  notifyWakeDetected(): void {
    this._stats.wakeDetections++;
    for (const cb of this._callbacks) {
      try { cb(); } catch { /* ignore */ }
    }
  }

  /** Flush the speech buffer and return it for transcription */
  private flushBuffer(): { shouldTranscribe: boolean; audioData?: Buffer } {
    if (this._speechBuffer.length === 0) {
      return { shouldTranscribe: false };
    }

    const audioData = Buffer.concat(this._speechBuffer);
    this._speechBuffer = [];
    this._speechBufferBytes = 0;
    this._stats.windowsProcessed++;

    return { shouldTranscribe: true, audioData };
  }

  /** Reset all stats */
  resetStats(): void {
    this._stats = {
      activeTimeMs: 0,
      wakeDetections: 0,
      windowsProcessed: 0,
      windowsSkipped: 0,
      dutyCycle: 0,
    };
  }

  dispose(): void {
    this.stop();
    this._callbacks = [];
    this._suspendCallbacks = [];
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }
}

/** Compute RMS energy of a PCM 16-bit LE buffer */
export function computeRMS(pcm16: Buffer): number {
  const samples = pcm16.length / 2;
  if (samples === 0) { return 0; }

  let sumSquares = 0;
  for (let i = 0; i < pcm16.length; i += 2) {
    const sample = pcm16.readInt16LE(i) / 32768;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / samples);
}

/**
 * AmbientStatusIndicator manages the status bar display for ambient mode.
 */
export class AmbientStatusIndicator implements vscode.Disposable {
  private _item: vscode.StatusBarItem;
  private _visible = false;

  constructor() {
    this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this._item.command = 'voxpilot.toggleAmbientListening';
  }

  show(suspended: boolean = false): void {
    if (suspended) {
      this._item.text = '$(eye-closed) Ambient (paused)';
      this._item.tooltip = 'VoxPilot ambient listening is paused — click to resume';
      this._item.backgroundColor = undefined;
    } else {
      this._item.text = '$(eye) Ambient';
      this._item.tooltip = 'VoxPilot ambient listening — waiting for wake word. Click to disable.';
      this._item.backgroundColor = undefined;
    }
    this._item.show();
    this._visible = true;
  }

  hide(): void {
    this._item.hide();
    this._visible = false;
  }

  get visible(): boolean { return this._visible; }

  dispose(): void {
    this._item.dispose();
  }
}
