import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Plays subtle audio beeps for start/stop listening feedback.
 * Generates short sine-wave WAV files on the fly and plays via platform CLI.
 */
export class SoundFeedback {
  private tempDir: string;
  private startBeepPath: string;
  private stopBeepPath: string;
  private ready = false;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'voxpilot-sounds');
    this.startBeepPath = path.join(this.tempDir, 'start.wav');
    this.stopBeepPath = path.join(this.tempDir, 'stop.wav');
    this.ensureSounds();
  }

  private ensureSounds(): void {
    try {
      fs.mkdirSync(this.tempDir, { recursive: true });
      // Start beep: short high-pitched chirp (880Hz, 80ms)
      fs.writeFileSync(this.startBeepPath, this.generateWav(880, 0.08, 0.3));
      // Stop beep: lower tone (440Hz, 60ms)
      fs.writeFileSync(this.stopBeepPath, this.generateWav(440, 0.06, 0.25));
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  /** Generate a minimal WAV file buffer with a sine wave tone. */
  private generateWav(freq: number, durationSec: number, volume: number): Buffer {
    const sampleRate = 16000;
    const numSamples = Math.floor(sampleRate * durationSec);
    const fadeLen = Math.floor(numSamples * 0.15); // 15% fade in/out to avoid clicks
    const dataSize = numSamples * 2; // 16-bit mono

    // WAV header (44 bytes)
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);       // chunk size
    header.writeUInt16LE(1, 20);        // PCM
    header.writeUInt16LE(1, 22);        // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28); // byte rate
    header.writeUInt16LE(2, 32);        // block align
    header.writeUInt16LE(16, 34);       // bits per sample
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    const data = Buffer.alloc(dataSize);
    for (let i = 0; i < numSamples; i++) {
      let sample = Math.sin(2 * Math.PI * freq * i / sampleRate) * volume;
      // Fade in/out
      if (i < fadeLen) { sample *= i / fadeLen; }
      else if (i > numSamples - fadeLen) { sample *= (numSamples - i) / fadeLen; }
      const val = Math.max(-1, Math.min(1, sample));
      data.writeInt16LE(Math.round(val * 32767), i * 2);
    }

    return Buffer.concat([header, data]);
  }

  playStart(): void {
    if (this.ready) { this.play(this.startBeepPath); }
  }

  playStop(): void {
    if (this.ready) { this.play(this.stopBeepPath); }
  }

  private play(filePath: string): void {
    try {
      const platform = process.platform;
      if (platform === 'darwin') {
        spawn('afplay', [filePath], { stdio: 'ignore' }).unref();
      } else if (platform === 'linux') {
        // Try aplay first (ALSA), fall back to paplay (PulseAudio)
        const child = spawn('aplay', ['-q', filePath], { stdio: 'ignore' });
        child.on('error', () => {
          spawn('paplay', [filePath], { stdio: 'ignore' }).unref();
        });
        child.unref();
      } else if (platform === 'win32') {
        spawn('powershell', ['-c', `(New-Object Media.SoundPlayer '${filePath}').PlaySync()`], { stdio: 'ignore' }).unref();
      }
    } catch {
      // Sound is non-critical — silently ignore failures
    }
  }

  dispose(): void {
    try {
      if (fs.existsSync(this.startBeepPath)) { fs.unlinkSync(this.startBeepPath); }
      if (fs.existsSync(this.stopBeepPath)) { fs.unlinkSync(this.stopBeepPath); }
      if (fs.existsSync(this.tempDir)) { fs.rmdirSync(this.tempDir); }
    } catch {}
  }
}
