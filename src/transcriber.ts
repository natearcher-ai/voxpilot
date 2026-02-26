import * as path from 'path';
import * as fs from 'fs';

// onnxruntime-node is optional — loaded dynamically from runtime dir
let ort: typeof import('onnxruntime-node');

interface TokenizerConfig {
  model?: { vocab: Record<string, number> };
  added_tokens?: Array<{ id: number; content: string }>;
}

interface ModelConfig {
  bos_token_id?: number;
  eos_token_id?: number;
  decoder_start_token_id?: number;
  vocab_size?: number;
}

/**
 * Moonshine ASR transcriber using ONNX Runtime.
 * Uses HuggingFace transformers ONNX format:
 *   encoder_model.onnx         — audio encoder
 *   decoder_model_merged.onnx  — decoder with merged KV cache
 */
export class Transcriber {
  private encoderSession!: any;
  private decoderSession!: any;
  private vocab: string[] = [];
  private bosToken = 1;
  private eosToken = 2;
  private loaded = false;

  constructor(private modelDir: string, private onnxRuntimePath?: string) {}

  async load(): Promise<void> {
    if (this.loaded) { return; }

    if (this.onnxRuntimePath) {
      ort = require(this.onnxRuntimePath);
    } else {
      ort = require('onnxruntime-node');
    }

    // Load model config for token IDs
    this.loadConfig();

    const opts: any = {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    };

    const [encoder, decoder] = await Promise.all([
      ort.InferenceSession.create(path.join(this.modelDir, 'onnx', 'encoder_model.onnx'), opts),
      ort.InferenceSession.create(path.join(this.modelDir, 'onnx', 'decoder_model_merged.onnx'), opts),
    ]);

    this.encoderSession = encoder;
    this.decoderSession = decoder;

    this.loadTokenizer();
    this.loaded = true;
  }

  /**
   * Transcribe raw PCM 16-bit LE mono 16kHz audio buffer.
   */
  async transcribe(pcmBuffer: Buffer): Promise<string> {
    if (!this.loaded) { throw new Error('Model not loaded'); }

    const float32 = this.pcm16ToFloat32(pcmBuffer);

    // Moonshine encoder expects [batch, seq_len] raw audio
    const audioTensor = new ort.Tensor('float32', float32, [1, float32.length]);
    const attentionMask = new ort.Tensor(
      'int64',
      new BigInt64Array(float32.length).fill(1n),
      [1, float32.length],
    );

    // Encode
    const encFeeds: Record<string, any> = {};
    for (const name of this.encoderSession.inputNames) {
      if (name.includes('attention_mask')) {
        encFeeds[name] = attentionMask;
      } else {
        encFeeds[name] = audioTensor;
      }
    }

    const encResult = await this.encoderSession.run(encFeeds);
    const lastHidden = encResult[this.encoderSession.outputNames[0]];

    // Decode — greedy autoregressive
    const tokens = await this.greedyDecode(lastHidden);
    return this.detokenize(tokens);
  }

