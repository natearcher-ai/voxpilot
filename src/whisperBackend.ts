import * as vscode from 'vscode';
import * as https from 'https';
import * as path from 'path';
import { TranscriptionResult } from './transcriber';

/**
 * OpenAI Whisper API backend configuration.
 */
export interface WhisperBackendConfig {
  enabled: boolean;
  apiKey: string;
  model: 'whisper-1';
  language: string;
  temperature: number;
  responseFormat: 'json' | 'verbose_json';
  prompt: string;
  baseUrl: string;
}

/**
 * Response from the OpenAI Whisper API (verbose_json format).
 */
interface WhisperVerboseResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
    avg_logprob: number;
    no_speech_prob: number;
  }>;
}

/**
 * Response from the OpenAI Whisper API (json format).
 */
interface WhisperJsonResponse {
  text: string;
}

/**
 * OpenAI Whisper API backend for cloud-based speech recognition.
 * Provides higher accuracy multilingual transcription by sending audio
 * to OpenAI's Whisper API. Requires an API key.
 *
 * Privacy note: Audio data is sent to OpenAI's servers when this backend
 * is active. The privacy dashboard tracks all cloud interactions.
 */
export class WhisperBackend {
  private _config: WhisperBackendConfig;
  private _available = false;

  constructor() {
    this._config = this.loadConfig();
    this._available = this.validateConfig();
  }

  /** Whether the backend is configured and ready to use. */
  get available(): boolean {
    return this._available;
  }

  /** Current configuration (without API key exposed). */
  get config(): Omit<WhisperBackendConfig, 'apiKey'> & { apiKey: string } {
    return {
      ...this._config,
      apiKey: this._config.apiKey ? '***' : '',
    };
  }

  /** Reload configuration from VS Code settings. */
  reload(): void {
    this._config = this.loadConfig();
    this._available = this.validateConfig();
  }

  /**
   * Transcribe raw PCM 16-bit LE mono 16kHz audio using OpenAI Whisper API.
   * Converts PCM to WAV format before sending.
   *
   * @param pcmBuffer Raw PCM 16-bit LE mono 16kHz audio
   * @param language ISO 639-1 language code or 'auto' for auto-detection
   * @returns Transcription result with text and detected language
   */
  async transcribe(pcmBuffer: Buffer, language?: string): Promise<TranscriptionResult> {
    if (!this._available) {
      throw new Error('Whisper backend not configured. Set voxpilot.whisperBackend.apiKey.');
    }

    // Convert PCM to WAV for the API
    const wavBuffer = this.pcmToWav(pcmBuffer);

    // Build multipart form data
    const boundary = `----VoxPilotBoundary${Date.now()}`;
    const formParts: Buffer[] = [];

    // File part
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`
    ));
    formParts.push(wavBuffer);
    formParts.push(Buffer.from('\r\n'));

    // Model part
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `${this._config.model}\r\n`
    ));

    // Response format
    formParts.push(Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `${this._config.responseFormat}\r\n`
    ));

    // Language (if specified and not auto)
    if (language && language !== 'auto') {
      formParts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="language"\r\n\r\n` +
        `${language}\r\n`
      ));
    }

    // Temperature
    if (this._config.temperature > 0) {
      formParts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="temperature"\r\n\r\n` +
        `${this._config.temperature}\r\n`
      ));
    }

    // Prompt (vocabulary hints)
    if (this._config.prompt) {
      formParts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="prompt"\r\n\r\n` +
        `${this._config.prompt}\r\n`
      ));
    }

    // End boundary
    formParts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(formParts);

    // Parse base URL
    const url = new URL(this._config.baseUrl);
    const apiPath = url.pathname.replace(/\/$/, '') + '/audio/transcriptions';

    // Make HTTPS request
    const response = await this.makeRequest({
      hostname: url.hostname,
      port: url.port ? parseInt(url.port) : 443,
      path: apiPath,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._config.apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
    }, body);

    // Parse response
    if (this._config.responseFormat === 'verbose_json') {
      const parsed = JSON.parse(response) as WhisperVerboseResponse;
      return {
        text: parsed.text.trim(),
        language: parsed.language,
      };
    } else {
      const parsed = JSON.parse(response) as WhisperJsonResponse;
      return {
        text: parsed.text.trim(),
        language: language !== 'auto' ? language : undefined,
      };
    }
  }

  /**
   * Convert PCM 16-bit LE mono 16kHz to WAV format.
   */
  private pcmToWav(pcm: Buffer): Buffer {
    const sampleRate = 16000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcm.length;
    const headerSize = 44;

    const wav = Buffer.alloc(headerSize + dataSize);

    // RIFF header
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + dataSize, 4);
    wav.write('WAVE', 8);

    // fmt sub-chunk
    wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16); // sub-chunk size
    wav.writeUInt16LE(1, 20); // PCM format
    wav.writeUInt16LE(numChannels, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(byteRate, 28);
    wav.writeUInt16LE(blockAlign, 32);
    wav.writeUInt16LE(bitsPerSample, 34);

    // data sub-chunk
    wav.write('data', 36);
    wav.writeUInt32LE(dataSize, 40);
    pcm.copy(wav, 44);

    return wav;
  }

  /**
   * Make an HTTPS request and return the response body.
   */
  private makeRequest(options: https.RequestOptions, body: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseBody);
          } else {
            let errorMessage = `Whisper API error (${res.statusCode})`;
            try {
              const parsed = JSON.parse(responseBody);
              if (parsed.error?.message) {
                errorMessage = `Whisper API: ${parsed.error.message}`;
              }
            } catch { /* ignore parse errors */ }
            reject(new Error(errorMessage));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Whisper API request failed: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Whisper API request timed out'));
      });

      req.setTimeout(30000); // 30s timeout
      req.write(body);
      req.end();
    });
  }

  /**
   * Load configuration from VS Code settings.
   */
  private loadConfig(): WhisperBackendConfig {
    const config = vscode.workspace.getConfiguration('voxpilot');
    return {
      enabled: config.get<boolean>('whisperBackend.enabled', false),
      apiKey: config.get<string>('whisperBackend.apiKey', ''),
      model: 'whisper-1',
      language: config.get<string>('language', 'auto'),
      temperature: config.get<number>('whisperBackend.temperature', 0),
      responseFormat: 'verbose_json',
      prompt: config.get<string>('whisperBackend.prompt', ''),
      baseUrl: config.get<string>('whisperBackend.baseUrl', 'https://api.openai.com/v1'),
    };
  }

  /**
   * Validate that the configuration is sufficient to make API calls.
   */
  private validateConfig(): boolean {
    return this._config.enabled && this._config.apiKey.length > 0;
  }
}

/** Singleton instance of the Whisper backend. */
export const whisperBackend = new WhisperBackend();
