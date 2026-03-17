import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ModelManager } from './modelManager';

export class ModelManagerPanel implements vscode.TreeDataProvider<ModelTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ModelTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private modelManager: ModelManager;
  private downloading = new Set<string>();

  constructor(private context: vscode.ExtensionContext) {
    this.modelManager = new ModelManager(context);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ModelTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ModelTreeItem): ModelTreeItem[] {
    if (element) { return []; }

    const config = vscode.workspace.getConfiguration('voxpilot');
    const activeModel = config.get<string>('model', 'moonshine-base');
    const models = this.modelManager.getAvailableModels();

    return models.map(m => {
      const isActive = m.id === activeModel;
      const isDownloading = this.downloading.has(m.id);
      return new ModelTreeItem(m.id, m.info.name, m.info.size, m.downloaded, isActive, isDownloading);
    });
  }

  async downloadModel(item: ModelTreeItem): Promise<void> {
    if (this.downloading.has(item.modelId)) { return; }
    this.downloading.add(item.modelId);
    this.refresh();

    try {
      await this.modelManager.downloadModel(item.modelId);
      vscode.window.showInformationMessage(`VoxPilot: ${item.modelName} downloaded.`);
    } catch (err: any) {
      if (err.message !== 'Download cancelled') {
        vscode.window.showErrorMessage(`VoxPilot: Download failed — ${err.message}`);
      }
    } finally {
      this.downloading.delete(item.modelId);
      this.refresh();
    }
  }

  async switchModel(item: ModelTreeItem): Promise<void> {
    if (!this.modelManager.isModelDownloaded(item.modelId)) {
      const pick = await vscode.window.showInformationMessage(
        `${item.modelName} isn't downloaded yet (${item.modelSize}). Download and switch?`,
        'Download & Switch', 'Cancel',
      );
      if (pick !== 'Download & Switch') { return; }
      await this.downloadModel(item);
      if (!this.modelManager.isModelDownloaded(item.modelId)) { return; }
    }
    await vscode.workspace.getConfiguration('voxpilot').update('model', item.modelId, true);
    vscode.window.showInformationMessage(`VoxPilot: Switched to ${item.modelName}`);
    this.refresh();
  }

  async deleteModel(item: ModelTreeItem): Promise<void> {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (config.get<string>('model', 'moonshine-base') === item.modelId) {
      vscode.window.showWarningMessage('VoxPilot: Cannot delete the active model. Switch to another model first.');
      return;
    }
    if (!this.modelManager.isModelDownloaded(item.modelId)) { return; }

    const confirm = await vscode.window.showWarningMessage(
      `Delete ${item.modelName} (${item.modelSize})?`, { modal: true }, 'Delete',
    );
    if (confirm !== 'Delete') { return; }

    const modelPath = this.modelManager.getModelPath(item.modelId);
    try {
      fs.rmSync(modelPath, { recursive: true, force: true });
      vscode.window.showInformationMessage(`VoxPilot: ${item.modelName} deleted.`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`VoxPilot: Failed to delete — ${err.message}`);
    }
    this.refresh();
  }

  private getDiskSize(modelId: string): string {
    const modelPath = this.modelManager.getModelPath(modelId);
    if (!fs.existsSync(modelPath)) { return ''; }
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
    if (total > 1024 * 1024 * 1024) { return `${(total / (1024 * 1024 * 1024)).toFixed(1)} GB`; }
    return `${(total / (1024 * 1024)).toFixed(0)} MB`;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

export class ModelTreeItem extends vscode.TreeItem {
  constructor(
    public readonly modelId: string,
    public readonly modelName: string,
    public readonly modelSize: string,
    public readonly downloaded: boolean,
    public readonly active: boolean,
    public readonly isDownloading: boolean,
  ) {
    super(modelName, vscode.TreeItemCollapsibleState.None);

    const status = isDownloading ? 'downloading…' : active ? 'active' : downloaded ? 'downloaded' : 'not downloaded';
    this.description = `${modelSize} — ${status}`;

    if (active) {
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    } else if (isDownloading) {
      this.iconPath = new vscode.ThemeIcon('sync~spin');
    } else if (downloaded) {
      this.iconPath = new vscode.ThemeIcon('circle-filled');
    } else {
      this.iconPath = new vscode.ThemeIcon('cloud-download');
    }

    this.contextValue = active ? 'model-active' : downloaded ? 'model-downloaded' : 'model-available';

    this.tooltip = new vscode.MarkdownString(
      `**${modelName}**\n\nSize: ${modelSize}\nStatus: ${status}\n\n${modelId.startsWith('whisper') ? '90+ languages' : 'English only'}`,
    );
  }
}