  private async greedyDecode(encoderHidden: any): Promise<number[]> {
    const maxTokens = 448;
    const tokens: number[] = [];

    // Encoder attention mask for cross-attention
    const seqLen = encoderHidden.dims[1];
    const encoderAttentionMask = new ort.Tensor(
      'int64',
      new BigInt64Array(seqLen).fill(1n),
      [1, seqLen],
    );

    // First token: decoder_start_token_id (BOS)
    let inputIds = new ort.Tensor('int64', new BigInt64Array([BigInt(this.bosToken)]), [1, 1]);

    // Initialize empty past_key_values for first step
    // The merged decoder uses use_cache_branch to switch behavior
    let useCacheBranch = new ort.Tensor('bool', new Uint8Array([0]), [1]);

    // Build initial KV cache (zeros) — we need to inspect decoder input names
    const kvInputNames = this.decoderSession.inputNames.filter((n: string) => n.startsWith('past_key_values'));
    const kvCache: Record<string, any> = {};

    for (const name of kvInputNames) {
      // Determine shape from name pattern. For first pass, use empty tensors.
      // Typical shape: [batch, num_heads, 0, head_dim] for self-attn past
      // We use seq_len=0 for the first pass
      if (name.includes('encoder')) {
        // Cross-attention cache: will be filled after first pass
        kvCache[name] = new ort.Tensor('float32', new Float32Array(0), [1, 8, 0, 36]);
      } else {
        // Self-attention cache: starts empty
        kvCache[name] = new ort.Tensor('float32', new Float32Array(0), [1, 8, 0, 36]);
      }
    }

    for (let step = 0; step < maxTokens; step++) {
      const feeds: Record<string, any> = {
        input_ids: inputIds,
        encoder_hidden_states: encoderHidden,
        encoder_attention_mask: encoderAttentionMask,
      };

      // Add use_cache_branch if the model expects it
      if (this.decoderSession.inputNames.includes('use_cache_branch')) {
        feeds['use_cache_branch'] = useCacheBranch;
      }

      // Add KV cache inputs
      for (const [name, tensor] of Object.entries(kvCache)) {
        feeds[name] = tensor;
      }

      // Only include feeds that match actual input names
      const validFeeds: Record<string, any> = {};
      for (const name of this.decoderSession.inputNames) {
        if (feeds[name] !== undefined) {
          validFeeds[name] = feeds[name];
        }
      }

      const result = await this.decoderSession.run(validFeeds);

      // Get logits — shape [batch, seq, vocab]
      const logits = result['logits'];
      const logitsData = logits.data as Float32Array;
      const vocabSize = logits.dims[2];

      // Get last token logits
      const lastTokenOffset = (logits.dims[1] - 1) * vocabSize;
      const lastLogits = logitsData.slice(lastTokenOffset, lastTokenOffset + vocabSize);
      const nextToken = this.argmax(lastLogits);

      if (nextToken === this.eosToken) { break; }
      tokens.push(nextToken);

      // Prepare next step
      inputIds = new ort.Tensor('int64', new BigInt64Array([BigInt(nextToken)]), [1, 1]);
      useCacheBranch = new ort.Tensor('bool', new Uint8Array([1]), [1]);

      // Update KV cache from outputs
      for (const outName of this.decoderSession.outputNames) {
        if (outName.startsWith('present')) {
          // Map present_key_values.X.Y -> past_key_values.X.Y
          const pastName = outName.replace('present', 'past_key_values');
          if (kvInputNames.includes(pastName)) {
            kvCache[pastName] = result[outName];
          }
        }
      }
    }

    return tokens;
  }

  private argmax(arr: Float32Array): number {
    let maxIdx = 0;
    let maxVal = arr[0];
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] > maxVal) {
        maxVal = arr[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  private loadConfig(): void {
    const configPath = path.join(this.modelDir, 'config.json');
    if (fs.existsSync(configPath)) {
      const config: ModelConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.decoder_start_token_id !== undefined) { this.bosToken = config.decoder_start_token_id; }
      if (config.eos_token_id !== undefined) { this.eosToken = config.eos_token_id; }
    }

    const genPath = path.join(this.modelDir, 'generation_config.json');
    if (fs.existsSync(genPath)) {
      const gen: ModelConfig = JSON.parse(fs.readFileSync(genPath, 'utf-8'));
      if (gen.decoder_start_token_id !== undefined) { this.bosToken = gen.decoder_start_token_id; }
      if (gen.eos_token_id !== undefined) { this.eosToken = gen.eos_token_id; }
    }
  }

  private loadTokenizer(): void {
    const tokPath = path.join(this.modelDir, 'tokenizer.json');
    if (fs.existsSync(tokPath)) {
      const raw: TokenizerConfig = JSON.parse(fs.readFileSync(tokPath, 'utf-8'));
      if (raw.model?.vocab) {
        const entries = Object.entries(raw.model.vocab).sort((a, b) => a[1] - b[1]);
        this.vocab = entries.map(([token]) => token);
      }
      // Merge added_tokens
      if (raw.added_tokens) {
        for (const tok of raw.added_tokens) {
          this.vocab[tok.id] = tok.content;
        }
      }
    }
  }

  private detokenize(tokens: number[]): string {
    if (this.vocab.length === 0) {
      return `[tokens: ${tokens.join(',')}]`;
    }
    return tokens
      .map(t => this.vocab[t] ?? '')
      .join('')
      .replace(/Ġ/g, ' ')
      .replace(/Ċ/g, '\n')
      .trim();
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
    if (!this.loaded) { return; }
    await Promise.all([
      this.encoderSession?.release(),
      this.decoderSession?.release(),
    ]);
    this.loaded = false;
  }
}
