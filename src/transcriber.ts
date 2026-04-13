import * as path from 'path';

export interface TranscriptionResult {
  text: string;
  language?: string;
}

export interface StreamingCallbacks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
}

/**
 * ASR transcriber using @huggingface/transformers pipeline.
 * Supports Moonshine, Whisper, and Parakeet models.
 * Parakeet TDT enables streaming partial transcripts via chunked inference.
 */
/** Models that use the Whisper architecture and support multilingual transcription. */
const WHISPER_MODEL_IDS = [
  'whisper-tiny', 'whisper-base', 'whisper-small', 'whisper-medium', 'whisper-large-v3-turbo',
];

export class Transcriber {
  private loaded = false;
  private isStreaming = false;
  private _isWhisperModel = false;
  private _lastDetectedLanguage: string | undefined;
  private pipelineInstance: any = null;

  constructor(private modelId: string, private runtimeDir: string, private cacheDir: string) {
    this.isStreaming = modelId === 'parakeet-tdt-0.6b';
    this._isWhisperModel = WHISPER_MODEL_IDS.includes(modelId);
  }

  get isWhisperModel(): boolean { return this._isWhisperModel; }

  /** The language code detected by the last Whisper transcription (auto-detect mode). */
  get lastDetectedLanguage(): string | undefined { return this._lastDetectedLanguage; }

  get streaming(): boolean {
    return this.isStreaming;
  }

  async load(): Promise<void> {
    if (this.loaded) { return; }

    try {
      const runtimeModules = path.join(this.runtimeDir, 'node_modules');

      // Add runtime node_modules to Node's module resolution so that
      // @huggingface/transformers can find onnxruntime-node at require time
      const Module = require('module');
      if (!Module.globalPaths.includes(runtimeModules)) {
        Module.globalPaths.unshift(runtimeModules);
      }

      const transformers = require(path.join(runtimeModules, '@huggingface', 'transformers'));

      // Configure cache directory and environment
      transformers.env.cacheDir = this.cacheDir;
      transformers.env.allowLocalModels = true;

      const MODEL_REPOS: Record<string, string> = {
        'moonshine-tiny': 'onnx-community/moonshine-tiny-ONNX',
        'moonshine-base': 'onnx-community/moonshine-base-ONNX',
        'whisper-tiny': 'onnx-community/whisper-tiny',
        'whisper-base': 'onnx-community/whisper-base',
        'whisper-small': 'onnx-community/whisper-small',
        'whisper-medium': 'onnx-community/whisper-medium',
        'whisper-large-v3-turbo': 'onnx-community/whisper-large-v3-turbo',
        'parakeet-tdt-0.6b': 'onnx-community/parakeet-tdt-0.6b',
      };
      const repo = MODEL_REPOS[this.modelId] || 'onnx-community/moonshine-base-ONNX';

      this.pipelineInstance = await transformers.pipeline('automatic-speech-recognition', repo, {
        dtype: 'fp32',
      });

      this.loaded = true;
    } catch (err: any) {
      this.loaded = false;
      this.pipelineInstance = null;
      throw new Error(`Failed to initialize transcriber: ${err.message}`);
    }
  }

  /**
   * Transcribe raw PCM 16-bit LE mono 16kHz audio buffer.
   * @param language ISO 639-1 language code for Whisper models, or 'auto' for auto-detect. Ignored for non-Whisper models.
   */
  async transcribe(pcmBuffer: Buffer, language?: string): Promise<TranscriptionResult> {
    if (!this.loaded || !this.pipelineInstance) {
      throw new Error('Model not loaded');
    }

    // Convert PCM 16-bit LE to Float32Array (normalized -1 to 1)
    const float32 = this.pcm16ToFloat32(pcmBuffer);

    const opts: Record<string, any> = { sampling_rate: 16000 };

    // Pass language hint to Whisper models (not Moonshine/Parakeet)
    if (this._isWhisperModel && language && language !== 'auto') {
      opts.language = language;
    }

    // Request language detection output for Whisper in auto mode
    if (this._isWhisperModel && (!language || language === 'auto')) {
      opts.return_timestamps = false;
    }

    const result = await this.pipelineInstance(float32, opts);

    const text = result?.text ?? '';

    // Extract detected language from Whisper output
    this._lastDetectedLanguage = undefined;
    if (this._isWhisperModel) {
      // Whisper pipeline may return language in chunks or top-level
      if (result?.chunks?.[0]?.language) {
        this._lastDetectedLanguage = result.chunks[0].language;
      } else if (result?.language) {
        this._lastDetectedLanguage = result.language;
      } else if (language && language !== 'auto') {
        // User explicitly set language — echo it back
        this._lastDetectedLanguage = language;
      }
    }

    return { text, language: this._lastDetectedLanguage };
  }

  /**
   * Streaming transcription for Parakeet — processes audio in chunks and
   * emits partial transcripts as each chunk is decoded.
   * Falls back to standard transcribe() for non-streaming models.
   */
  async transcribeStreaming(pcmBuffer: Buffer, callbacks: StreamingCallbacks, language?: string): Promise<TranscriptionResult> {
    if (!this.isStreaming) {
      const result = await this.transcribe(pcmBuffer, language);
      callbacks.onFinal?.(result.text);
      return result;
    }

    if (!this.loaded || !this.pipelineInstance) {
      throw new Error('Model not loaded');
    }

    const float32 = this.pcm16ToFloat32(pcmBuffer);

    // Parakeet supports chunked inference via chunk_length_s.
    // Process in 5-second chunks for low-latency partial results.
    const CHUNK_SECONDS = 5;
    const SAMPLES_PER_CHUNK = 16000 * CHUNK_SECONDS;
    const totalSamples = float32.length;

    if (totalSamples <= SAMPLES_PER_CHUNK) {
      // Short audio — single pass, no chunking needed
      const result = await this.pipelineInstance(float32, { sampling_rate: 16000 });
      const text = result?.text ?? '';
      callbacks.onPartial?.(text);
      callbacks.onFinal?.(text);
      return { text };
    }

    // Chunked streaming: process incrementally and emit partials
    let accumulated = '';
    const numChunks = Math.ceil(totalSamples / SAMPLES_PER_CHUNK);

    for (let i = 0; i < numChunks; i++) {
      const start = 0; // Always transcribe from the beginning for context
      const end = Math.min((i + 1) * SAMPLES_PER_CHUNK, totalSamples);
      const chunk = float32.slice(start, end);

      const result = await this.pipelineInstance(chunk, {
        sampling_rate: 16000,
      });

      accumulated = result?.text ?? '';

      if (i < numChunks - 1) {
        callbacks.onPartial?.(accumulated);
      }
    }

    callbacks.onFinal?.(accumulated);
    return { text: accumulated };
  }

  private pcm16ToFloat32(pcm: Buffer): Float32Array {
    const samples = pcm.length / 2;
    const float32 = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      float32[i] = pcm.readInt16LE(i * 2) / 32768;
    }
    return float32;
  }

  async dispose(): Promise<void> {
    if (this.pipelineInstance) {
      try { await this.pipelineInstance.dispose(); } catch {}
      this.pipelineInstance = null;
    }
    this.loaded = false;
  }
}
