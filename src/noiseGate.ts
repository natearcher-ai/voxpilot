/**
 * Simple noise gate filter for PCM 16-bit LE audio.
 * Frames with RMS below the threshold are zeroed out,
 * preventing low-level background noise (fans, hum, hiss)
 * from reaching VAD and triggering false speech detection.
 */
export class NoiseGate {
  private threshold: number;
  private readonly attackFrames: number;
  private readonly releaseFrames: number;
  private openFrames = 0;
  private closeFrames = 0;
  private _isOpen = false;

  /**
   * @param threshold RMS threshold (0–1). Frames below this are gated. 0 = disabled.
   * @param attackMs  How quickly the gate opens (ms). Default 5ms (near-instant).
   * @param releaseMs How quickly the gate closes (ms). Default 50ms (smooth tail).
   * @param frameDurationMs Duration of each audio frame in ms.
   */
  constructor(threshold: number = 0, attackMs: number = 5, releaseMs: number = 50, frameDurationMs: number = 30) {
    this.threshold = Math.max(0, Math.min(1, threshold));
    this.attackFrames = Math.max(1, Math.ceil(attackMs / frameDurationMs));
    this.releaseFrames = Math.max(1, Math.ceil(releaseMs / frameDurationMs));
  }

  /** Returns true if the gate is currently passing audio through. */
  get isOpen(): boolean {
    return this._isOpen;
  }

  /**
   * Process a PCM 16-bit LE frame.
   * Returns the frame unchanged if above threshold, or a zeroed buffer if gated.
   */
  process(pcm16: Buffer): Buffer {
    // Threshold 0 = gate disabled, pass everything
    if (this.threshold <= 0) { return pcm16; }

    const rms = this.computeRMS(pcm16);

    if (rms >= this.threshold) {
      this.openFrames++;
      this.closeFrames = 0;
      if (!this._isOpen && this.openFrames >= this.attackFrames) {
        this._isOpen = true;
      }
    } else {
      this.closeFrames++;
      this.openFrames = 0;
      if (this._isOpen && this.closeFrames >= this.releaseFrames) {
        this._isOpen = false;
      }
    }

    return this._isOpen ? pcm16 : Buffer.alloc(pcm16.length);
  }

  reset(): void {
    this.openFrames = 0;
    this.closeFrames = 0;
    this._isOpen = false;
  }

  setThreshold(threshold: number): void {
    this.threshold = Math.max(0, Math.min(1, threshold));
  }

  private computeRMS(pcm16: Buffer): number {
    const samples = pcm16.length / 2;
    if (samples === 0) { return 0; }
    let sumSq = 0;
    for (let i = 0; i < pcm16.length; i += 2) {
      const sample = pcm16.readInt16LE(i) / 32768;
      sumSq += sample * sample;
    }
    return Math.sqrt(sumSq / samples);
  }
}
