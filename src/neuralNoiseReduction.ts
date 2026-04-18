/**
 * Neural noise reduction — RNNoise-based denoiser for superior background noise filtering.
 *
 * Uses a lightweight recurrent neural network (RNNoise) compiled to WebAssembly
 * for real-time noise suppression. Unlike the adaptive noise gate which simply
 * gates frames below a threshold, RNNoise separates speech from noise at the
 * spectral level, preserving speech quality even in noisy environments.
 *
 * Architecture:
 *   1. Audio frames are resampled to 48kHz (RNNoise native rate)
 *   2. RNNoise processes 480-sample frames (10ms at 48kHz)
 *   3. Output is resampled back to 16kHz for the ASR pipeline
 *   4. A VAD probability is also returned per frame
 *
 * The WASM module is loaded lazily on first use (~200KB download).
 *
 * Enable via `voxpilot.neuralNoiseReduction` setting (default: false).
 * Falls back to adaptive noise gate if WASM fails to load.
 */

/**
 * Interface for the RNNoise WASM module.
 * The actual WASM binary is loaded at runtime from the extension's assets.
 */
export interface RNNoiseModule {
  /** Create a new denoiser state */
  createState(): number;
  /** Destroy a denoiser state */
  destroyState(state: number): void;
  /** Process a 480-sample frame. Returns VAD probability (0-1). Modifies buffer in-place. */
  processFrame(state: number, buffer: Float32Array): number;
}

/**
 * Resample PCM audio between sample rates using linear interpolation.
 * Good enough for noise reduction preprocessing — not audiophile quality.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) { return input; }

  const ratio = fromRate / toRate;
  const outputLength = Math.ceil(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcFloor = Math.floor(srcIndex);
    const srcCeil = Math.min(srcFloor + 1, input.length - 1);
    const frac = srcIndex - srcFloor;

    output[i] = input[srcFloor] * (1 - frac) + input[srcCeil] * frac;
  }

  return output;
}

/**
 * Convert PCM 16-bit LE buffer to Float32Array (-1.0 to 1.0).
 */
export function pcm16ToFloat32(pcm16: Buffer): Float32Array {
  const samples = pcm16.length / 2;
  const float32 = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    float32[i] = pcm16.readInt16LE(i * 2) / 32768;
  }
  return float32;
}

/**
 * Convert Float32Array back to PCM 16-bit LE buffer.
 */
export function float32ToPcm16(float32: Float32Array): Buffer {
  const buffer = Buffer.alloc(float32.length * 2);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  return buffer;
}

/** RNNoise native frame size: 480 samples at 48kHz = 10ms */
const RNNOISE_FRAME_SIZE = 480;

/**
 * Neural noise reduction processor.
 * Wraps RNNoise WASM with resampling and frame management.
 */
export class NeuralNoiseReduction {
  private module: RNNoiseModule | null = null;
  private state: number = 0;
  private _loaded = false;
  private _vadProbability = 0;
  private pendingBuffer: Float32Array = new Float32Array(0);

  get isLoaded(): boolean { return this._loaded; }
  get vadProbability(): number { return this._vadProbability; }

  /**
   * Initialize with an RNNoise WASM module.
   * Call this after loading the WASM binary.
   */
  initialize(module: RNNoiseModule): void {
    this.module = module;
    this.state = module.createState();
    this._loaded = true;
  }

  /**
   * Process a PCM 16-bit LE audio frame (16kHz mono).
   * Returns the denoised frame as PCM 16-bit LE.
   */
  process(pcm16: Buffer): Buffer {
    if (!this._loaded || !this.module) {
      return pcm16; // Pass through if not loaded
    }

    // Convert to float32
    const float32 = pcm16ToFloat32(pcm16);

    // Resample 16kHz → 48kHz
    const upsampled = resample(float32, 16000, 48000);

    // Accumulate in pending buffer
    const combined = new Float32Array(this.pendingBuffer.length + upsampled.length);
    combined.set(this.pendingBuffer);
    combined.set(upsampled, this.pendingBuffer.length);

    // Process complete 480-sample frames
    const outputFrames: Float32Array[] = [];
    let offset = 0;

    while (offset + RNNOISE_FRAME_SIZE <= combined.length) {
      const frame = combined.slice(offset, offset + RNNOISE_FRAME_SIZE);
      this._vadProbability = this.module.processFrame(this.state, frame);
      outputFrames.push(frame);
      offset += RNNOISE_FRAME_SIZE;
    }

    // Save remaining samples for next call
    this.pendingBuffer = combined.slice(offset);

    if (outputFrames.length === 0) {
      return pcm16; // Not enough data yet
    }

    // Concatenate processed frames
    const totalLength = outputFrames.reduce((sum, f) => sum + f.length, 0);
    const processed48k = new Float32Array(totalLength);
    let pos = 0;
    for (const frame of outputFrames) {
      processed48k.set(frame, pos);
      pos += frame.length;
    }

    // Resample 48kHz → 16kHz
    const downsampled = resample(processed48k, 48000, 16000);

    // Convert back to PCM 16-bit LE
    return float32ToPcm16(downsampled);
  }

  /** Reset state for a new recording session */
  reset(): void {
    if (this.module && this.state) {
      this.module.destroyState(this.state);
      this.state = this.module.createState();
    }
    this.pendingBuffer = new Float32Array(0);
    this._vadProbability = 0;
  }

  /** Clean up WASM resources */
  dispose(): void {
    if (this.module && this.state) {
      this.module.destroyState(this.state);
      this.state = 0;
    }
    this.module = null;
    this._loaded = false;
    this.pendingBuffer = new Float32Array(0);
  }
}
