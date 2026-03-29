/**
 * Mini waveform visualizer for the status bar.
 * Maintains a rolling buffer of RMS levels and renders them
 * as Unicode block characters: ▁▂▃▄▅▆▇█
 */
export class WaveformVisualizer {
  private static readonly BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  private readonly bufferSize: number;
  private readonly samples: number[] = [];

  /** @param bufferSize Number of bars to display (default 8) */
  constructor(bufferSize = 8) {
    this.bufferSize = bufferSize;
  }

  /** Push a new RMS value (0–1 linear scale). */
  push(rms: number): void {
    this.samples.push(Math.max(0, Math.min(1, rms)));
    if (this.samples.length > this.bufferSize) {
      this.samples.shift();
    }
  }

  /** Render the current waveform as a compact Unicode string. */
  render(): string {
    if (this.samples.length === 0) {
      return ' '.repeat(this.bufferSize);
    }
    // Pad left with empty if we don't have enough samples yet
    const padded = new Array<number>(Math.max(0, this.bufferSize - this.samples.length))
      .fill(0)
      .concat(this.samples);

    return padded
      .map(v => {
        // Map RMS to block index. RMS is typically 0–0.3 for speech,
        // so scale up to make the visualization more dynamic.
        const scaled = Math.min(1, v * 5);
        const idx = Math.round(scaled * (WaveformVisualizer.BLOCKS.length - 1));
        return WaveformVisualizer.BLOCKS[idx];
      })
      .join('');
  }

  /** Reset the buffer. */
  reset(): void {
    this.samples.length = 0;
  }
}
