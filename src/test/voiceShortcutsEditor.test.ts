import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceShortcutsEditor } from '../voiceShortcutsEditor';

describe('VoiceShortcutsEditor', () => {
  let editor: VoiceShortcutsEditor;

  beforeEach(() => {
    editor = new VoiceShortcutsEditor();
  });

  it('starts with no shortcuts', () => {
    expect(editor.count).toBe(0);
    expect(editor.getShortcuts()).toHaveLength(0);
  });

  it('createShortcut adds a new shortcut', () => {
    const shortcut = editor.createShortcut({
      phrase: 'format code',
      action: 'command',
      commandId: 'editor.action.formatDocument',
      description: 'Format the current document',
      category: 'formatting',
      enabled: true,
    });

    expect(shortcut.id).toBeTruthy();
    expect(shortcut.phrase).toBe('format code');
    expect(shortcut.builtIn).toBe(false);
    expect(shortcut.usageCount).toBe(0);
    expect(editor.count).toBe(1);
  });

  it('updateShortcut modifies fields', () => {
    const shortcut = editor.createShortcut({
      phrase: 'test',
      action: 'insert',
      text: 'hello',
      description: 'Test shortcut',
      category: 'custom',
      enabled: true,
    });

    expect(editor.updateShortcut(shortcut.id, { phrase: 'updated', text: 'world' })).toBe(true);
    const updated = editor.getShortcuts().find(s => s.id === shortcut.id);
    expect(updated!.phrase).toBe('updated');
    expect(updated!.text).toBe('world');
  });

  it('updateShortcut returns false for unknown id', () => {
    expect(editor.updateShortcut('nonexistent', { phrase: 'x' })).toBe(false);
  });

  it('deleteShortcut removes custom shortcut', () => {
    const shortcut = editor.createShortcut({
      phrase: 'temp',
      action: 'insert',
      text: 'x',
      description: 'Temp',
      category: 'custom',
      enabled: true,
    });

    expect(editor.deleteShortcut(shortcut.id)).toBe(true);
    expect(editor.count).toBe(0);
  });

  it('deleteShortcut returns false for unknown id', () => {
    expect(editor.deleteShortcut('nonexistent')).toBe(false);
  });

  it('toggleEnabled flips state', () => {
    const shortcut = editor.createShortcut({
      phrase: 'test',
      action: 'insert',
      text: 'hi',
      description: 'Test',
      category: 'custom',
      enabled: true,
    });

    editor.toggleEnabled(shortcut.id);
    expect(editor.getShortcuts()[0].enabled).toBe(false);

    editor.toggleEnabled(shortcut.id);
    expect(editor.getShortcuts()[0].enabled).toBe(true);
  });

  it('toggleEnabled returns false for unknown id', () => {
    expect(editor.toggleEnabled('nonexistent')).toBe(false);
  });

  it('recordUsage increments count', () => {
    const shortcut = editor.createShortcut({
      phrase: 'test',
      action: 'insert',
      text: 'hi',
      description: 'Test',
      category: 'custom',
      enabled: true,
    });

    editor.recordUsage(shortcut.id);
    editor.recordUsage(shortcut.id);
    editor.recordUsage(shortcut.id);

    const updated = editor.getShortcuts()[0];
    expect(updated.usageCount).toBe(3);
    expect(updated.lastUsedAt).toBeGreaterThan(0);
  });

  it('testPhrase finds matching shortcut', () => {
    editor.createShortcut({
      phrase: 'deploy app',
      action: 'command',
      commandId: 'myext.deploy',
      description: 'Deploy',
      category: 'custom',
      enabled: true,
    });

    const result = editor.testPhrase('deploy app');
    expect(result).toBeDefined();
    expect(result!.phrase).toBe('deploy app');
  });

  it('testPhrase is case-insensitive', () => {
    editor.createShortcut({
      phrase: 'Deploy App',
      action: 'command',
      commandId: 'myext.deploy',
      description: 'Deploy',
      category: 'custom',
      enabled: true,
    });

    expect(editor.testPhrase('deploy app')).toBeDefined();
    expect(editor.testPhrase('DEPLOY APP')).toBeDefined();
  });

  it('testPhrase returns undefined for disabled shortcuts', () => {
    const shortcut = editor.createShortcut({
      phrase: 'test',
      action: 'insert',
      text: 'hi',
      description: 'Test',
      category: 'custom',
      enabled: false,
    });

    expect(editor.testPhrase('test')).toBeUndefined();
  });

  it('testPhrase returns undefined for no match', () => {
    expect(editor.testPhrase('nonexistent command')).toBeUndefined();
  });

  it('getFiltered filters by query', () => {
    editor.createShortcut({ phrase: 'format code', action: 'command', commandId: 'x', description: 'Format', category: 'formatting', enabled: true });
    editor.createShortcut({ phrase: 'save file', action: 'command', commandId: 'y', description: 'Save', category: 'editing', enabled: true });

    const results = editor.getFiltered({ query: 'format' });
    expect(results).toHaveLength(1);
    expect(results[0].phrase).toBe('format code');
  });

  it('getFiltered filters by category', () => {
    editor.createShortcut({ phrase: 'a', action: 'insert', text: 'x', description: 'A', category: 'formatting', enabled: true });
    editor.createShortcut({ phrase: 'b', action: 'insert', text: 'y', description: 'B', category: 'editing', enabled: true });
    editor.createShortcut({ phrase: 'c', action: 'insert', text: 'z', description: 'C', category: 'formatting', enabled: true });

    const results = editor.getFiltered({ category: 'formatting' });
    expect(results).toHaveLength(2);
  });

  it('getFiltered filters by enabledOnly', () => {
    editor.createShortcut({ phrase: 'a', action: 'insert', text: 'x', description: 'A', category: 'custom', enabled: true });
    editor.createShortcut({ phrase: 'b', action: 'insert', text: 'y', description: 'B', category: 'custom', enabled: false });

    const results = editor.getFiltered({ enabledOnly: true });
    expect(results).toHaveLength(1);
    expect(results[0].phrase).toBe('a');
  });

  it('getCategories returns default + custom categories', () => {
    editor.createShortcut({ phrase: 'a', action: 'insert', text: 'x', description: 'A', category: 'my-custom-cat', enabled: true });

    const categories = editor.getCategories();
    expect(categories).toContain('punctuation');
    expect(categories).toContain('editing');
    expect(categories).toContain('my-custom-cat');
  });

  it('exportShortcuts returns JSON', () => {
    editor.createShortcut({ phrase: 'test', action: 'insert', text: 'hi', description: 'Test', category: 'custom', enabled: true });

    const json = editor.exportShortcuts();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe('1.0');
    expect(parsed.shortcuts).toHaveLength(1);
    expect(parsed.shortcuts[0].phrase).toBe('test');
  });

  it('importShortcuts adds shortcuts from JSON', () => {
    const json = JSON.stringify({
      version: '1.0',
      shortcuts: [
        { phrase: 'imported', action: 'insert', text: 'hello', description: 'Imported', category: 'custom', enabled: true },
        { phrase: 'imported2', action: 'command', commandId: 'test', description: 'Imported 2', category: 'custom', enabled: true },
      ],
    });

    const count = editor.importShortcuts(json);
    expect(count).toBe(2);
    expect(editor.count).toBe(2);
  });

  it('importShortcuts returns 0 for invalid JSON', () => {
    expect(editor.importShortcuts('not json')).toBe(0);
    expect(editor.importShortcuts('{}')).toBe(0);
  });

  it('getStats returns correct counts', () => {
    editor.createShortcut({ phrase: 'a', action: 'insert', text: 'x', description: 'A', category: 'custom', enabled: true });
    editor.createShortcut({ phrase: 'b', action: 'insert', text: 'y', description: 'B', category: 'custom', enabled: false });

    const stats = editor.getStats();
    expect(stats.total).toBe(2);
    expect(stats.enabled).toBe(1);
    expect(stats.custom).toBe(2);
    expect(stats.builtIn).toBe(0);
  });
});
