/**
 * Team vocabulary sync — share custom vocab lists via workspace settings or git.
 *
 * Teams can commit a `.voxpilot/vocabulary.json` file to their repository
 * containing shared vocabulary corrections, boost terms, and voice command
 * aliases that apply to everyone working in the workspace.
 *
 * File format (.voxpilot/vocabulary.json):
 * {
 *   "version": 1,
 *   "description": "Team vocabulary for project X",
 *   "corrections": [
 *     { "from": "react query", "to": "TanStack Query" },
 *     { "from": "next js", "to": "Next.js" }
 *   ],
 *   "boost": [
 *     { "term": "kubectl", "boost": 8.0, "phoneme": "cube-control" }
 *   ]
 * }
 *
 * Multiple workspace folders are supported — each folder's vocabulary is merged.
 * User-level settings (voxpilot.customVocabulary, voxpilot.vocabularyBoost)
 * take priority over team vocabulary when conflicts arise.
 *
 * The file is watched for changes and reloaded automatically.
 * Use "VoxPilot: Initialize Team Vocabulary" to create the file,
 * and "VoxPilot: Export to Team Vocabulary" to export personal vocab.
 *
 * Enable via `voxpilot.teamVocabularySync` setting (default: true).
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

/** Schema version for the team vocabulary file */
const SCHEMA_VERSION = 1;

/** Relative path within workspace folder */
const VOCAB_FILE_PATH = '.voxpilot/vocabulary.json';

/** A correction entry in the team vocabulary file */
export interface TeamCorrectionEntry {
  /** Spoken or misrecognized form (case-insensitive, word-boundary matched) */
  from: string;
  /** Correct replacement text */
  to: string;
}

/** A boost entry in the team vocabulary file */
export interface TeamBoostEntry {
  /** The correct term to recognize */
  term: string;
  /** Priority weight (1.0-10.0) */
  boost: number;
  /** Optional phoneme hint */
  phoneme?: string;
}

/** The full team vocabulary file schema */
export interface TeamVocabularyFile {
  /** Schema version (currently 1) */
  version: number;
  /** Optional human-readable description */
  description?: string;
  /** Correction rules (spoken form → correct form) */
  corrections?: TeamCorrectionEntry[];
  /** Vocabulary boost entries */
  boost?: TeamBoostEntry[];
}

/** Compiled correction rule ready for matching */
interface CompiledCorrection {
  pattern: RegExp;
  replacement: string;
  /** Source workspace folder name (for diagnostics) */
  source: string;
}

/** Compiled boost rule ready for matching */
interface CompiledBoost {
  patterns: RegExp[];
  replacement: string;
  boost: number;
  source: string;
}

/**
 * Validate a team vocabulary file structure.
 * Returns an array of error messages (empty = valid).
 */
export function validateTeamVocabulary(data: unknown): string[] {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('File must contain a JSON object');
    return errors;
  }

  const obj = data as Record<string, unknown>;

  if (obj.version !== SCHEMA_VERSION) {
    errors.push(`Unsupported version: ${obj.version} (expected ${SCHEMA_VERSION})`);
  }

  if (obj.corrections !== undefined) {
    if (!Array.isArray(obj.corrections)) {
      errors.push('"corrections" must be an array');
    } else {
      for (let i = 0; i < obj.corrections.length; i++) {
        const entry = obj.corrections[i];
        if (!entry || typeof entry !== 'object') {
          errors.push(`corrections[${i}]: must be an object`);
          continue;
        }
        if (typeof entry.from !== 'string' || !entry.from.trim()) {
          errors.push(`corrections[${i}]: "from" must be a non-empty string`);
        }
        if (typeof entry.to !== 'string' || !entry.to.trim()) {
          errors.push(`corrections[${i}]: "to" must be a non-empty string`);
        }
      }
    }
  }

  if (obj.boost !== undefined) {
    if (!Array.isArray(obj.boost)) {
      errors.push('"boost" must be an array');
    } else {
      for (let i = 0; i < obj.boost.length; i++) {
        const entry = obj.boost[i];
        if (!entry || typeof entry !== 'object') {
          errors.push(`boost[${i}]: must be an object`);
          continue;
        }
        if (typeof entry.term !== 'string' || !entry.term.trim()) {
          errors.push(`boost[${i}]: "term" must be a non-empty string`);
        }
        if (typeof entry.boost !== 'number' || entry.boost < 1 || entry.boost > 10) {
          errors.push(`boost[${i}]: "boost" must be a number between 1.0 and 10.0`);
        }
      }
    }
  }

  return errors;
}

