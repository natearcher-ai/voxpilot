import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { execSync } from 'child_process';

const MODEL_REGISTRY: Record<string, ModelInfo> = {
  'moonshine-tiny': {
    name: 'Moonshine Tiny',
    size: '~27MB',
    files: [
      'onnx/encoder_model.onnx',
      'onnx/decoder_model_merged.onnx',
      'config.json',
      'generation_config.json',
      'tokenizer.json',
    ],
    repo: 'onnx-community/moonshine-tiny-ONNX',
  },
  'moonshine-base': {
    name: 'Moonshine Base',
    size: '~65MB',
    files: [
      'onnx/encoder_model.onnx',
      'onnx/decoder_model_merged.onnx',
      'config.json',
      'generation_config.json',
      'tokenizer.json',
    ],
    repo: 'onnx-community/moonshine-base-ONNX',
  },
};

interface ModelInfo {
  name: string;
  size: string;
  files: string[];
  repo: string;
}

export class ModelManager {
  private modelsDir: string;

  constructor(private context: vscode.ExtensionContext) {
    this.modelsDir = path.join(context.globalStorageUri.fsPath, 'models');
  }

  getModelPath(modelId: string): string {
    return path.join(this.modelsDir, modelId);
  }

  isModelDownloaded(modelId: string): boolean {
    const info = MODEL_REGISTRY[modelId];
    if (!info) { return false; }
    const dir = this.getModelPath(modelId);
    return info.files.every(f => fs.existsSync(path.join(dir, f)));
  }

  async ensureModel(modelId: string): Promise<string> {
    if (this.isModelDownloaded(modelId)) {
      return this.getModelPath(modelId);
    }
    return this.downloadModel(modelId);
  }

  async downloadModel(modelId: string): Promise<string> {
    const info = MODEL_REGISTRY[modelId];
    if (!info) { throw new Error(`Unknown model: ${modelId}`); }

    const dir = this.getModelPath(modelId);
    fs.mkdirSync(path.join(dir, 'onnx'), { recursive: true });

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `VoxPilot: Downloading ${info.name} (${info.size})`,
        cancellable: true,
      },
      async (progress, token) => {
        for (let i = 0; i < info.files.length; i++) {
          if (token.isCancellationRequested) { throw new Error('Download cancelled'); }
          const file = info.files[i];
          const fileName = path.basename(file);
          progress.report({ message: `${fileName} (${i + 1}/${info.files.length})`, increment: (100 / info.files.length) });
          const url = `https://huggingface.co/${info.repo}/resolve/main/${file}`;
          await this.downloadFile(url, path.join(dir, file));
        }
      },
    );

    return dir;
  }

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const dir = path.dirname(dest);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }

      const file = fs.createWriteStream(dest);
      const get = url.startsWith('https') ? https.get : http.get;
      get(url, (res) => {
        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
          file.close();
          this.downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(dest); } catch {}
          reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', (err) => {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        reject(err);
      });
    });
  }

  getAvailableModels(): Array<{ id: string; info: ModelInfo; downloaded: boolean }> {
    return Object.entries(MODEL_REGISTRY).map(([id, info]) => ({
      id,
      info,
      downloaded: this.isModelDownloaded(id),
    }));
  }

  /**
   * Check if an audio capture binary is available on this platform.
   */
  static checkAudioTool(): { available: boolean; tool: string; installHint: string } {
    const platform = process.platform;
    const checks: Array<{ bin: string; hint: string }> = [];

    if (platform === 'linux') {
      checks.push({ bin: 'arecord', hint: 'sudo apt install alsa-utils' });
      checks.push({ bin: 'ffmpeg', hint: 'sudo apt install ffmpeg' });
    } else if (platform === 'darwin') {
      checks.push({ bin: 'sox', hint: 'brew install sox' });
      checks.push({ bin: 'ffmpeg', hint: 'brew install ffmpeg' });
    } else if (platform === 'win32') {
      checks.push({ bin: 'ffmpeg', hint: 'Download from ffmpeg.org and add to PATH' });
    }

    for (const { bin, hint } of checks) {
      try {
        execSync(`which ${bin}`, { stdio: 'ignore' });
        return { available: true, tool: bin, installHint: '' };
      } catch {}
    }

    const hint = checks.map(c => `${c.bin} (${c.hint})`).join(' or ');
    return { available: false, tool: '', installHint: hint };
  }
}
