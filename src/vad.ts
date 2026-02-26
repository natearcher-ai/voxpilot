/**
 * Simple energy-based Voice Activity Detection.
 * Determines if an audio frame contains speech based on RMS energy.
 */
export class VoiceActivityDetector {
  private threshold: number;
  private speechFrames = 0;
  private silenceFrames = 0;
  private isSpeaking = false;

  // Require N consecutive frames to trigger state change (debounce)
  private readonly speechOnsetFrames = 3;
  private readonly silenceOnsetFrames: number;

  constructor(sensitivity: number = 0.5, silenceTimeoutMs: number = 1500, frameDurationMs: number = 30) {
    // Map sensitivity (0.1-0.95) to threshold. Lower sensitivity = higher threshold.
    this.threshold = 0.01 + (1 - sensitivity) * 0.05;
    this.silenceOnsetFrames = Math.ceil(silenceTimeoutMs / frameDurationMs);
  }

  /**
   * Process a frame of PCM 16-bit LE audio.
   * Returns: { isSpeech: boolean, speechStarted: boolean, speechEnded: boolean }
   */
  process(pcm16: Buffer): { isSpeech: boolean; speechStarted: boolean; speechEnded: boolean } {
    const rms = this.computeRMS(pcm16);
    const frameIsSpeech = rms > this.threshold;

    let speechStarted = false;
    let speechEnded = false;

    if (frameIsSpeech) {
      this.speechFrames++;
      this.silenceFrames = 0;

      if (!this.isSpeaking && this.speechFrames >= this.speechOnsetFrames) {
        this.isSpeaking = true;
        speechStarted = true;
      }
    } else {
      this.silenceFrames++;
      this.speechFrames = 0;

      if (this.isSpeaking && this.silenceFrames >= this.silenceOnsetFrames) {
        this.isSpeaking = false;
        speechEnded = true;
      }
    }

    return { isSpeech: this.isSpeaking, speechStarted, speechEnded };
  }

  reset(): void {
    this.speechFrames = 0;
    this.silenceFrames = 0;
    this.isSpeaking = false;
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
