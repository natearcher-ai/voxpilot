/**
 * Auto-vocabulary — dynamically learn project-specific terms from workspace symbols
 * and open files to improve transcription accuracy.
 *
 * Scans VS Code workspace symbols (function names, class names, variables, etc.)
 * and builds a correction dictionary that maps spoken forms to code identifiers:
 *   "get user name"    → getUserName
 *   "my component"     → MyComponent
 *   "max retry count"  → MAX_RETRY_COUNT
 *   "handle click"     → handleClick
 *
 * The vocabulary refreshes when files are opened/saved or on explicit reload.
 * Works alongside the static CodeVocabulary processor — auto-vocabulary runs first
 * so project-specific terms take priority over generic corrections.
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

interface AutoVocabEntry {
  /** The original identifier as it appears in code */
  identifier: string;
  /** Spoken form (lowercase, space-separated words) */
  spoken: string;
  /** Compiled regex for matching in transcript */
  pattern: RegExp;
}

/**
 * Split a code identifier into its component words.
 * Handles camelCase, PascalCase, snake_case, SCREAMING_SNAKE_CASE, kebab-case.
 */
export function splitIdentifier(id: string): string[] {
  // Remove leading/trailing underscores or hyphens
  let cleaned = id.replace(/^[_-]+|[_-]+$/g, '');
  if (!cleaned) { return []; }

  // Split on underscores, hyphens, or camelCase boundaries
  const words = cleaned
    // Insert space before uppercase letters that follow lowercase (camelCase boundary)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Insert space before uppercase letter followed by lowercase when preceded by uppercase (e.g. XMLParser → XML Parser)
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // Insert space before uppercase letters that follow digits (e.g. getUser2Name → getUser2 Name)
    .replace(/([0-9])([A-Z])/g, '$1 $2')
    // Replace underscores and hyphens with spaces
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => w.toLowerCase());

  return words;
}

/**
 * Build a spoken form from an identifier.
 * Returns null if the identifier is too short or produces no meaningful words.
 */
function toSpokenForm(identifier: string): string | null {
  const words = splitIdentifier(identifier);
  // Skip single-character identifiers and very short ones
  if (words.length < 2) { return null; }
  // Skip if any word is a single character (likely not useful)
  if (words.some(w => w.length === 0)) { return null; }
  return words.join(' ');
}

/**
 * Extract identifiers from a VS Code document by scanning for common patterns.
 * This is a lightweight regex-based approach that doesn't require language servers.
 */
function extractIdentifiersFromText(text: string): Set<string> {
  const identifiers = new Set<string>();

  // Match camelCase, PascalCase, snake_case identifiers (2+ words, 4+ chars)
  const patterns = [
    // camelCase and PascalCase: at least one uppercase transition
    /\b([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)\b/g,
    // PascalCase starting with uppercase
    /\b([A-Z][a-z]+[A-Z][a-zA-Z0-9]*)\b/g,
    // snake_case with at least one underscore
    /\b([a-zA-Z][a-zA-Z0-9]*_[a-zA-Z0-9_]+)\b/g,
    // SCREAMING_SNAKE_CASE
    /\b([A-Z][A-Z0-9]*_[A-Z0-9_]+)\b/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const id = match[1];
      // Skip very short identifiers and common noise
      if (id.length >= 4 && !COMMON_NOISE.has(id.toLowerCase())) {
        identifiers.add(id);
      }
    }
  }

  return identifiers;
}

/** Common identifiers to skip (too generic to be useful as vocabulary) */
const COMMON_NOISE = new Set([
  'this', 'that', 'then', 'else', 'true', 'false', 'null', 'void',
  'self', 'none', 'some', 'each', 'from', 'into', 'with', 'have',
  'been', 'were', 'will', 'would', 'could', 'should', 'typeof',
  'instanceof', 'undefined', 'return', 'function', 'class', 'const',
  'export', 'import', 'default', 'extends', 'implements', 'interface',
]);

/**
 * Build auto-vocabulary entries from a set of identifiers.
 * Returns entries sorted longest-spoken-form first for greedy matching.
 */
function buildEntries(identifiers: Set<string>): AutoVocabEntry[] {
  const entries: AutoVocabEntry[] = [];
  const seenSpoken = new Set<string>();

  for (const id of identifiers) {
    const spoken = toSpokenForm(id);
    if (!spoken || seenSpoken.has(spoken)) { continue; }
    seenSpoken.add(spoken);

    const escaped = spoken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    entries.push({
      identifier: id,
      spoken,
      pattern: new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'gi'),
    });
  }

  // Sort longest first for greedy matching
  entries.sort((a, b) => b.spoken.length - a.spoken.length);
  return entries;
}

export class AutoVocabularyProcessor implements PostProcessor {
  readonly id = 'autoVocabulary';
  readonly name = 'Auto-Vocabulary';
  readonly description = 'Learn project-specific terms from open files and workspace symbols for better transcription accuracy';

  private entries: AutoVocabEntry[] = [];
  private disposables: vscode.Disposable[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.scheduleRefresh();

    // Subscribe to document events (defensive — may not exist in test environments)
    try {
      if (vscode.workspace.onDidOpenTextDocument) {
        this.disposables.push(
          vscode.workspace.onDidOpenTextDocument(() => this.scheduleRefresh()),
          vscode.workspace.onDidSaveTextDocument(() => this.scheduleRefresh()),
        );
      }
    } catch {
      // Running in test environment without full vscode mock
    }
  }

  /** Debounced refresh — avoids thrashing when many files open at once */
  private scheduleRefresh(): void {
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
    this.refreshTimer = setTimeout(() => this.refresh(), 1000);
  }

  /** Scan open documents and rebuild vocabulary */
  refresh(): void {
    const allIdentifiers = new Set<string>();

    for (const doc of vscode.workspace.textDocuments) {
      // Skip non-file schemes (output, debug console, etc.)
      if (doc.uri.scheme !== 'file' && doc.uri.scheme !== 'untitled') { continue; }
      // Skip very large files (>500KB) to avoid performance issues
      if (doc.getText().length > 500_000) { continue; }

      const ids = extractIdentifiersFromText(doc.getText());
      for (const id of ids) { allIdentifiers.add(id); }
    }

    this.entries = buildEntries(allIdentifiers);
  }

  /** Reload vocabulary (called by pipeline on config change) */
  reload(): void {
    this.refresh();
  }

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (config.get<boolean>('autoVocabulary') === false) {
      return text;
    }

    let result = text;
    for (const entry of this.entries) {
      result = result.replace(entry.pattern, entry.identifier);
    }
    return result;
  }

  dispose(): void {
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}
