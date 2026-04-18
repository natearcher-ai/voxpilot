/**
 * History panel — searchable transcript history with timestamps.
 *
 * Provides a VS Code webview panel that displays all past transcriptions
 * with timestamps, search/filter, and click-to-insert functionality.
 *
 * Features:
 *   - Full transcript history (configurable max, default 100)
 *   - Search/filter by text content
 *   - Timestamps with relative time display ("2 min ago", "yesterday")
 *   - Click to insert at cursor, copy, or send to chat
 *   - Export history as JSON or text
 *   - Clear history
 *
 * Enable via `voxpilot.historyPanel` setting (default: true).
 */

import * as vscode from 'vscode';

export interface HistoryEntry {
  /** Unique ID for the entry */
  id: string;
  /** Transcript text */
  text: string;
  /** Unix timestamp (ms) */
  timestamp: number;
  /** Language code used for transcription */
  language?: string;
  /** Model used for transcription */
  model?: string;
  /** Duration of audio in seconds */
  audioDuration?: number;
}

/**
 * Format a timestamp as a relative time string.
 * "just now", "2 min ago", "1 hour ago", "yesterday", "Apr 18"
 */
export function formatRelativeTime(timestamp: number, now?: number): string {
  const current = now ?? Date.now();
  const diffMs = current - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 30) { return 'just now'; }
  if (diffSec < 60) { return `${diffSec}s ago`; }
  if (diffMin < 60) { return `${diffMin} min ago`; }
  if (diffHour < 24) { return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`; }
  if (diffDay === 1) { return 'yesterday'; }
  if (diffDay < 7) { return `${diffDay} days ago`; }

  const date = new Date(timestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Generate a unique ID for a history entry.
 */
export function generateEntryId(): string {
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Search/filter history entries by query string.
 * Case-insensitive substring match on text content.
 */
export function filterEntries(entries: HistoryEntry[], query: string): HistoryEntry[] {
  if (!query.trim()) { return entries; }
  const lower = query.toLowerCase();
  return entries.filter(e => e.text.toLowerCase().includes(lower));
}

/**
 * Export history entries as formatted text.
 */
export function exportAsText(entries: HistoryEntry[]): string {
  return entries.map(e => {
    const date = new Date(e.timestamp);
    const timeStr = date.toISOString();
    return `[${timeStr}] ${e.text}`;
  }).join('\n\n');
}

/**
 * Export history entries as JSON.
 */
export function exportAsJSON(entries: HistoryEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

/**
 * Extended history store with larger capacity and richer metadata.
 * Wraps the existing TranscriptHistory for backward compatibility.
 */
export class HistoryStore {
  private entries: HistoryEntry[] = [];
  private readonly storageKey = 'voxpilot.historyPanel.entries';
  private readonly maxEntries: number;

  constructor(
    private context: vscode.ExtensionContext,
    maxEntries: number = 100,
  ) {
    this.maxEntries = maxEntries;
    this.entries = context.globalState.get<HistoryEntry[]>(this.storageKey, []);
  }

  /** Add a new transcript to history */
  add(text: string, metadata?: { language?: string; model?: string; audioDuration?: number }): HistoryEntry {
    const entry: HistoryEntry = {
      id: generateEntryId(),
      text,
      timestamp: Date.now(),
      ...metadata,
    };

    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }

    this.persist();
    return entry;
  }

  /** Get all entries (newest first) */
  getAll(): HistoryEntry[] {
    return [...this.entries];
  }

  /** Search entries by text content */
  search(query: string): HistoryEntry[] {
    return filterEntries(this.entries, query);
  }

  /** Get entry by ID */
  getById(id: string): HistoryEntry | undefined {
    return this.entries.find(e => e.id === id);
  }

  /** Delete a single entry */
  delete(id: string): void {
    this.entries = this.entries.filter(e => e.id !== id);
    this.persist();
  }

  /** Clear all history */
  clear(): void {
    this.entries = [];
    this.persist();
  }

  /** Total entry count */
  get count(): number {
    return this.entries.length;
  }

  private persist(): void {
    this.context.globalState.update(this.storageKey, this.entries);
  }
}