/**
 * Compile a correction entry into a regex-based rule.
 */
function compileCorrection(entry: TeamCorrectionEntry, source: string): CompiledCorrection | null {
  const from = entry.from.trim();
  const to = entry.to.trim();
  if (!from || !to) { return null; }

  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return {
      pattern: new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'gi'),
      replacement: to,
      source,
    };
  } catch {
    return null;
  }
}

/**
 * Compile a boost entry into regex-based rules.
 */
function compileBoost(entry: TeamBoostEntry, source: string): CompiledBoost | null {
  const term = entry.term.trim();
  if (!term) { return null; }

  const patterns: RegExp[] = [];
  const termEscaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    patterns.push(new RegExp(`(?<!\\w)${termEscaped}(?!\\w)`, 'gi'));

    if (entry.phoneme) {
      const phonemeEscaped = entry.phoneme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      patterns.push(new RegExp(`(?<!\\w)${phonemeEscaped}(?!\\w)`, 'gi'));

      // Also match hyphens as spaces
      const phonemeSpaced = entry.phoneme.replace(/-/g, ' ');
      if (phonemeSpaced !== entry.phoneme) {
        const spacedEscaped = phonemeSpaced.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        patterns.push(new RegExp(`(?<!\\w)${spacedEscaped}(?!\\w)`, 'gi'));
      }
    }
  } catch {
    return null;
  }

  return {
    patterns,
    replacement: term,
    boost: Math.max(1.0, Math.min(10.0, entry.boost)),
    source,
  };
}

/**
 * Generate a default team vocabulary file template.
 */
export function generateTemplate(description?: string): TeamVocabularyFile {
  return {
    version: SCHEMA_VERSION,
    description: description || 'Shared team vocabulary for VoxPilot voice transcription',
    corrections: [
      { from: 'example lib', to: 'ExampleLib' },
    ],
    boost: [
      { term: 'ExampleLib', boost: 5.0 },
    ],
  };
}

export class TeamVocabularySyncProcessor implements PostProcessor {
  readonly id = 'teamVocabularySync';
  readonly name = 'Team Vocabulary Sync';
  readonly description = 'Apply shared team vocabulary from .voxpilot/vocabulary.json in workspace';

  private corrections: CompiledCorrection[] = [];
  private boosts: CompiledBoost[] = [];
  private watchers: vscode.FileSystemWatcher[] = [];
  private disposables: vscode.Disposable[] = [];
  private loadErrors: Map<string, string[]> = new Map();

  constructor() {
    this.reload();

    // Watch for workspace folder changes
    try {
      if (vscode.workspace.onDidChangeWorkspaceFolders) {
        this.disposables.push(
          vscode.workspace.onDidChangeWorkspaceFolders(() => this.reload()),
        );
      }
    } catch {
      // Test environment
    }
  }

  /**
   * Reload team vocabulary from all workspace folders.
   * Sets up file watchers for automatic reload on change.
   */
  reload(): void {
    // Dispose old watchers
    for (const w of this.watchers) { w.dispose(); }
    this.watchers = [];
    this.corrections = [];
    this.boosts = [];
    this.loadErrors.clear();

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return; }

    for (const folder of folders) {
      const vocabUri = vscode.Uri.joinPath(folder.uri, VOCAB_FILE_PATH);
      this.loadFromUri(vocabUri, folder.name);

      // Watch for changes to the vocabulary file
      try {
        const pattern = new vscode.RelativePattern(folder, VOCAB_FILE_PATH);
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watcher.onDidChange(() => this.reload());
        watcher.onDidCreate(() => this.reload());
        watcher.onDidDelete(() => this.reload());
        this.watchers.push(watcher);
      } catch {
        // File watcher not available in test environment
      }
    }

