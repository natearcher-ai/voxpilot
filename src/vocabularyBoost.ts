/**
 * Custom vocabulary boost — weight domain-specific terms for better recognition.
 *
 * Extends the existing customVocabulary with boost factors:
 *   - Boost factor (1.0-10.0) increases recognition priority for specific terms
 *   - Phoneme hints help the ASR model recognize unusual pronunciations
 *   - Max 200 entries to keep recognition fast
 *
 * Example config:
 *   "voxpilot.vocabularyBoost": [
 *     { "term": "kubectl", "boost": 8.0, "phoneme": "cube-control" },
 *     { "term": "nginx", "boost": 5.0, "phoneme": "engine-x" },
 *     { "term": "Kubernetes", "boost": 7.0 }
 *   ]
 *
 * How it works:
 *   1. Terms with phoneme hints generate additional pattern→replacement rules
 *   2. Boost factor determines matching priority (higher = matched first)
 *   3. Integrated into the post-processing pipeline after filler word removal
 *
 * Enable via `voxpilot.vocabularyBoostEnabled` setting (default: true).
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

export interface VocabBoostEntry {
  /** The correct term to recognize */
  term: string;
  /** Boost factor (1.0-10.0). Higher = higher priority in matching */
  boost: number;
  /** Optional phoneme hint — how the term sounds when spoken */
  phoneme?: string;
}

interface CompiledBoostRule {
  /** Patterns to match (includes phoneme variants) */
  patterns: RegExp[];
  /** Correct replacement text */
  replacement: string;
  /** Boost factor for sorting priority */
  boost: number;
}

const MAX_ENTRIES = 200;

/**
 * Compile a vocabulary boost entry into matching rules.
 * Generates patterns for both the term itself and its phoneme hint.
 */
export function compileBoostEntry(entry: VocabBoostEntry): CompiledBoostRule {
  const patterns: RegExp[] = [];

  // Pattern for the term itself (case-insensitive, word boundary)
  const termEscaped = entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  patterns.push(new RegExp(`(?<!\\w)${termEscaped}(?!\\w)`, 'gi'));

  // Pattern for phoneme hint if provided
  if (entry.phoneme) {
    const phonemeEscaped = entry.phoneme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Also match with hyphens replaced by spaces (ASR often splits hyphenated phonemes)
    const phonemeSpaced = entry.phoneme.replace(/-/g, ' ');
    const phonemeSpacedEscaped = phonemeSpaced.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    patterns.push(new RegExp(`(?<!\\w)${phonemeEscaped}(?!\\w)`, 'gi'));
    if (phonemeSpaced !== entry.phoneme) {
      patterns.push(new RegExp(`(?<!\\w)${phonemeSpacedEscaped}(?!\\w)`, 'gi'));
    }
  }

  return {
    patterns,
    replacement: entry.term,
    boost: Math.max(1.0, Math.min(10.0, entry.boost)),
  };
}

/**
 * Validate and sanitize a vocabulary boost entry.
 */
export function validateEntry(entry: unknown): VocabBoostEntry | null {
  if (!entry || typeof entry !== 'object') { return null; }
  const e = entry as Record<string, unknown>;

  if (typeof e.term !== 'string' || !e.term.trim()) { return null; }
  const boost = typeof e.boost === 'number' ? e.boost : 5.0;
  const phoneme = typeof e.phoneme === 'string' ? e.phoneme.trim() || undefined : undefined;

  return {
    term: e.term.trim(),
    boost: Math.max(1.0, Math.min(10.0, boost)),
    phoneme,
  };
}

/**
 * Load and compile vocabulary boost entries from settings.
 * Returns compiled rules sorted by boost factor (highest first).
 */
export function loadBoostRules(): CompiledBoostRule[] {
  const config = vscode.workspace.getConfiguration('voxpilot');
  const raw = config.get<unknown[]>('vocabularyBoost', []);

  if (!Array.isArray(raw)) { return []; }

  const entries: VocabBoostEntry[] = [];
  for (const item of raw.slice(0, MAX_ENTRIES)) {
    const validated = validateEntry(item);
    if (validated) { entries.push(validated); }
  }

  // Compile and sort by boost (highest first)
  return entries
    .map(compileBoostEntry)
    .sort((a, b) => b.boost - a.boost);
}

/**
 * Apply vocabulary boost rules to a transcript.
 */
export function applyBoostRules(text: string, rules: CompiledBoostRule[]): string {
  let result = text;

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      result = result.replace(pattern, rule.replacement);
    }
  }

  return result;
}

export class VocabularyBoostProcessor implements PostProcessor {
  readonly id = 'vocabularyBoost';
  readonly name = 'Vocabulary Boost';
  readonly description = 'Boost recognition of domain-specific terms with configurable priority and phoneme hints';

  private rules: CompiledBoostRule[] = [];

  constructor() {
    this.reload();
  }

  reload(): void {
    this.rules = loadBoostRules();
  }

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (config.get<boolean>('vocabularyBoostEnabled') === false) {
      return text;
    }

    if (this.rules.length === 0) { return text; }
    return applyBoostRules(text, this.rules);
  }
}
