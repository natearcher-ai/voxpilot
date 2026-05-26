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
 * Webview panel that renders the searchable transcript history UI.
 */
export class HistoryPanelView {
  private static instance: HistoryPanelView | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private store: HistoryStore;
  private onInsertEmitter = new vscode.EventEmitter<string>();
  /** Fires when the user clicks "Insert" on a history entry */
  readonly onInsert = this.onInsertEmitter.event;

  private constructor(private context: vscode.ExtensionContext, store: HistoryStore) {
    this.store = store;
  }

  static create(context: vscode.ExtensionContext, store: HistoryStore): HistoryPanelView {
    if (!HistoryPanelView.instance) {
      HistoryPanelView.instance = new HistoryPanelView(context, store);
    }
    return HistoryPanelView.instance;
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'voxpilot.historyPanel',
      'VoxPilot History',
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    this.panel.onDidDispose(() => { this.panel = undefined; });

    this.panel.webview.onDidReceiveMessage((msg: { type: string; id?: string; text?: string; query?: string; format?: string }) => {
      switch (msg.type) {
        case 'insert':
          if (msg.text) { this.onInsertEmitter.fire(msg.text); }
          break;
        case 'copy':
          if (msg.text) { vscode.env.clipboard.writeText(msg.text); }
          break;
        case 'delete':
          if (msg.id) { this.store.delete(msg.id); this.refresh(); }
          break;
        case 'clear':
          this.store.clear();
          this.refresh();
          break;
        case 'export': {
          const entries = msg.query ? this.store.search(msg.query) : this.store.getAll();
          const content = msg.format === 'json' ? exportAsJSON(entries) : exportAsText(entries);
          const uri = vscode.Uri.parse(`untitled:voxpilot-history.${msg.format === 'json' ? 'json' : 'txt'}`);
          vscode.workspace.openTextDocument(uri).then(doc => vscode.window.showTextDocument(doc)).then(editor => {
            editor.edit(eb => eb.insert(new vscode.Position(0, 0), content));
          });
          break;
        }
      }
    });

    this.refresh();
  }

  refresh(): void {
    if (!this.panel) { return; }
    this.panel.webview.html = this.getHtml(this.store.getAll());
  }

  private getHtml(entries: HistoryEntry[]): string {
    const rows = entries.map(e => {
      const escaped = e.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const lang = e.language ? ` · ${e.language}` : '';
      const dur = e.audioDuration ? ` · ${e.audioDuration.toFixed(1)}s` : '';
      return `<div class="entry" data-id="${e.id}" data-text="${escaped}">
        <div class="meta"><span class="time" data-ts="${e.timestamp}"></span>${lang}${dur}</div>
        <div class="text">${escaped}</div>
        <div class="actions">
          <button class="btn insert" title="Insert at cursor">$(pencil) Insert</button>
          <button class="btn copy" title="Copy">$(copy) Copy</button>
          <button class="btn del" title="Delete">$(trash)</button>
        </div>
      </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 8px; }
  .toolbar { display:flex; gap:6px; margin-bottom:10px; align-items:center; }
  .toolbar input { flex:1; padding:5px 8px; background:var(--vscode-input-background); color:var(--vscode-input-foreground); border:1px solid var(--vscode-input-border); border-radius:3px; }
  .toolbar button { padding:4px 8px; background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground); border:none; border-radius:3px; cursor:pointer; font-size:12px; }
  .entry { padding:8px; border-bottom:1px solid var(--vscode-panel-border); }
  .entry:hover { background:var(--vscode-list-hoverBackground); }
  .meta { font-size:11px; color:var(--vscode-descriptionForeground); margin-bottom:3px; }
  .text { white-space:pre-wrap; word-break:break-word; margin-bottom:4px; }
  .actions { display:flex; gap:4px; opacity:0; transition:opacity 0.15s; }
  .entry:hover .actions { opacity:1; }
  .btn { padding:2px 6px; font-size:11px; background:var(--vscode-button-secondaryBackground); color:var(--vscode-button-secondaryForeground); border:none; border-radius:2px; cursor:pointer; }
  .btn:hover { background:var(--vscode-button-hoverBackground); color:var(--vscode-button-foreground); }
  .btn.del { color:var(--vscode-errorForeground); }
  .empty { text-align:center; padding:40px; color:var(--vscode-descriptionForeground); }
  .count { font-size:11px; color:var(--vscode-descriptionForeground); }
</style></head><body>
<div class="toolbar">
  <input id="search" type="text" placeholder="Search transcripts..." aria-label="Search transcript history" />
  <span class="count" id="count">${entries.length} entries</span>
  <button id="exportTxt" aria-label="Export history as text">Export TXT</button>
  <button id="exportJson" aria-label="Export history as JSON">Export JSON</button>
  <button id="clearAll" aria-label="Clear all transcript history">Clear All</button>
</div>
<div id="list" role="list" aria-label="Transcript history">${rows || '<div class="empty">No transcripts yet. Start talking!</div>'}</div>
<script>
  const vscode = acquireVsCodeApi();
  const search = document.getElementById('search');
  const list = document.getElementById('list');
  const countEl = document.getElementById('count');

  function relTime(ts) {
    const d = Date.now() - ts, s = Math.floor(d/1000), m = Math.floor(s/60), h = Math.floor(m/60), dy = Math.floor(h/24);
    if (s < 30) return 'just now';
    if (s < 60) return s + 's ago';
    if (m < 60) return m + ' min ago';
    if (h < 24) return h + ' hour' + (h>1?'s':'') + ' ago';
    if (dy === 1) return 'yesterday';
    if (dy < 7) return dy + ' days ago';
    const dt = new Date(ts);
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()] + ' ' + dt.getDate();
  }

  document.querySelectorAll('.time').forEach(el => { el.textContent = relTime(+el.dataset.ts); });

  search.addEventListener('input', () => {
    const q = search.value.toLowerCase();
    let visible = 0;
    document.querySelectorAll('.entry').forEach(el => {
      const show = !q || el.dataset.text.toLowerCase().includes(q);
      el.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    countEl.textContent = visible + ' entries';
  });

  list.addEventListener('click', e => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const entry = btn.closest('.entry');
    if (btn.classList.contains('insert')) vscode.postMessage({type:'insert', text:entry.dataset.text, id:entry.dataset.id});
    else if (btn.classList.contains('copy')) vscode.postMessage({type:'copy', text:entry.dataset.text});
    else if (btn.classList.contains('del')) vscode.postMessage({type:'delete', id:entry.dataset.id});
  });

  document.getElementById('exportTxt').onclick = () => vscode.postMessage({type:'export', format:'txt', query:search.value});
  document.getElementById('exportJson').onclick = () => vscode.postMessage({type:'export', format:'json', query:search.value});
  document.getElementById('clearAll').onclick = () => { if (confirm('Clear all transcript history?')) vscode.postMessage({type:'clear'}); };
</script></body></html>`;
  }

  dispose(): void {
    this.panel?.dispose();
    this.onInsertEmitter.dispose();
    HistoryPanelView.instance = undefined;
  }
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