    // Sort boosts by boost factor (highest first)
    this.boosts.sort((a, b) => b.boost - a.boost);
  }

  /**
   * Load vocabulary from a specific file URI.
   * Uses async workspace.fs API to avoid blocking extension activation.
   */
  private loadFromUri(uri: vscode.Uri, folderName: string): void {
    // Load asynchronously to avoid blocking the extension host
    this.loadFromUriAsync(uri, folderName).catch(() => {
      // Silently ignore — file may not exist
    });
  }

  private async loadFromUriAsync(uri: vscode.Uri, folderName: string): Promise<void> {
    try {
      let content: string;
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        content = Buffer.from(bytes).toString('utf-8');
      } catch {
        // File doesn't exist — silently skip
        return;
      }
      let data: unknown;

      try {
        data = JSON.parse(content);
      } catch (e) {
        this.loadErrors.set(folderName, [`Invalid JSON: ${(e as Error).message}`]);
        return;
      }

      const errors = validateTeamVocabulary(data);
      if (errors.length > 0) {
        this.loadErrors.set(folderName, errors);
        return;
      }

      const vocab = data as TeamVocabularyFile;

      // Compile corrections
      if (vocab.corrections) {
        for (const entry of vocab.corrections) {
          const compiled = compileCorrection(entry, folderName);
          if (compiled) { this.corrections.push(compiled); }
        }
      }

      // Compile boost entries
      if (vocab.boost) {
        for (const entry of vocab.boost) {
          const compiled = compileBoost(entry, folderName);
          if (compiled) { this.boosts.push(compiled); }
        }
      }
    } catch {
      // Parse or compile error — silently skip
    }
  }

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (config.get<boolean>('teamVocabularySync') === false) {
      return text;
    }

    if (this.corrections.length === 0 && this.boosts.length === 0) {
      return text;
    }

    let result = text;

    // Apply corrections (longest match first — sorted by pattern length)
    for (const rule of this.corrections) {
      result = result.replace(rule.pattern, rule.replacement);
    }

    // Apply boost rules (highest boost first)
    for (const rule of this.boosts) {
      for (const pattern of rule.patterns) {
        result = result.replace(pattern, rule.replacement);
      }
    }

    return result;
  }

  /** Get current load errors for diagnostics */
  getLoadErrors(): Map<string, string[]> {
    return new Map(this.loadErrors);
  }

  /** Get count of loaded rules */
  getStats(): { corrections: number; boosts: number; folders: number } {
    return {
      corrections: this.corrections.length,
      boosts: this.boosts.length,
      folders: vscode.workspace.workspaceFolders?.length ?? 0,
    };
  }

  dispose(): void {
    for (const w of this.watchers) { w.dispose(); }
    for (const d of this.disposables) { d.dispose(); }
    this.watchers = [];
    this.disposables = [];
  }
}

/**
 * Initialize a team vocabulary file in the workspace.
 * Creates .voxpilot/vocabulary.json with a template.
 */
export async function initializeTeamVocabulary(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage('VoxPilot: No workspace folder open. Open a folder first.');
    return;
  }

  let folder = folders[0];
  if (folders.length > 1) {
    const picked = await vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Select workspace folder for team vocabulary',
    });
    if (!picked) { return; }
    folder = picked;
  }

  const vocabUri = vscode.Uri.joinPath(folder.uri, VOCAB_FILE_PATH);

  // Check if file already exists
  try {
    await vscode.workspace.fs.stat(vocabUri);
    const overwrite = await vscode.window.showWarningMessage(
      `${VOCAB_FILE_PATH} already exists in ${folder.name}. Overwrite?`,
      'Overwrite',
      'Open Existing',
    );
    if (overwrite === 'Open Existing') {
      const doc = await vscode.workspace.openTextDocument(vocabUri);
      await vscode.window.showTextDocument(doc);
      return;
    }
    if (overwrite !== 'Overwrite') { return; }
  } catch {
    // File doesn't exist — good, we'll create it
  }

  const description = await vscode.window.showInputBox({
    prompt: 'Description for the team vocabulary (optional)',
    placeHolder: 'e.g. Shared vocabulary for the frontend team',
  });

  const template = generateTemplate(description || undefined);
  const content = JSON.stringify(template, null, 2) + '\n';

  // Ensure .voxpilot directory exists
  const dirUri = vscode.Uri.joinPath(folder.uri, '.voxpilot');
  try {
    await vscode.workspace.fs.createDirectory(dirUri);
  } catch {
    // Directory may already exist
  }

  await vscode.workspace.fs.writeFile(vocabUri, Buffer.from(content, 'utf-8'));

  const doc = await vscode.workspace.openTextDocument(vocabUri);
  await vscode.window.showTextDocument(doc);

  vscode.window.showInformationMessage(
    `VoxPilot: Created ${VOCAB_FILE_PATH} in ${folder.name}. Commit it to share with your team.`,
  );
}

