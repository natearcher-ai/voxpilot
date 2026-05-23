/**
 * Voice Shortcuts Editor — visual UI to create, edit, and test custom voice commands.
 *
 * Provides a webview panel where users can:
 *   - Browse all registered voice commands (built-in + custom)
 *   - Create new custom commands with a form UI
 *   - Edit existing commands (phrase, action, text)
 *   - Test commands by typing the trigger phrase
 *   - Enable/disable individual commands
 *   - Import/export command sets as JSON
 *   - Search and filter commands by category
 *   - See usage statistics per command
 *   - Drag-and-drop reorder priority
 *
 * Enable via `voxpilot.shortcutsEditor` setting (default: true).
 */

import * as vscode from 'vscode';

/** Command entry for the editor */
export interface ShortcutEntry {
  /** Unique ID */
  id: string;
  /** Trigger phrase */
  phrase: string;
  /** Action type */
  action: 'insert' | 'command' | 'snippet' | 'macro';
  /** Replacement text (for insert) */
  text?: string;
  /** VS Code command ID (for command) */
  commandId?: string;
  /** Macro ID (for macro) */
  macroId?: string;
  /** Description */
  description: string;
  /** Category for organization */
  category: string;
  /** Whether enabled */
  enabled: boolean;
  /** Usage count */
  usageCount: number;
  /** Whether this is a built-in command */
  builtIn: boolean;
  /** Last used timestamp */
  lastUsedAt: number;
}

/** Filter options for the editor */
export interface ShortcutFilter {
  query?: string;
  category?: string;
  action?: string;
  enabledOnly?: boolean;
  builtInOnly?: boolean;
  customOnly?: boolean;
}

/** Editor state */
export interface EditorState {
  shortcuts: ShortcutEntry[];
  categories: string[];
  filter: ShortcutFilter;
  selectedId: string | null;
}

/** Default categories */
const DEFAULT_CATEGORIES = [
  'punctuation',
  'editing',
  'navigation',
  'formatting',
  'git',
  'terminal',
  'ai',
  'documentation',
  'testing',
  'custom',
];

/**
 * Voice Shortcuts Editor — manages the webview and shortcut CRUD.
 */
export class VoiceShortcutsEditor {
  private shortcuts: Map<string, ShortcutEntry> = new Map();
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext | undefined;
  private filter: ShortcutFilter = {};

  /** Initialize with extension context */
  init(extensionContext: vscode.ExtensionContext): void {
    this.context = extensionContext;
    this.loadShortcuts();
  }

  /** Get all shortcuts */
  getShortcuts(): ShortcutEntry[] {
    return [...this.shortcuts.values()];
  }

  /** Get filtered shortcuts */
  getFiltered(filter?: ShortcutFilter): ShortcutEntry[] {
    const f = filter || this.filter;
    let results = [...this.shortcuts.values()];

    if (f.query) {
      const q = f.query.toLowerCase();
      results = results.filter(s =>
        s.phrase.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
      );
    }

    if (f.category) {
      results = results.filter(s => s.category === f.category);
    }

    if (f.action) {
      results = results.filter(s => s.action === f.action);
    }

    if (f.enabledOnly) {
      results = results.filter(s => s.enabled);
    }

    if (f.builtInOnly) {
      results = results.filter(s => s.builtIn);
    }

    if (f.customOnly) {
      results = results.filter(s => !s.builtIn);
    }

    return results;
  }

  /** Get shortcut count */
  get count(): number {
    return this.shortcuts.size;
  }

  /** Get available categories */
  getCategories(): string[] {
    const custom = new Set<string>();
    for (const s of this.shortcuts.values()) {
      custom.add(s.category);
    }
    return [...new Set([...DEFAULT_CATEGORIES, ...custom])].sort();
  }

