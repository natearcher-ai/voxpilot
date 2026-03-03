import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Captures audio from the system microphone using a lightweight native helper.
 * Falls back to platform-specific CLI tools (arecord on Linux, sox, ffmpeg).
 * Outputs raw PCM 16-bit LE mono 16kHz.
 */
export interface AudioDevice {
  id: string;
  name: string;
}

export class AudioCapture extends EventEmitter implements vscode.Disposable {
  private process: ChildProcess | null = null;
  private _isCapturing = false;
  private deviceId: string = '';

  get isCapturing(): boolean {
    return this._isCapturing;
  }

  setDevice(deviceId: string): void {
    this.deviceId = deviceId;
  }

  start(): void {
    if (this._isCapturing) { return; }

    const cmd = this.getCaptureCommand();
    if (!cmd) {
      this.emit('error', new Error('No audio capture tool found. Install sox, ffmpeg, or arecord.'));
      return;
    }

    this.process = spawn(cmd.bin, cmd.args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, ...cmd.env },
    });
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

  /**
   * List available audio input devices on the current platform.
   */
  static listDevices(): AudioDevice[] {
    const platform = process.platform;
    try {
      if (platform === 'linux') {
        return AudioCapture.listLinuxDevices();
      }
      if (platform === 'darwin') {
        return AudioCapture.listMacDevices();
      }
      if (platform === 'win32') {
        return AudioCapture.listWindowsDevices();
      }
    } catch {}
    return [];
  }

  private static listLinuxDevices(): AudioDevice[] {
    const { execSync } = require('child_process');
    const devices: AudioDevice[] = [];
    try {
      // List ALSA capture devices
      const output: string = execSync('arecord -l 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
      const re = /card (\d+):.*\[(.+?)\].*device (\d+):.*\[(.+?)\]/g;
      let m;
      while ((m = re.exec(output)) !== null) {
        const id = `hw:${m[1]},${m[3]}`;
        const name = `${m[2].trim()} — ${m[4].trim()}`;
        devices.push({ id, name });
      }
    } catch {}
    // Also add pulse/default if available
    try {
      execSync('which pactl', { stdio: 'ignore' });
      const sources: string = execSync('pactl list short sources 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
      for (const line of sources.split('\n')) {
        const parts = line.trim().split('\t');
        if (parts.length >= 2 && !parts[1].includes('.monitor')) {
          devices.push({ id: `pulse:${parts[1]}`, name: `PulseAudio: ${parts[1]}` });
        }
      }
    } catch {}
    return devices;
  }

  private static listMacDevices(): AudioDevice[] {
    const { execSync } = require('child_process');
    const devices: AudioDevice[] = [];
    try {
      // Use system_profiler for audio inputs
      const output: string = execSync(
        'system_profiler SPAudioDataType -json 2>/dev/null',
        { encoding: 'utf-8', timeout: 10000 },
      );
      const data = JSON.parse(output);
      const items = data?.SPAudioDataType ?? [];
      for (const item of items) {
        const inputs = item?._items?.filter((i: any) =>
          i?.coreaudio_input_source || i?.coreaudio_device_input,
        ) ?? [];
        for (const inp of inputs) {
          const name = inp._name ?? 'Unknown';
          devices.push({ id: name, name });
        }
      }
    } catch {}
    // Fallback: try sox --help-device
    if (devices.length === 0) {
      try {
        const output: string = execSync('sox --help 2>&1 | head -5', { encoding: 'utf-8', timeout: 5000 });
        // Can't reliably enumerate from sox, just offer default
      } catch {}
    }
    return devices;
  }

  private static listWindowsDevices(): AudioDevice[] {
    const { execSync } = require('child_process');
    const devices: AudioDevice[] = [];
    try {
      const output: string = execSync(
        'ffmpeg -list_devices true -f dshow -i dummy 2>&1',
        { encoding: 'utf-8', timeout: 10000 },
      );
      let inAudio = false;
      for (const line of output.split('\n')) {
        if (line.includes('DirectShow audio devices')) { inAudio = true; continue; }
        if (line.includes('DirectShow video devices')) { inAudio = false; continue; }
        if (inAudio) {
          const m = line.match(/\]\s+"(.+?)"/);
          if (m && !m[1].includes('Alternative name')) {
            devices.push({ id: m[1], name: m[1] });
          }
        }
      }
    } catch {}
    return devices;
  }

  private getCaptureCommand(): { bin: string; args: string[]; env?: Record<string, string> } | null {
    // Raw PCM s16le mono 16kHz output
    const platform = process.platform;

    if (platform === 'linux') {
      const args = ['-f', 'S16_LE', '-r', '16000', '-c', '1', '-t', 'raw', '-q'];
      if (this.deviceId) {
        if (this.deviceId.startsWith('pulse:')) {
          // PulseAudio source — use arecord with pulse plugin
          args.push('-D', `pulse`);
          return { bin: 'arecord', args: [...args, '-'], env: { PULSE_SOURCE: this.deviceId.replace('pulse:', '') } };
        }
        args.push('-D', this.deviceId);
      }
      args.push('-');
      return { bin: 'arecord', args };
    }

    if (platform === 'darwin') {
      const env: Record<string, string> = {};
      if (this.deviceId) {
        env['AUDIODEV'] = this.deviceId;
      }
      return {
        bin: 'sox',
        args: ['-d', '-t', 'raw', '-r', '16000', '-b', '16', '-c', '1', '-e', 'signed-integer', '-'],
        env,
      };
    }

    if (platform === 'win32') {
      const device = this.deviceId || 'default';
      return {
        bin: 'ffmpeg',
        args: [
          '-f', 'dshow', '-i', `audio=${device}`,
          '-ar', '16000', '-ac', '1', '-f', 's16le', '-acodec', 'pcm_s16le',
          'pipe:1',
        ],
      };
    }

    return null;
  }
}
