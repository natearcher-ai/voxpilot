/**
 * Adaptive learning — improve recognition over time from user corrections.
 *
 * Tracks when users correct transcription errors and builds a local correction
 * database. Over time, frequently-corrected patterns are applied automatically
 * during post-processing, effectively fine-tuning recognition to the user's
 * voice, vocabulary, and speaking style.
 *
 * All data stays local (extension globalState). No cloud, no telemetry.
 *
 * How it works:
 *   1. When a user edits a transcription (via confidence indicator fix, manual
 *      edit after insert, or explicit correction command), the original→corrected
 *      pair is recorded.
 *   2. Each correction accumulates a "strength" score (more occurrences = higher).
 *   3. During post-processing, corrections above a confidence threshold are
 *      applied automatically.
 *   4. Corrections decay slowly over time if not reinforced (prevents stale rules).
 *
 * Enable via `voxpilot.adaptiveLearning` setting (default: true).
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

/** A single learned correction entry */
export interface CorrectionEntry {
  /** The original (incorrect) text as spoken/transcribed */
  original: string;
  /** The corrected text the user provided */
  corrected: string;
  /** Number of times this correction has been made */
  occurrences: number;
  /** Timestamp of the first correction (ISO string) */
  firstSeen: string;
  /** Timestamp of the most recent correction (ISO string) */
  lastSeen: string;
  /** Computed strength score (0.0–1.0) based on occurrences and recency */
  strength: number;
}

/** Serialized correction database */
export interface CorrectionDatabase {
  version: number;
  entries: CorrectionEntry[];
  /** Total corrections recorded (lifetime) */
  totalCorrections: number;
  /** Last time decay was applied */
  lastDecay: string;
}

const STORAGE_KEY = 'voxpilot.adaptiveLearning.corrections';
const DB_VERSION = 1;
const MAX_ENTRIES = 500;
const DECAY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DECAY_FACTOR = 0.9; // Multiply strength by this on each decay cycle
const MIN_STRENGTH_TO_APPLY = 0.3; // Minimum strength to auto-apply a correction
const MIN_OCCURRENCES_TO_APPLY = 2; // Need at least 2 corrections before auto-applying

/**
 * Compute strength score from occurrences and recency.
 * More occurrences and more recent corrections yield higher strength.
 */
export function computeStrength(occurrences: number, lastSeenMs: number, nowMs: number): number {
  // Base strength from occurrences (logarithmic, caps around 1.0)
  const occurrenceScore = Math.min(1.0, Math.log2(occurrences + 1) / 4);

  // Recency factor: full strength if corrected recently, decays over 30 days
  const ageMs = nowMs - lastSeenMs;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const recencyFactor = Math.max(0.1, 1.0 - (ageDays / 60));

  return Math.min(1.0, occurrenceScore * recencyFactor);
}

/**
 * Manages the correction database — recording, retrieving, and applying
 * learned corrections.
 */
