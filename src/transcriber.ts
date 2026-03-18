import * as path from 'path';

let pipelineInstance: any;

export interface StreamingCallbacks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
}

/**
 * ASR transcriber using @huggingface/transformers pipeline.
 * Supports Moonshine, Whisper, and Parakeet models.
 * Parakeet TDT enables streaming partial transcripts via chunked inference.
 */
export class Transcriber {
  private loaded = false;
  private isStreaming = false;

  constructor(private modelId: string, private runtimeDir: string, private cacheDir: string) {
    this.isStreaming = modelId === 'parakeet-tdt-0.6b';
  }

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

      pipelineInstance = await transformers.pipeline('automatic-speech-recognition', repo, {
        dtype: 'fp32',
      });

      this.loaded = true;
    } catch (err: any) {
      this.loaded = false;
      throw new Error(`Failed to initialize transcriber: ${err.message}`);
    }
  }

  /**
   * Transcribe raw PCM 16-bit LE mono 16kHz audio buffer.
   */
  async transcribe(pcmBuffer: Buffer): Promise<string> {
    if (!this.loaded || !pipelineInstance) {
      throw new Error('Model not loaded');
    }

    // Convert PCM 16-bit LE to Float32Array (normalized -1 to 1)
    const float32 = this.pcm16ToFloat32(pcmBuffer);

    const result = await pipelineInstance(float32, {
      sampling_rate: 16000,
    });

    return result?.text ?? '';
  }

  /**
   * Streaming transcription for Parakeet — processes audio in chunks and
   * emits partial transcripts as each chunk is decoded.
   * Falls back to standard transcribe() for non-streaming models.
   */
  async transcribeStreaming(pcmBuffer: Buffer, callbacks: StreamingCallbacks): Promise<string> {
    if (!this.isStreaming) {
      const text = await this.transcribe(pcmBuffer);
      callbacks.onFinal?.(text);
      return text;
    }

    if (!this.loaded || !pipelineInstance) {
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
      const result = await pipelineInstance(float32, { sampling_rate: 16000 });
      const text = result?.text ?? '';
      callbacks.onPartial?.(text);
      callbacks.onFinal?.(text);
      return text;
    }

    // Chunked streaming: process incrementally and emit partials
    let accumulated = '';
    const numChunks = Math.ceil(totalSamples / SAMPLES_PER_CHUNK);

    for (let i = 0; i < numChunks; i++) {
      const start = 0; // Always transcribe from the beginning for context
      const end = Math.min((i + 1) * SAMPLES_PER_CHUNK, totalSamples);
      const chunk = float32.slice(start, end);

      const result = await pipelineInstance(chunk, {
        sampling_rate: 16000,
      });

      accumulated = result?.text ?? '';

      if (i < numChunks - 1) {
        callbacks.onPartial?.(accumulated);
      }
    }

    callbacks.onFinal?.(accumulated);
    return accumulated;
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
    if (pipelineInstance) {
      try { await pipelineInstance.dispose(); } catch {}
      pipelineInstance = null;
    }
    this.loaded = false;
  }
}
