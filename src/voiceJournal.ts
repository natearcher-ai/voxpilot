/**
 * Voice Journaling — dictate dev notes that auto-link to current file, branch, and commit.
 *
 * Captures voice notes with rich context:
 *   - Current file and cursor position
 *   - Git branch and latest commit hash
 *   - Timestamp and session duration
 *   - Optional tags via voice ("tag this as bug" / "tag architecture")
 *
 * Commands:
 *   "note <text>"                 → Quick note linked to current context
 *   "journal <text>"             → Same as note
 *   "todo <text>"                → Note tagged as TODO
 *   "bug <text>"                 → Note tagged as BUG
 *   "idea <text>"                → Note tagged as IDEA
 *   "question <text>"            → Note tagged as QUESTION
 *   "show notes"                 → Open journal panel
 *   "show today's notes"         → Filter to today
 *   "export notes"               → Export journal as markdown
 *
 * Notes are stored in workspace state and can be exported as markdown.
 * Enable via `voxpilot.voiceJournal` setting (default: true).
 */

import * as vscode from 'vscode';

/** Journal entry tags */
export type JournalTag = 'note' | 'todo' | 'bug' | 'idea' | 'question' | 'decision' | 'review';

/** A single journal entry */
export interface JournalEntry {
  /** Unique ID */
  id: string;
  /** Note text */
  text: string;
  /** Timestamp */
  timestamp: number;
  /** Tag/category */
  tag: JournalTag;
  /** Context at time of note */
  context: JournalContext;
}

/** Context captured with each journal entry */
export interface JournalContext {
  /** Active file path (relative to workspace) */
  file?: string;
  /** Cursor line number */
  line?: number;
  /** Git branch */
  branch?: string;
  /** Latest commit hash (short) */
  commit?: string;
  /** Workspace folder name */
  workspace?: string;
}

/** Journal trigger definition */
interface JournalTrigger {
  phrases: string[];
  tag: JournalTag;
  capturesText: boolean;
}

const JOURNAL_TRIGGERS: JournalTrigger[] = [
  { phrases: ['todo', 'to do'], tag: 'todo', capturesText: true },
  { phrases: ['bug', 'bug report'], tag: 'bug', capturesText: true },
  { phrases: ['idea'], tag: 'idea', capturesText: true },
  { phrases: ['question'], tag: 'question', capturesText: true },
  { phrases: ['decision'], tag: 'decision', capturesText: true },
  { phrases: ['review note', 'review'], tag: 'review', capturesText: true },
  { phrases: ['journal', 'note', 'dev note'], tag: 'note', capturesText: true },
];

/**
 * Parse voice input into a journal command.
 */
export function parseJournalCommand(text: string): { tag: JournalTag; text: string } | null {
  const trimmed = text.trim().toLowerCase();

  for (const trigger of JOURNAL_TRIGGERS) {
    for (const phrase of trigger.phrases) {
      if (trimmed === phrase) {
        return { tag: trigger.tag, text: '' };
      }
      if (trimmed.startsWith(phrase + ' ')) {
        const noteText = text.trim().slice(phrase.length).trim();
        return { tag: trigger.tag, text: noteText };
      }
    }
  }

  return null;
}

/**
 * Generate a unique ID for a journal entry.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Voice Journal manager — stores and retrieves dev notes.
 */
export class VoiceJournal {
  private entries: JournalEntry[] = [];
  private context: vscode.ExtensionContext | undefined;

  /** Initialize with extension context */
  init(extensionContext: vscode.ExtensionContext): void {
    this.context = extensionContext;
    this.loadEntries();
  }

  /** Add a new journal entry */
  addEntry(text: string, tag: JournalTag, ctx?: Partial<JournalContext>): JournalEntry {
    const entry: JournalEntry = {
      id: generateId(),
      text,
      timestamp: Date.now(),
      tag,
      context: ctx ?? this.captureContext(),
    };

    this.entries.push(entry);
    this.saveEntries();
    return entry;
  }

  /** Get all entries */
  getEntries(): JournalEntry[] {
    return [...this.entries];
  }

