/**
 * Wake word detection — say "hey vox" to start recording hands-free.
 *
 * Runs a lightweight always-listening loop that captures short audio windows
 * and checks for the wake phrase. When detected, triggers full recording.
 *
 * The wake word detector uses the same audio capture and transcriber as the
 * main engine, but in a low-power mode:
 *   1. Capture 2-second audio windows
 *   2. Run VAD — only transcribe if speech detected
 *   3. Check transcript for wake phrase
 *   4. If matched, emit 'wake' event and stop detection
 *
 * Enable via `voxpilot.wakeWord` setting (default: false).
 * Custom wake phrase via `voxpilot.wakePhrase` (default: "hey vox").
 */

import * as vscode from 'vscode';

/** Normalize text for wake word comparison: lowercase, collapse whitespace, strip punctuation */
export function normalizeForWakeWord(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')  // strip punctuation
    .replace(/\s+/g, ' ')     // collapse whitespace
    .trim();
}

/** Check if a transcript contains the wake phrase */
export function containsWakePhrase(transcript: string, wakePhrase: string): boolean {
  const normalizedTranscript = normalizeForWakeWord(transcript);
  const normalizedPhrase = normalizeForWakeWord(wakePhrase);

  if (!normalizedPhrase) { return false; }

  // Exact substring match
  if (normalizedTranscript.includes(normalizedPhrase)) { return true; }

  // Fuzzy match: allow common ASR misrecognitions of "hey vox"
  const fuzzyVariants = buildFuzzyVariants(normalizedPhrase);
  return fuzzyVariants.some(variant => normalizedTranscript.includes(variant));
}

/**
 * Build fuzzy variants of the wake phrase to handle common ASR errors.
 * For "hey vox": also match "hey box", "hey fox", "hey vocs", "a vox", etc.
 */
function buildFuzzyVariants(phrase: string): string[] {
  const variants: string[] = [];

  // Only generate variants for the default "hey vox" phrase
  if (phrase === 'hey vox') {
    variants.push(
      'hey box',
      'hey fox',
      'hey vocs',
      'hey vocks',
      'hey vaux',
      'a vox',
      'hey vox',
      'hey vos',
      'hey voxs',
    );
  }

  return variants;
}

/**
 * WakeWordDetector manages the always-listening state.
 * It doesn't directly capture audio — the engine wires it up.
 *
 * Usage:
 *   detector.enable()   → start listening for wake word
 *   detector.disable()  → stop listening
 *   detector.onWake(cb) → register callback for wake detection
 *   detector.checkTranscript(text) → feed transcripts from short captures
 */
export class WakeWordDetector {
  private _enabled = false;
  private _wakePhrase: string;
  private _callbacks: Array<() => void> = [];
  private _cooldownMs = 3000; // Ignore wake words for 3s after triggering
  private _lastWakeTime = 0;

  constructor(wakePhrase: string = 'hey vox') {
    this._wakePhrase = wakePhrase;
  }

  get enabled(): boolean { return this._enabled; }
  get wakePhrase(): string { return this._wakePhrase; }

  enable(): void {
    this._enabled = true;
  }

  disable(): void {
    this._enabled = false;
  }

  setWakePhrase(phrase: string): void {
    this._wakePhrase = phrase || 'hey vox';
  }

  /** Register a callback for when the wake word is detected */
  onWake(callback: () => void): vscode.Disposable {
    this._callbacks.push(callback);
    return { dispose: () => {
      const idx = this._callbacks.indexOf(callback);
      if (idx >= 0) { this._callbacks.splice(idx, 1); }
    }};
  }

  /**
   * Feed a transcript from a short audio capture window.
   * Returns true if the wake word was detected.
   */
  checkTranscript(transcript: string): boolean {
    if (!this._enabled) { return false; }

    // Cooldown: don't re-trigger immediately after a wake
    const now = Date.now();
    if (now - this._lastWakeTime < this._cooldownMs) { return false; }

    if (containsWakePhrase(transcript, this._wakePhrase)) {
      this._lastWakeTime = now;
      // Notify all listeners
      for (const cb of this._callbacks) {
        try { cb(); } catch { /* ignore callback errors */ }
      }
      return true;
    }

    return false;
  }

  /** Reset cooldown (e.g. when recording stops) */
  resetCooldown(): void {
    this._lastWakeTime = 0;
  }
}