  /** Create a new shortcut */
  createShortcut(entry: Omit<ShortcutEntry, 'id' | 'usageCount' | 'builtIn' | 'lastUsedAt'>): ShortcutEntry {
    const shortcut: ShortcutEntry = {
      ...entry,
      id: `shortcut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      usageCount: 0,
      builtIn: false,
      lastUsedAt: 0,
    };

    this.shortcuts.set(shortcut.id, shortcut);
    this.saveShortcuts();
    return shortcut;
  }

  /** Update an existing shortcut */
  updateShortcut(id: string, updates: Partial<Omit<ShortcutEntry, 'id' | 'builtIn'>>): boolean {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut) return false;

    Object.assign(shortcut, updates);
    this.saveShortcuts();
    return true;
  }

  /** Delete a shortcut (custom only) */
  deleteShortcut(id: string): boolean {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut || shortcut.builtIn) return false;

    this.shortcuts.delete(id);
    this.saveShortcuts();
    return true;
  }

  /** Toggle shortcut enabled state */
  toggleEnabled(id: string): boolean {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut) return false;

    shortcut.enabled = !shortcut.enabled;
    this.saveShortcuts();
    return true;
  }

  /** Record usage of a shortcut */
  recordUsage(id: string): void {
    const shortcut = this.shortcuts.get(id);
    if (shortcut) {
      shortcut.usageCount++;
      shortcut.lastUsedAt = Date.now();
      this.saveShortcuts();
    }
  }

  /** Test a phrase against registered shortcuts */
  testPhrase(phrase: string): ShortcutEntry | undefined {
    const lower = phrase.toLowerCase().trim();
    return [...this.shortcuts.values()].find(
      s => s.enabled && s.phrase.toLowerCase() === lower,
    );
  }

  /** Export shortcuts as JSON */
  exportShortcuts(customOnly: boolean = true): string {
    const toExport = customOnly
      ? [...this.shortcuts.values()].filter(s => !s.builtIn)
      : [...this.shortcuts.values()];

    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      version: '1.0',
      shortcuts: toExport,
    }, null, 2);
  }

  /** Import shortcuts from JSON */
  importShortcuts(json: string): number {
    try {
      const data = JSON.parse(json);
      const shortcuts = data.shortcuts as ShortcutEntry[];
      if (!Array.isArray(shortcuts)) return 0;

      let imported = 0;
      for (const s of shortcuts) {
        if (!s.phrase || !s.action) continue;

        // Generate new ID to avoid conflicts
        const newId = `shortcut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        this.shortcuts.set(newId, {
          ...s,
          id: newId,
          builtIn: false,
          usageCount: 0,
          lastUsedAt: 0,
        });
        imported++;
      }

      if (imported > 0) this.saveShortcuts();
      return imported;
    } catch {
      return 0;
    }
  }

  /** Get usage statistics */
  getStats(): { total: number; enabled: number; custom: number; builtIn: number; topUsed: ShortcutEntry[] } {
    const all = [...this.shortcuts.values()];
    return {
      total: all.length,
      enabled: all.filter(s => s.enabled).length,
      custom: all.filter(s => !s.builtIn).length,
      builtIn: all.filter(s => s.builtIn).length,
      topUsed: all.sort((a, b) => b.usageCount - a.usageCount).slice(0, 10),
    };
  }

  /** Show the editor panel */
  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'voxpilotShortcutsEditor',
      'VoxPilot Voice Shortcuts',
      vscode.ViewColumn.One,
      { enableScripts: true },
    );

    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg));
    this.updatePanel();
  }

  private handleMessage(msg: { command: string; data?: unknown }): void {
    switch (msg.command) {
      case 'create':
        this.createShortcut(msg.data as Omit<ShortcutEntry, 'id' | 'usageCount' | 'builtIn' | 'lastUsedAt'>);
        break;
      case 'update':
        const { id, ...updates } = msg.data as { id: string } & Partial<ShortcutEntry>;
        this.updateShortcut(id, updates);
        break;
      case 'delete':
        this.deleteShortcut((msg.data as { id: string }).id);
        break;
      case 'toggle':
        this.toggleEnabled((msg.data as { id: string }).id);
        break;
      case 'test':
        const result = this.testPhrase((msg.data as { phrase: string }).phrase);
        this.panel?.webview.postMessage({ type: 'testResult', data: result || null });
        break;
      case 'filter':
        this.filter = msg.data as ShortcutFilter;
        break;
    }
    this.updatePanel();
  }

  private updatePanel(): void {
    if (!this.panel) return;
    const state: EditorState = {
      shortcuts: this.getFiltered(),
      categories: this.getCategories(),
      filter: this.filter,
      selectedId: null,
    };
    this.panel.webview.postMessage({ type: 'state', data: state });
  }

  private loadShortcuts(): void {
    if (!this.context) return;
    const saved = this.context.globalState.get<Record<string, ShortcutEntry>>('voiceShortcuts');
    if (saved) {
      this.shortcuts = new Map(Object.entries(saved));
    }
  }

  private saveShortcuts(): void {
    if (!this.context) return;
    this.context.globalState.update('voiceShortcuts', Object.fromEntries(this.shortcuts));
  }
}

/** Singleton instance */
export const voiceShortcutsEditor = new VoiceShortcutsEditor();
