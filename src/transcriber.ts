import * as path from 'path';

let pipelineInstance: any;

/**
 * Moonshine ASR transcriber using @huggingface/transformers pipeline.
 * Handles model loading, tokenization, and inference automatically.
 */
export class Transcriber {
  private loaded = false;

  constructor(private modelId: string, private runtimeDir: string, private cacheDir: string) {}

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

      const repo = this.modelId === 'moonshine-base'
        ? 'onnx-community/moonshine-base-ONNX'
        : 'onnx-community/moonshine-tiny-ONNX';

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
