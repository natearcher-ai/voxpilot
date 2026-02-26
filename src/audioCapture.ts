import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Captures audio from the system microphone using a lightweight native helper.
 * Falls back to platform-specific CLI tools (arecord on Linux, sox, ffmpeg).
 * Outputs raw PCM 16-bit LE mono 16kHz.
 */
export class AudioCapture extends EventEmitter implements vscode.Disposable {
  private process: ChildProcess | null = null;
  private _isCapturing = false;

  get isCapturing(): boolean {
    return this._isCapturing;
  }

  start(): void {
    if (this._isCapturing) { return; }

    const cmd = this.getCaptureCommand();
    if (!cmd) {
      this.emit('error', new Error('No audio capture tool found. Install sox, ffmpeg, or arecord.'));
      return;
    }

    this.process = spawn(cmd.bin, cmd.args, { stdio: ['ignore', 'pipe', 'ignore'] });
    this._isCapturing = true;

    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.emit('audio', chunk);
    });

    this.process.on('error', (err) => {
      this._isCapturing = false;
      this.emit('error', err);
    });

    this.process.on('close', (code) => {
      this._isCapturing = false;
      this.emit('stopped', code);
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this._isCapturing = false;
  }

  dispose(): void {
    this.stop();
    this.removeAllListeners();
  }

  private getCaptureCommand(): { bin: string; args: string[] } | null {
    // Raw PCM s16le mono 16kHz output
    const platform = process.platform;

    if (platform === 'linux') {
      // Try arecord first (ALSA)
      return {
        bin: 'arecord',
        args: ['-f', 'S16_LE', '-r', '16000', '-c', '1', '-t', 'raw', '-q', '-'],
      };
    }

    if (platform === 'darwin') {
      // sox with coreaudio
      return {
        bin: 'sox',
        args: ['-d', '-t', 'raw', '-r', '16000', '-b', '16', '-c', '1', '-e', 'signed-integer', '-'],
      };
    }

    if (platform === 'win32') {
      // ffmpeg with dshow
      return {
        bin: 'ffmpeg',
        args: [
          '-f', 'dshow', '-i', 'audio=default',
          '-ar', '16000', '-ac', '1', '-f', 's16le', '-acodec', 'pcm_s16le',
          'pipe:1',
        ],
      };
    }

    return null;
  }
}