export class AdaptiveLearningStore {
  private db: CorrectionDatabase;
  private context: vscode.ExtensionContext;
  private entryMap: Map<string, CorrectionEntry> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.db = this.load();
    this.buildIndex();
    this.maybeDecay();
  }

  /** Load the correction database from global state */
  private load(): CorrectionDatabase {
    const stored = this.context.globalState.get<CorrectionDatabase>(STORAGE_KEY);
    if (stored && stored.version === DB_VERSION) {
      return stored;
    }
    return {
      version: DB_VERSION,
      entries: [],
      totalCorrections: 0,
      lastDecay: new Date().toISOString(),
    };
  }

  /** Persist the database to global state */
  private async save(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, this.db);
  }

  /** Build a lookup index keyed by lowercase original text */
  private buildIndex(): void {
    this.entryMap.clear();
    for (const entry of this.db.entries) {
      this.entryMap.set(entry.original.toLowerCase(), entry);
    }
  }

  /** Apply time-based decay to all entries if enough time has passed */
  private maybeDecay(): void {
    const lastDecay = new Date(this.db.lastDecay).getTime();
    const now = Date.now();
    if (now - lastDecay < DECAY_INTERVAL_MS) { return; }

    // Apply decay
    for (const entry of this.db.entries) {
      entry.strength *= DECAY_FACTOR;
    }

    // Remove entries that have decayed below usefulness
    this.db.entries = this.db.entries.filter(e => e.strength > 0.05 || e.occurrences >= 3);
    this.db.lastDecay = new Date().toISOString();
    this.buildIndex();
    this.save();
  }

  /**
   * Record a correction. If this original→corrected pair already exists,
   * increment its occurrence count and update strength.
   */
  async recordCorrection(original: string, corrected: string): Promise<void> {
    if (!original.trim() || !corrected.trim()) { return; }
    if (original.trim().toLowerCase() === corrected.trim().toLowerCase()) { return; }

    const key = original.trim().toLowerCase();
    const now = new Date();
    const nowMs = now.getTime();

    const existing = this.entryMap.get(key);
    if (existing) {
      // Update existing entry
      if (existing.corrected.toLowerCase() === corrected.trim().toLowerCase()) {
        // Same correction — reinforce
        existing.occurrences++;
        existing.lastSeen = now.toISOString();
        existing.strength = computeStrength(existing.occurrences, nowMs, nowMs);
      } else {
        // Different correction for same original — replace if new one is more recent
        existing.corrected = corrected.trim();
        existing.occurrences = 1;
        existing.lastSeen = now.toISOString();
        existing.strength = computeStrength(1, nowMs, nowMs);
      }
    } else {
      // New entry
      if (this.db.entries.length >= MAX_ENTRIES) {
        // Evict weakest entry
        this.db.entries.sort((a, b) => a.strength - b.strength);
        this.db.entries.shift();
      }

      const entry: CorrectionEntry = {
        original: original.trim(),
        corrected: corrected.trim(),
        occurrences: 1,
        firstSeen: now.toISOString(),
        lastSeen: now.toISOString(),
        strength: computeStrength(1, nowMs, nowMs),
      };
      this.db.entries.push(entry);
      this.entryMap.set(key, entry);
    }

    this.db.totalCorrections++;
    await this.save();
  }

  /**
   * Get all corrections that are strong enough to auto-apply.
   * Returns entries sorted by strength (strongest first).
   */
  getApplicableCorrections(): CorrectionEntry[] {
    return this.db.entries
      .filter(e => e.strength >= MIN_STRENGTH_TO_APPLY && e.occurrences >= MIN_OCCURRENCES_TO_APPLY)
      .sort((a, b) => b.strength - a.strength);
  }

  /**
   * Apply learned corrections to a transcript.
   * Only applies corrections that meet the strength and occurrence thresholds.
   */
  applyCorrections(text: string): string {
    const corrections = this.getApplicableCorrections();
    if (corrections.length === 0) { return text; }

    let result = text;
    for (const entry of corrections) {
      // Word-boundary match, case-insensitive
      const escaped = entry.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'gi');
      result = result.replace(pattern, entry.corrected);
    }

    return result;
  }

  /** Get all entries for display in the management UI */
  getAllEntries(): CorrectionEntry[] {
    return [...this.db.entries].sort((a, b) => b.strength - a.strength);
  }

  /** Get statistics about the correction database */
  getStats(): { totalEntries: number; totalCorrections: number; applicableCount: number } {
    return {
      totalEntries: this.db.entries.length,
      totalCorrections: this.db.totalCorrections,
      applicableCount: this.getApplicableCorrections().length,
    };
  }

  /** Remove a specific correction entry */
  async removeEntry(original: string): Promise<void> {
    const key = original.toLowerCase();
    this.db.entries = this.db.entries.filter(e => e.original.toLowerCase() !== key);
    this.entryMap.delete(key);
    await this.save();
  }

  /** Clear all learned corrections */
  async clearAll(): Promise<void> {
    this.db.entries = [];
    this.db.totalCorrections = 0;
    this.entryMap.clear();
    await this.save();
  }

  /** Export the database as JSON (for backup/sharing) */
  exportJson(): string {
    return JSON.stringify(this.db, null, 2);
  }

  /** Import corrections from JSON (merges with existing) */
  async importJson(json: string): Promise<number> {
    const imported = JSON.parse(json) as CorrectionDatabase;
    if (!imported || imported.version !== DB_VERSION || !Array.isArray(imported.entries)) {
      throw new Error('Invalid correction database format');
    }

    let added = 0;
    for (const entry of imported.entries) {
      const key = entry.original.toLowerCase();
      if (!this.entryMap.has(key)) {
        this.db.entries.push(entry);
        this.entryMap.set(key, entry);
        added++;
      }
    }

    if (added > 0) { await this.save(); }
    return added;
  }
}

/**
 * Post-processor that applies learned corrections from the adaptive learning store.
 */
export class AdaptiveLearningProcessor implements PostProcessor {
  readonly id = 'adaptiveLearning';
  readonly name = 'Adaptive Learning';
  readonly description = 'Apply learned corrections from user feedback to improve transcription accuracy over time';

  private store: AdaptiveLearningStore | null = null;

  /** Bind the processor to a store instance (called during engine init) */
  setStore(store: AdaptiveLearningStore): void {
    this.store = store;
  }

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (config.get<boolean>('adaptiveLearning') === false) {
      return text;
    }

    if (!this.store) { return text; }
    return this.store.applyCorrections(text);
  }
}

/**
 * Document change listener that detects when a user manually corrects
 * a recently-inserted transcription.
 */