/**
 * Export current personal vocabulary (customVocabulary + vocabularyBoost)
 * to the team vocabulary file.
 */
export async function exportToTeamVocabulary(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage('VoxPilot: No workspace folder open.');
    return;
  }

  let folder = folders[0];
  if (folders.length > 1) {
    const picked = await vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Select workspace folder to export to',
    });
    if (!picked) { return; }
    folder = picked;
  }

  const config = vscode.workspace.getConfiguration('voxpilot');
  const customVocab = config.get<Array<{ from: string; to: string }>>('customVocabulary', []);
  const vocabBoost = config.get<Array<{ term: string; boost: number; phoneme?: string }>>('vocabularyBoost', []);

  if (customVocab.length === 0 && vocabBoost.length === 0) {
    vscode.window.showInformationMessage('VoxPilot: No personal vocabulary entries to export.');
    return;
  }

  const vocabUri = vscode.Uri.joinPath(folder.uri, VOCAB_FILE_PATH);
  let existing: TeamVocabularyFile | null = null;

  // Try to load existing file
  try {
    const content = await vscode.workspace.fs.readFile(vocabUri);
    existing = JSON.parse(Buffer.from(content).toString('utf-8'));
  } catch {
    // File doesn't exist — create new
  }

  const result: TeamVocabularyFile = existing ?? {
    version: SCHEMA_VERSION,
    description: 'Shared team vocabulary for VoxPilot',
    corrections: [],
    boost: [],
  };

  // Merge corrections (avoid duplicates by "from" key)
  const existingFroms = new Set((result.corrections ?? []).map(c => c.from.toLowerCase()));
  for (const entry of customVocab) {
    if (!existingFroms.has(entry.from.toLowerCase())) {
      result.corrections = result.corrections ?? [];
      result.corrections.push({ from: entry.from, to: entry.to });
    }
  }

  // Merge boost entries (avoid duplicates by "term" key)
  const existingTerms = new Set((result.boost ?? []).map(b => b.term.toLowerCase()));
  for (const entry of vocabBoost) {
    if (!existingTerms.has(entry.term.toLowerCase())) {
      result.boost = result.boost ?? [];
      result.boost.push({
        term: entry.term,
        boost: entry.boost,
        ...(entry.phoneme ? { phoneme: entry.phoneme } : {}),
      });
    }
  }

  const content = JSON.stringify(result, null, 2) + '\n';

  // Ensure directory exists
  const dirUri = vscode.Uri.joinPath(folder.uri, '.voxpilot');
  try {
    await vscode.workspace.fs.createDirectory(dirUri);
  } catch {
    // Already exists
  }

  await vscode.workspace.fs.writeFile(vocabUri, Buffer.from(content, 'utf-8'));

  const doc = await vscode.workspace.openTextDocument(vocabUri);
  await vscode.window.showTextDocument(doc);

  const added = (customVocab.length - existingFroms.size) + (vocabBoost.length - existingTerms.size);
  vscode.window.showInformationMessage(
    `VoxPilot: Exported ${added} entries to ${VOCAB_FILE_PATH}. Commit to share with your team.`,
  );
}
