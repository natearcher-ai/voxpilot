/**
 * Offline Model Manager Panel — webview UI for downloading, caching,
 * and switching between ASR models with progress and disk usage tracking.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ModelManager } from './modelManager';
import {
  MODEL_CATALOG,
  ModelInfo,
  DownloadedModel,
  formatSize,
  formatSpeed,
  totalDiskUsage,
  findUnusedModels,
  getRecommendedModel,
  compareModels,
} from './offlineModelManager';

interface PanelState {
  models: Array<ModelInfo & { downloaded: boolean; diskSize: number; active: boolean; lastUsed?: string }>;
  totalDiskUsage: string;
  downloading: string | null;
  downloadProgress: number;
  downloadSpeed: string;
  downloadEta: string;
}

export class OfflineModelManagerPanel {
  private static instance: OfflineModelManagerPanel | undefined;
  private panel: vscode.WebviewPanel;
  private modelManager: ModelManager;
  private modelsDir: string;
  private downloading: string | null = null;
  private downloadCancellation: vscode.CancellationTokenSource | null = null;

  private constructor(private context: vscode.ExtensionContext) {
    this.modelManager = new ModelManager(context);
    this.modelsDir = path.join(context.globalStorageUri.fsPath, 'models');

    this.panel = vscode.window.createWebviewPanel(
      'voxpilot.offlineModelManager',
      'VoxPilot: Model Manager',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.iconPath = new vscode.ThemeIcon('database');
    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'download':
          await this.downloadModel(msg.modelId);
          break;
        case 'switch':
          await this.switchModel(msg.modelId);
          break;
        case 'delete':
          await this.deleteModel(msg.modelId);
          break;
        case 'cancelDownload':
          this.cancelDownload();
          break;
        case 'refresh':
          this.sendState();
          break;
      }
    });

    this.panel.onDidDispose(() => {
      OfflineModelManagerPanel.instance = undefined;
      this.cancelDownload();
    });

    this.sendState();
  }

  static create(context: vscode.ExtensionContext): OfflineModelManagerPanel {
    if (OfflineModelManagerPanel.instance) {
      OfflineModelManagerPanel.instance.panel.reveal();
      return OfflineModelManagerPanel.instance;
    }
    OfflineModelManagerPanel.instance = new OfflineModelManagerPanel(context);
    return OfflineModelManagerPanel.instance;
  }

  show(): void {
    this.panel.reveal();
  }

  private getModelDiskSize(modelId: string): number {
    const modelPath = path.join(this.modelsDir, modelId);
    if (!fs.existsSync(modelPath)) { return 0; }
    let total = 0;
    const walk = (dir: string) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { walk(full); }
          else { total += fs.statSync(full).size; }
        }
      } catch {}
    };
    walk(modelPath);
    return total;
  }

  private getState(): PanelState {
    const config = vscode.workspace.getConfiguration('voxpilot');
    const activeModel = config.get<string>('model', 'moonshine-base');

    const models = MODEL_CATALOG.map(m => {
      const downloaded = this.modelManager.isModelDownloaded(m.id);
      const diskSize = downloaded ? this.getModelDiskSize(m.id) : 0;
      return {
        ...m,
        downloaded,
        diskSize,
        active: m.id === activeModel,
      };
    });

    const downloadedModels = models.filter(m => m.downloaded);
    const totalUsage = downloadedModels.reduce((sum, m) => sum + m.diskSize, 0);

    return {
      models,
      totalDiskUsage: formatSize(totalUsage),
      downloading: this.downloading,
      downloadProgress: 0,
      downloadSpeed: '',
      downloadEta: '',
    };
  }

  private sendState(): void {
    this.panel.webview.postMessage({ type: 'state', data: this.getState() });
  }

  private async downloadModel(modelId: string): Promise<void> {
    if (this.downloading) { return; }
    this.downloading = modelId;
    this.sendState();

    try {
      await this.modelManager.downloadModel(modelId);
      vscode.window.showInformationMessage(`VoxPilot: ${modelId} downloaded successfully.`);
    } catch (err: any) {
      if (err.message !== 'Download cancelled') {
        vscode.window.showErrorMessage(`VoxPilot: Download failed — ${err.message}`);
      }
    } finally {
      this.downloading = null;
      this.sendState();
    }
  }

  private async switchModel(modelId: string): Promise<void> {
    if (!this.modelManager.isModelDownloaded(modelId)) {
      const pick = await vscode.window.showInformationMessage(
        `Model not downloaded yet. Download and switch?`,
        'Download & Switch', 'Cancel',
      );
      if (pick !== 'Download & Switch') { return; }
      await this.downloadModel(modelId);
      if (!this.modelManager.isModelDownloaded(modelId)) { return; }
    }
    await vscode.workspace.getConfiguration('voxpilot').update('model', modelId, true);
    vscode.window.showInformationMessage(`VoxPilot: Switched to ${modelId}`);
    this.sendState();
  }

  private async deleteModel(modelId: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (config.get<string>('model', 'moonshine-base') === modelId) {
      vscode.window.showWarningMessage('VoxPilot: Cannot delete the active model. Switch first.');
      return;
    }
    if (!this.modelManager.isModelDownloaded(modelId)) { return; }

    const confirm = await vscode.window.showWarningMessage(
      `Delete ${modelId}? This frees disk space but you'll need to re-download to use it.`,
      { modal: true },
      'Delete',
    );
    if (confirm !== 'Delete') { return; }

    const modelPath = path.join(this.modelsDir, modelId);
    try {
      fs.rmSync(modelPath, { recursive: true, force: true });
      vscode.window.showInformationMessage(`VoxPilot: ${modelId} deleted.`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`VoxPilot: Failed to delete — ${err.message}`);
    }
    this.sendState();
  }

  private cancelDownload(): void {
    if (this.downloadCancellation) {
      this.downloadCancellation.cancel();
      this.downloadCancellation.dispose();
      this.downloadCancellation = null;
    }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VoxPilot Model Manager</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --danger: var(--vscode-errorForeground);
      --success: var(--vscode-charts-green, #4ec9b0);
      --muted: var(--vscode-descriptionForeground);
    }
    body { font-family: var(--vscode-font-family); color: var(--fg); padding: 16px; margin: 0; }
    h1 { font-size: 1.4em; margin: 0 0 4px 0; display: flex; align-items: center; gap: 8px; }
    .subtitle { color: var(--muted); font-size: 0.85em; margin-bottom: 16px; }
    .disk-bar { background: var(--border); border-radius: 4px; padding: 10px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
    .disk-bar .label { font-weight: 600; }
    .disk-bar .value { color: var(--success); font-weight: 600; }
    .model-grid { display: grid; gap: 12px; }
    .model-card { border: 1px solid var(--border); border-radius: 6px; padding: 14px; position: relative; }
    .model-card.active { border-color: var(--success); }
    .model-card .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .model-card .name { font-weight: 600; font-size: 1em; }
    .model-card .badge { font-size: 0.7em; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; font-weight: 600; }
    .badge-active { background: var(--success); color: #000; }
    .badge-downloaded { background: var(--border); color: var(--fg); }
    .badge-recommended { background: var(--btn-bg); color: var(--btn-fg); }
    .model-card .desc { color: var(--muted); font-size: 0.85em; margin-bottom: 8px; }
    .model-card .stats { display: flex; gap: 16px; font-size: 0.8em; color: var(--muted); margin-bottom: 10px; }
    .model-card .stats span { display: flex; align-items: center; gap: 4px; }
    .meter { display: inline-flex; gap: 2px; }
    .meter .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--border); }
    .meter .dot.filled { background: var(--success); }
    .actions { display: flex; gap: 8px; }
    .btn { padding: 4px 12px; border: none; border-radius: 3px; cursor: pointer; font-size: 0.8em; font-family: inherit; }
    .btn-primary { background: var(--btn-bg); color: var(--btn-fg); }
    .btn-primary:hover { background: var(--btn-hover); }
    .btn-danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
    .btn-danger:hover { background: var(--danger); color: #fff; }
    .btn-secondary { background: transparent; color: var(--fg); border: 1px solid var(--border); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .progress-bar { width: 100%; height: 4px; background: var(--border); border-radius: 2px; margin-top: 8px; overflow: hidden; }
    .progress-bar .fill { height: 100%; background: var(--btn-bg); transition: width 0.3s; }
    .downloading-label { font-size: 0.75em; color: var(--muted); margin-top: 4px; }
    .family-tag { font-size: 0.7em; padding: 1px 5px; border-radius: 3px; background: var(--border); margin-left: 6px; }
  </style>
</head>
<body>
  <h1>📦 Offline Model Manager</h1>
  <p class="subtitle">Download, cache, and switch between ASR models. All models run locally — no internet needed after download.</p>
  <div class="disk-bar">
    <span class="label">💾 Total disk usage</span>
    <span class="value" id="disk-usage">—</span>
  </div>
  <div class="model-grid" id="model-grid"></div>

  <script>
    const vscode = acquireVsCodeApi();

    function renderMeter(value, max) {
      let html = '<span class="meter">';
      for (let i = 1; i <= max; i++) {
        html += '<span class="dot ' + (i <= value ? 'filled' : '') + '"></span>';
      }
      html += '</span>';
      return html;
    }

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    function render(state) {
      document.getElementById('disk-usage').textContent = state.totalDiskUsage;
      const grid = document.getElementById('model-grid');
      grid.innerHTML = state.models.map(m => {
        const badges = [];
        if (m.active) badges.push('<span class="badge badge-active">Active</span>');
        else if (m.downloaded) badges.push('<span class="badge badge-downloaded">Downloaded</span>');
        if (m.recommended) badges.push('<span class="badge badge-recommended">Recommended</span>');

        const isDownloading = state.downloading === m.id;
        let actionsHtml = '';
        if (isDownloading) {
          actionsHtml = '<button class="btn btn-danger" onclick="cancelDownload()">Cancel</button>' +
            '<div class="progress-bar"><div class="fill" style="width:' + state.downloadProgress + '%"></div></div>' +
            '<div class="downloading-label">Downloading...</div>';
        } else if (m.active) {
          actionsHtml = '<button class="btn btn-secondary" disabled>Current model</button>';
        } else if (m.downloaded) {
          actionsHtml = '<button class="btn btn-primary" onclick="switchModel(\\''+m.id+'\\')">Switch to this</button>' +
            '<button class="btn btn-danger" onclick="deleteModel(\\''+m.id+'\\')">Delete</button>';
        } else {
          actionsHtml = '<button class="btn btn-primary" onclick="downloadModel(\\''+m.id+'\\')">Download (' + formatSize(m.sizeBytes) + ')</button>';
        }

        const langs = m.languages.length > 0 ? m.languages[0] : 'English only';

        return '<div class="model-card ' + (m.active ? 'active' : '') + '">' +
          '<div class="header"><span class="name">' + m.name + '<span class="family-tag">' + m.family + '</span></span><span>' + badges.join(' ') + '</span></div>' +
          '<div class="desc">' + m.description + '</div>' +
          '<div class="stats">' +
            '<span>Accuracy: ' + renderMeter(m.accuracy, 10) + '</span>' +
            '<span>Speed: ' + renderMeter(m.speed, 10) + '</span>' +
            '<span>🌐 ' + langs + '</span>' +
            (m.downloaded ? '<span>💾 ' + formatSize(m.diskSize) + '</span>' : '') +
          '</div>' +
          '<div class="actions">' + actionsHtml + '</div>' +
        '</div>';
      }).join('');
    }

    function downloadModel(id) { vscode.postMessage({ command: 'download', modelId: id }); }
    function switchModel(id) { vscode.postMessage({ command: 'switch', modelId: id }); }
    function deleteModel(id) { vscode.postMessage({ command: 'delete', modelId: id }); }
    function cancelDownload() { vscode.postMessage({ command: 'cancelDownload' }); }

    window.addEventListener('message', e => {
      if (e.data.type === 'state') render(e.data.data);
    });

    // Request initial state
    vscode.postMessage({ command: 'refresh' });
  </script>
</body>
</html>`;
  }
}