  /** Get entries for today */
  getTodayEntries(): JournalEntry[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = today.getTime();
    return this.entries.filter(e => e.timestamp >= startOfDay);
  }

  /** Get entries by tag */
  getEntriesByTag(tag: JournalTag): JournalEntry[] {
    return this.entries.filter(e => e.tag === tag);
  }

  /** Get entries for a specific file */
  getEntriesForFile(filePath: string): JournalEntry[] {
    return this.entries.filter(e => e.context.file === filePath);
  }

  /** Get entries for a specific branch */
  getEntriesForBranch(branch: string): JournalEntry[] {
    return this.entries.filter(e => e.context.branch === branch);
  }

  /** Delete an entry by ID */
  deleteEntry(id: string): boolean {
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx >= 0) {
      this.entries.splice(idx, 1);
      this.saveEntries();
      return true;
    }
    return false;
  }

  /** Clear all entries */
  clearAll(): void {
    this.entries = [];
    this.saveEntries();
  }

  /** Export entries as markdown */
  exportAsMarkdown(entries?: JournalEntry[]): string {
    const toExport = entries ?? this.entries;
    const lines: string[] = [];

    lines.push('# Voice Journal');
    lines.push(`**Exported:** ${new Date().toISOString()}`);
    lines.push(`**Entries:** ${toExport.length}`);
    lines.push('');

    // Group by date
    const byDate = new Map<string, JournalEntry[]>();
    for (const entry of toExport) {
      const date = new Date(entry.timestamp).toLocaleDateString();
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(entry);
    }

    for (const [date, dateEntries] of byDate) {
      lines.push(`## ${date}`);
      lines.push('');
      for (const entry of dateEntries) {
        const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false });
        const tagEmoji = this.getTagEmoji(entry.tag);
        const contextStr = this.formatContext(entry.context);
        lines.push(`- **[${time}]** ${tagEmoji} ${entry.text}`);
        if (contextStr) {
          lines.push(`  - _${contextStr}_`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Get entry count */
  get count(): number {
    return this.entries.length;
  }

  /** Get tag statistics */
  getStats(): Record<JournalTag, number> {
    const stats: Record<JournalTag, number> = {
      note: 0, todo: 0, bug: 0, idea: 0, question: 0, decision: 0, review: 0,
    };
    for (const entry of this.entries) {
      stats[entry.tag]++;
    }
    return stats;
  }

  /** Capture current editor/git context */
  captureContext(): JournalContext {
    const editor = vscode.window.activeTextEditor;
    const ctx: JournalContext = {};

    if (editor) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      ctx.file = workspaceFolder
        ? editor.document.uri.fsPath.replace(workspaceFolder.uri.fsPath, '').replace(/^[/\\]/, '')
        : editor.document.fileName;
      ctx.line = editor.selection.active.line + 1;
      ctx.workspace = workspaceFolder?.name;
    }

    return ctx;
  }

  private getTagEmoji(tag: JournalTag): string {
    switch (tag) {
      case 'todo': return '📋';
      case 'bug': return '🐛';
      case 'idea': return '💡';
      case 'question': return '❓';
      case 'decision': return '⚖️';
      case 'review': return '👀';
      case 'note': return '📝';
    }
  }

  private formatContext(ctx: JournalContext): string {
    const parts: string[] = [];
    if (ctx.file) parts.push(ctx.file + (ctx.line ? `:${ctx.line}` : ''));
    if (ctx.branch) parts.push(`branch: ${ctx.branch}`);
    if (ctx.commit) parts.push(`commit: ${ctx.commit}`);
    return parts.join(' | ');
  }

  private loadEntries(): void {
    if (!this.context) return;
    const saved = this.context.globalState.get<JournalEntry[]>('voiceJournal');
    if (saved) {
      this.entries = saved;
    }
  }

  private saveEntries(): void {
    if (!this.context) return;
    this.context.globalState.update('voiceJournal', this.entries);
  }
}

/** Singleton instance */
export const voiceJournal = new VoiceJournal();