export class CorrectionTracker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private store: AdaptiveLearningStore;
  private recentInsertions: Array<{
    uri: string;
    text: string;
    range: vscode.Range;
    timestamp: number;
  }> = [];
  private readonly TRACKING_WINDOW_MS = 30_000; // Track edits within 30s of insertion

  constructor(store: AdaptiveLearningStore) {
    this.store = store;

    // Listen for document changes to detect corrections
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChange(e)),
    );
  }

  /**
   * Record that a transcription was just inserted at a specific location.
   * This allows us to detect subsequent edits as corrections.
   */
  recordInsertion(uri: string, text: string, range: vscode.Range): void {
    // Clean up old insertions
    const now = Date.now();
    this.recentInsertions = this.recentInsertions.filter(
      i => now - i.timestamp < this.TRACKING_WINDOW_MS,
    );

    this.recentInsertions.push({ uri, text, range, timestamp: now });
  }

  private onDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (this.recentInsertions.length === 0) { return; }

    const now = Date.now();
    const uri = event.document.uri.toString();

    for (const change of event.contentChanges) {
      // Find if this edit overlaps with a recent insertion
      for (let i = this.recentInsertions.length - 1; i >= 0; i--) {
        const insertion = this.recentInsertions[i];
        if (insertion.uri !== uri) { continue; }
        if (now - insertion.timestamp > this.TRACKING_WINDOW_MS) { continue; }

        // Check if the edit range overlaps with the insertion range
        const editRange = new vscode.Range(
          change.range.start,
          change.range.end,
        );

        if (insertion.range.intersection(editRange)) {
          // This looks like a correction of our transcription
          const original = event.document.getText(editRange);
          const corrected = change.text;

          // Only record if it's a meaningful correction (not just deletion)
          if (corrected.trim() && original.trim() && original !== corrected) {
            this.store.recordCorrection(original, corrected);
          }

          // Remove this insertion from tracking (already corrected)
          this.recentInsertions.splice(i, 1);
          break;
        }
      }
    }
  }

  /**
   * Explicitly record a correction (e.g., from confidence indicator quick fix).
   */
  async recordExplicitCorrection(original: string, corrected: string): Promise<void> {
    await this.store.recordCorrection(original, corrected);
  }

  dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}

/**
 * Show a quick pick UI to manage learned corrections.
 */
export async function showAdaptiveLearningPanel(store: AdaptiveLearningStore): Promise<void> {
  const stats = store.getStats();
  const entries = store.getAllEntries();

  const items: vscode.QuickPickItem[] = [
    {
      label: '$(info) Statistics',
      description: `${stats.totalEntries} patterns learned, ${stats.applicableCount} active, ${stats.totalCorrections} total corrections`,
      detail: 'Patterns are auto-applied when they reach sufficient confidence',
    },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
  ];

  if (entries.length === 0) {
    items.push({
      label: '$(circle-slash) No corrections learned yet',
      description: 'Corrections are recorded when you fix transcription errors',
    });
  } else {
    for (const entry of entries.slice(0, 30)) {
      const active = entry.strength >= MIN_STRENGTH_TO_APPLY && entry.occurrences >= MIN_OCCURRENCES_TO_APPLY;
      const icon = active ? '$(check)' : '$(circle-outline)';
      const strengthPct = Math.round(entry.strength * 100);
      items.push({
        label: `${icon} "${entry.original}" → "${entry.corrected}"`,
        description: `${entry.occurrences}× | strength: ${strengthPct}%`,
        detail: active ? 'Auto-applied' : `Needs ${MIN_OCCURRENCES_TO_APPLY - entry.occurrences} more corrections to activate`,
      });
    }
  }

  items.push(
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(export) Export corrections', description: 'Save to file' },
    { label: '$(import) Import corrections', description: 'Load from file' },
    { label: '$(trash) Clear all corrections', description: 'Reset learned patterns' },
  );

  const selected = await vscode.window.showQuickPick(items, {
    title: 'VoxPilot: Adaptive Learning',
    placeHolder: 'Manage learned corrections',
  });

  if (!selected) { return; }

  if (selected.label.includes('Export corrections')) {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('voxpilot-corrections.json'),
      filters: { 'JSON': ['json'] },
    });
    if (uri) {
      const json = store.exportJson();
      await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'));
      vscode.window.showInformationMessage(`Exported ${stats.totalEntries} corrections.`);
    }
  } else if (selected.label.includes('Import corrections')) {
    const uris = await vscode.window.showOpenDialog({
      filters: { 'JSON': ['json'] },
      canSelectMany: false,
    });
    if (uris && uris[0]) {
      const data = await vscode.workspace.fs.readFile(uris[0]);
      const added = await store.importJson(Buffer.from(data).toString('utf-8'));
      vscode.window.showInformationMessage(`Imported ${added} new corrections.`);
    }
  } else if (selected.label.includes('Clear all corrections')) {
    const confirm = await vscode.window.showWarningMessage(
      'Clear all learned corrections? This cannot be undone.',
      { modal: true },
      'Clear All',
    );
    if (confirm === 'Clear All') {
      await store.clearAll();
      vscode.window.showInformationMessage('All learned corrections cleared.');
    }
  }
}
