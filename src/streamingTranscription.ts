/**
 * Streaming transcription — show partial results in real-time as you speak.
 *
 * Instead of waiting for silence to trigger transcription, this module
 * manages a rolling transcription window that processes audio in small
 * chunks (e.g. every 2 seconds) while the user is still speaking.
 *
 * Architecture:
 *   1. Audio frames accumulate in a rolling buffer
 *   2. Every `windowMs` (default 2000ms), the buffer is transcribed
 *   3. Partial results are displayed via the overlay/status bar
 *   4. On speech end, final transcription replaces all partials
 *
 * This gives users immediate visual feedback of what's being recognized,
 * making it easier to correct mistakes and stay in flow.
 *
 * Enable via `voxpilot.streamingTranscription` setting (default: false).
 * Window size via `voxpilot.streamingWindowMs` (default: 2000).
 */

/**
 * Manages the rolling audio buffer and transcription window timing.
 * The engine feeds audio frames in; this module decides when to trigger
 * intermediate transcriptions.
 */
export class StreamingBuffer {
  private buffer: Buffer[] = [];
  private totalBytes = 0;
  private lastTranscribeTime = 0;
  private readonly windowMs: number;
  private readonly minBytes: number; // Minimum audio before first transcription
  private _partialText = '';
  private _windowCount = 0;

  /**
   * @param windowMs How often to trigger intermediate transcription (ms). Default 2000.
   * @param sampleRate Audio sample rate in Hz. Default 16000.
   */
  constructor(windowMs: number = 2000, sampleRate: number = 16000) {
    this.windowMs = Math.max(500, windowMs);
    // Minimum 500ms of audio before first transcription (16-bit mono)
    this.minBytes = Math.floor(sampleRate * 0.5) * 2;
  }

  /** Current accumulated partial text from intermediate transcriptions */
  get partialText(): string { return this._partialText; }

  /** Number of transcription windows processed */
  get windowCount(): number { return this._windowCount; }

  /** Total audio bytes in buffer */
  get byteCount(): number { return this.totalBytes; }

  /**
   * Add an audio frame to the rolling buffer.
   * Returns true if enough time has passed for a new transcription window.
   */
  addFrame(frame: Buffer): boolean {
    this.buffer.push(frame);
    this.totalBytes += frame.length;

    const now = Date.now();
    const elapsed = now - this.lastTranscribeTime;

    // Don't transcribe until we have minimum audio
    if (this.totalBytes < this.minBytes) { return false; }

    // Check if window interval has elapsed
    if (this.lastTranscribeTime === 0 || elapsed >= this.windowMs) {
      return true;
    }

    return false;
  }

  /**
   * Get the accumulated audio for transcription.
   * Returns the full buffer contents (all audio since start/last reset).
   * Does NOT clear the buffer — we want cumulative transcription for accuracy.
   */
  getAudio(): Buffer {
    this.lastTranscribeTime = Date.now();
    this._windowCount++;
    return Buffer.concat(this.buffer);
  }

  /** Update the partial text from an intermediate transcription result */
  setPartialText(text: string): void {
    this._partialText = text;
  }

  /** Get and clear the buffer for final transcription */
  flush(): Buffer {
    const audio = Buffer.concat(this.buffer);
    this.reset();
    return audio;
  }

  /** Reset all state for a new recording session */
  reset(): void {
    this.buffer = [];
    this.totalBytes = 0;
    this.lastTranscribeTime = 0;
    this._partialText = '';
    this._windowCount = 0;
  }

  /** Check if the buffer has any audio */
  hasAudio(): boolean {
    return this.totalBytes > 0;
  }
}
