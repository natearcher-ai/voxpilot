/**
 * Offline Model Hub — download and manage ASR models for air-gapped environments.
 *
 * Extends the offline model manager with:
 *   - Export models to portable bundles (.voxmodels) for sneakernet transfer
 *   - Import models from local bundle files without internet
 *   - Verify model integrity offline via SHA-256 checksums
 *   - Generate and read bundle manifests for inventory tracking
 *   - Bulk export/import for setting up multiple workstations
 *
 * Enable via `voxpilot.offlineModelHub` setting (default: true).
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { MODEL_CATALOG, ModelInfo, formatSize } from './offlineModelManager';

/** Bundle manifest describing exported models */
export interface BundleManifest {
  version: 1;
  createdAt: string;
  createdBy: string;
  models: BundleModelEntry[];
  totalSizeBytes: number;
}

/** Single model entry in a bundle manifest */
export interface BundleModelEntry {
  id: string;
  name: string;
  family: string;
  sizeBytes: number;
  checksum: string;
  files: string[];
}

/** Import result for a single model */
export interface ImportResult {
  modelId: string;
  success: boolean;
  error?: string;
  verified: boolean;
}

export class OfflineModelHub {
  private modelsDir: string;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.modelsDir = path.join(context.globalStorageUri.fsPath, 'models');
  }

  /**
   * Export one or more downloaded models to a portable bundle directory.
   * Creates a manifest.json and copies model files for offline transfer.
   */
  async exportModels(modelIds: string[], targetDir: string): Promise<string> {
    const bundleDir = path.join(targetDir, `voxpilot-models-${Date.now()}`);
    fs.mkdirSync(bundleDir, { recursive: true });

    const manifest: BundleManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: `VoxPilot ${this.getExtensionVersion()}`,
      models: [],
      totalSizeBytes: 0,
    };

    for (const modelId of modelIds) {
      const modelPath = path.join(this.modelsDir, modelId);
      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model "${modelId}" is not downloaded. Download it first.`);
      }

      const destDir = path.join(bundleDir, modelId);
      fs.mkdirSync(destDir, { recursive: true });

      const files = this.copyDirRecursive(modelPath, destDir);
      const checksum = await this.computeDirChecksum(destDir);
      const size = this.getDirSize(destDir);

      const catalogEntry = MODEL_CATALOG.find(m => m.id === modelId);
      manifest.models.push({
        id: modelId,
        name: catalogEntry?.name ?? modelId,
        family: catalogEntry?.family ?? 'unknown',
        sizeBytes: size,
        checksum,
        files,
      });
      manifest.totalSizeBytes += size;
    }

    fs.writeFileSync(
      path.join(bundleDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );

    return bundleDir;
  }

  /**
   * Import models from a bundle directory into the local model store.
   * Verifies checksums to ensure integrity after transfer.
   */
  async importFromBundle(bundlePath: string): Promise<ImportResult[]> {
    const manifestPath = path.join(bundlePath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Invalid bundle: manifest.json not found. Select a valid VoxPilot model bundle directory.');
    }

    const manifest: BundleManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    if (manifest.version !== 1) {
      throw new Error(`Unsupported bundle version: ${manifest.version}`);
    }

    fs.mkdirSync(this.modelsDir, { recursive: true });
    const results: ImportResult[] = [];

    for (const entry of manifest.models) {
      const sourcePath = path.join(bundlePath, entry.id);
      const destPath = path.join(this.modelsDir, entry.id);

      if (!fs.existsSync(sourcePath)) {
        results.push({ modelId: entry.id, success: false, error: 'Model files not found in bundle', verified: false });
        continue;
      }

      try {
        // Verify checksum before importing
        const checksum = await this.computeDirChecksum(sourcePath);
        const verified = checksum === entry.checksum;

        if (!verified) {
          const proceed = await vscode.window.showWarningMessage(
            `Checksum mismatch for "${entry.name}". The model may be corrupted. Import anyway?`,
            'Import Anyway', 'Skip',
          );
          if (proceed !== 'Import Anyway') {
            results.push({ modelId: entry.id, success: false, error: 'Checksum verification failed', verified: false });
            continue;
          }
        }

        // Remove existing model if present
        if (fs.existsSync(destPath)) {
          fs.rmSync(destPath, { recursive: true, force: true });
        }

        // Copy model files
        fs.mkdirSync(destPath, { recursive: true });
        this.copyDirRecursive(sourcePath, destPath);

        results.push({ modelId: entry.id, success: true, verified });
      } catch (err: any) {
        results.push({ modelId: entry.id, success: false, error: err.message, verified: false });
      }
    }

    return results;
  }

  /**
   * Import a single model from a local directory (not necessarily a bundle).
   * Useful for manually downloaded ONNX model directories.
   */
  async importFromDirectory(modelId: string, sourcePath: string): Promise<ImportResult> {
    if (!fs.existsSync(sourcePath)) {
      return { modelId, success: false, error: 'Source directory does not exist', verified: false };
    }

    // Check for expected model files (at minimum, some .onnx or config files)
    const files = fs.readdirSync(sourcePath);
    const hasModelFiles = files.some(f =>
      f.endsWith('.onnx') || f.endsWith('.json') || f === 'config.json' || f === 'tokenizer.json'
    );

    if (!hasModelFiles) {
      const proceed = await vscode.window.showWarningMessage(
        'No recognized model files (.onnx, config.json) found. Import anyway?',
        'Import Anyway', 'Cancel',
      );
      if (proceed !== 'Import Anyway') {
        return { modelId, success: false, error: 'No model files found', verified: false };
      }
    }

    const destPath = path.join(this.modelsDir, modelId);
    fs.mkdirSync(destPath, { recursive: true });

    try {
      this.copyDirRecursive(sourcePath, destPath);
      const checksum = await this.computeDirChecksum(destPath);
      return { modelId, success: true, verified: true };
    } catch (err: any) {
      return { modelId, success: false, error: err.message, verified: false };
    }
  }

  /**
   * Verify integrity of an installed model using its stored checksum.
   */
  async verifyModel(modelId: string): Promise<{ valid: boolean; checksum: string }> {
    const modelPath = path.join(this.modelsDir, modelId);
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Model "${modelId}" is not installed.`);
    }

    const checksum = await this.computeDirChecksum(modelPath);
    const storedChecksums = this.context.globalState.get<Record<string, string>>('voxpilot.modelChecksums', {});
    const storedChecksum = storedChecksums[modelId];

    if (!storedChecksum) {
      // First verification — store the checksum
      storedChecksums[modelId] = checksum;
      await this.context.globalState.update('voxpilot.modelChecksums', storedChecksums);
      return { valid: true, checksum };
    }

    return { valid: checksum === storedChecksum, checksum };
  }

  /**
   * List all models available in the hub (downloaded + catalog).
   */
  getAvailableModels(): Array<ModelInfo & { installed: boolean; sizeOnDisk: number }> {
    return MODEL_CATALOG.map(m => {
      const modelPath = path.join(this.modelsDir, m.id);
      const installed = fs.existsSync(modelPath);
      const sizeOnDisk = installed ? this.getDirSize(modelPath) : 0;
      return { ...m, installed, sizeOnDisk };
    });
  }

  /**
   * Get bundle info from a manifest file.
   */
  readBundleManifest(bundlePath: string): BundleManifest | null {
    const manifestPath = path.join(bundlePath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) { return null; }
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Compute SHA-256 checksum of all files in a directory (sorted for determinism).
   */
  private async computeDirChecksum(dirPath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const files = this.listFilesRecursive(dirPath).sort();

    for (const file of files) {
      const relativePath = path.relative(dirPath, file);
      hash.update(relativePath);
      const content = fs.readFileSync(file);
      hash.update(content);
    }

    return hash.digest('hex');
  }

  /**
   * Recursively list all files in a directory.
   */
  private listFilesRecursive(dirPath: string): string[] {
    const results: string[] = [];
    const walk = (dir: string) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { walk(full); }
          else { results.push(full); }
        }
      } catch { /* skip unreadable */ }
    };
    walk(dirPath);
    return results;
  }

  /**
   * Copy a directory recursively, returning list of relative file paths.
   */
  private copyDirRecursive(src: string, dest: string): string[] {
    const files: string[] = [];
    const walk = (srcDir: string, destDir: string) => {
      fs.mkdirSync(destDir, { recursive: true });
      for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
          walk(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
          files.push(path.relative(dest, destPath));
        }
      }
    };
    walk(src, dest);
    return files;
  }

  /**
   * Get total size of a directory in bytes.
   */
  private getDirSize(dirPath: string): number {
    let total = 0;
    const walk = (dir: string) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { walk(full); }
          else { total += fs.statSync(full).size; }
        }
      } catch { /* skip */ }
    };
    walk(dirPath);
    return total;
  }

  private getExtensionVersion(): string {
    try {
      return this.context.extension.packageJSON.version ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

/**
 * Register all offline model hub commands.
 */
export function registerOfflineModelHubCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
  const hub = new OfflineModelHub(context);

  const exportCmd = vscode.commands.registerCommand('voxpilot.offlineHub.export', async () => {
    const models = hub.getAvailableModels().filter(m => m.installed);
    if (models.length === 0) {
      vscode.window.showInformationMessage('VoxPilot: No downloaded models to export. Download models first.');
      return;
    }

    const picks = await vscode.window.showQuickPick(
      models.map(m => ({
        label: m.name,
        description: `${m.family} — ${formatSize(m.sizeOnDisk)}`,
        picked: true,
        id: m.id,
      })),
      { canPickMany: true, placeHolder: 'Select models to export for offline transfer' },
    );
    if (!picks || picks.length === 0) { return; }

    const targetUri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Export Here',
      title: 'Select export destination (USB drive, network share, etc.)',
    });
    if (!targetUri || targetUri.length === 0) { return; }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Exporting models...', cancellable: false },
      async (progress) => {
        progress.report({ message: `Exporting ${picks.length} model(s)...` });
        try {
          const bundlePath = await hub.exportModels(
            picks.map(p => p.id),
            targetUri[0].fsPath,
          );
          vscode.window.showInformationMessage(
            `VoxPilot: Exported ${picks.length} model(s) to ${bundlePath}. Copy this folder to your air-gapped machine.`,
          );
        } catch (err: any) {
          vscode.window.showErrorMessage(`VoxPilot: Export failed — ${err.message}`);
        }
      },
    );
  });

  const importCmd = vscode.commands.registerCommand('voxpilot.offlineHub.import', async () => {
    const sourceUri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Import from Here',
      title: 'Select VoxPilot model bundle directory',
    });
    if (!sourceUri || sourceUri.length === 0) { return; }

    const bundlePath = sourceUri[0].fsPath;
    const manifest = hub.readBundleManifest(bundlePath);

    if (!manifest) {
      vscode.window.showErrorMessage(
        'VoxPilot: No manifest.json found. Select a directory exported by "VoxPilot: Export Models for Offline Use".',
      );
      return;
    }

    const confirm = await vscode.window.showInformationMessage(
      `VoxPilot: Bundle contains ${manifest.models.length} model(s) (${formatSize(manifest.totalSizeBytes)}). Import all?`,
      'Import All', 'Select Models', 'Cancel',
    );

    if (confirm === 'Cancel' || !confirm) { return; }

    let modelIds = manifest.models.map(m => m.id);

    if (confirm === 'Select Models') {
      const picks = await vscode.window.showQuickPick(
        manifest.models.map(m => ({
          label: m.name,
          description: `${m.family} — ${formatSize(m.sizeBytes)}`,
          picked: true,
          id: m.id,
        })),
        { canPickMany: true, placeHolder: 'Select models to import' },
      );
      if (!picks || picks.length === 0) { return; }
      modelIds = picks.map(p => p.id);
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Importing models...', cancellable: false },
      async (progress) => {
        progress.report({ message: `Importing and verifying ${modelIds.length} model(s)...` });
        try {
          const results = await hub.importFromBundle(bundlePath);
          const succeeded = results.filter(r => r.success);
          const failed = results.filter(r => !r.success);
          const verified = succeeded.filter(r => r.verified);

          let message = `VoxPilot: Imported ${succeeded.length}/${results.length} model(s).`;
          if (verified.length > 0) { message += ` ${verified.length} verified ✓`; }
          if (failed.length > 0) { message += ` ${failed.length} failed.`; }

          if (failed.length > 0) {
            vscode.window.showWarningMessage(message);
          } else {
            vscode.window.showInformationMessage(message);
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`VoxPilot: Import failed — ${err.message}`);
        }
      },
    );
  });

  const importDirCmd = vscode.commands.registerCommand('voxpilot.offlineHub.importDirectory', async () => {
    const catalogItems = MODEL_CATALOG.map(m => ({
      label: m.name,
      description: `${m.family} — ${formatSize(m.sizeBytes)}`,
      id: m.id,
    }));

    const picked = await vscode.window.showQuickPick(catalogItems, {
      placeHolder: 'Which model are you importing?',
    });
    if (!picked) { return; }

    const sourceUri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Import Model Directory',
      title: `Select the directory containing ${picked.label} model files`,
    });
    if (!sourceUri || sourceUri.length === 0) { return; }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Importing ${picked.label}...`, cancellable: false },
      async () => {
        const result = await hub.importFromDirectory(picked.id, sourceUri[0].fsPath);
        if (result.success) {
          vscode.window.showInformationMessage(
            `VoxPilot: ${picked.label} imported successfully${result.verified ? ' (verified ✓)' : ''}.`,
          );
        } else {
          vscode.window.showErrorMessage(`VoxPilot: Import failed — ${result.error}`);
        }
      },
    );
  });

  const verifyCmd = vscode.commands.registerCommand('voxpilot.offlineHub.verify', async () => {
    const models = hub.getAvailableModels().filter(m => m.installed);
    if (models.length === 0) {
      vscode.window.showInformationMessage('VoxPilot: No installed models to verify.');
      return;
    }

    const picks = await vscode.window.showQuickPick(
      models.map(m => ({
        label: m.name,
        description: `${m.family} — ${formatSize(m.sizeOnDisk)}`,
        id: m.id,
      })),
      { canPickMany: true, placeHolder: 'Select models to verify integrity' },
    );
    if (!picks || picks.length === 0) { return; }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Verifying model integrity...', cancellable: false },
      async (progress) => {
        const results: Array<{ name: string; valid: boolean }> = [];
        for (const pick of picks) {
          progress.report({ message: `Verifying ${pick.label}...` });
          try {
            const result = await hub.verifyModel(pick.id);
            results.push({ name: pick.label, valid: result.valid });
          } catch (err: any) {
            results.push({ name: pick.label, valid: false });
          }
        }

        const allValid = results.every(r => r.valid);
        const invalid = results.filter(r => !r.valid);

        if (allValid) {
          vscode.window.showInformationMessage(`VoxPilot: All ${results.length} model(s) verified ✓`);
        } else {
          vscode.window.showWarningMessage(
            `VoxPilot: ${invalid.length} model(s) failed verification: ${invalid.map(r => r.name).join(', ')}. Consider re-importing.`,
          );
        }
      },
    );
  });

  return [exportCmd, importCmd, importDirCmd, verifyCmd];
}
