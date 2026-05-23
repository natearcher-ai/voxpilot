import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceJournal, parseJournalCommand } from '../voiceJournal';

describe('parseJournalCommand', () => {
  it('parses note with text', () => {
    const result = parseJournalCommand('note remember to refactor the auth module');
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('note');
    expect(result!.text).toBe('remember to refactor the auth module');
  });

  it('parses todo', () => {
    const result = parseJournalCommand('todo add error handling to the API');
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('todo');
    expect(result!.text).toBe('add error handling to the API');
  });

  it('parses bug', () => {
    const result = parseJournalCommand('bug null pointer when user is not logged in');
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('bug');
    expect(result!.text).toBe('null pointer when user is not logged in');
  });

  it('parses idea', () => {
    const result = parseJournalCommand('idea use websockets for real-time updates');
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('idea');
    expect(result!.text).toBe('use websockets for real-time updates');
  });

  it('parses question', () => {
    const result = parseJournalCommand('question should we use Redis or Memcached');
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('question');
    expect(result!.text).toBe('should we use Redis or Memcached');
  });

  it('parses decision', () => {
    const result = parseJournalCommand('decision going with PostgreSQL over MongoDB');
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('decision');
    expect(result!.text).toBe('going with PostgreSQL over MongoDB');
  });

  it('parses journal as note', () => {
    const result = parseJournalCommand('journal spent 2 hours debugging the cache issue');
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('note');
    expect(result!.text).toBe('spent 2 hours debugging the cache issue');
  });

  it('returns null for non-journal text', () => {
    const result = parseJournalCommand('hello world this is normal speech');
    expect(result).toBeNull();
  });

  it('handles phrase without text', () => {
    const result = parseJournalCommand('todo');
    expect(result).not.toBeNull();
    expect(result!.tag).toBe('todo');
    expect(result!.text).toBe('');
  });
});

describe('VoiceJournal', () => {
  let journal: VoiceJournal;

  beforeEach(() => {
    journal = new VoiceJournal();
  });

  it('starts empty', () => {
    expect(journal.count).toBe(0);
    expect(journal.getEntries()).toHaveLength(0);
  });

  it('addEntry creates entry with correct fields', () => {
    const entry = journal.addEntry('test note', 'note', { file: 'src/app.ts', line: 42 });
    expect(entry.id).toBeTruthy();
    expect(entry.text).toBe('test note');
    expect(entry.tag).toBe('note');
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.context.file).toBe('src/app.ts');
    expect(entry.context.line).toBe(42);
  });

  it('addEntry increments count', () => {
    journal.addEntry('first', 'note');
    journal.addEntry('second', 'todo');
    expect(journal.count).toBe(2);
  });

  it('getEntries returns all entries', () => {
    journal.addEntry('one', 'note');
    journal.addEntry('two', 'bug');
    journal.addEntry('three', 'idea');
    expect(journal.getEntries()).toHaveLength(3);
  });

  it('getEntriesByTag filters correctly', () => {
    journal.addEntry('note 1', 'note');
    journal.addEntry('bug 1', 'bug');
    journal.addEntry('note 2', 'note');
    journal.addEntry('bug 2', 'bug');

    expect(journal.getEntriesByTag('note')).toHaveLength(2);
    expect(journal.getEntriesByTag('bug')).toHaveLength(2);
    expect(journal.getEntriesByTag('idea')).toHaveLength(0);
  });

  it('getEntriesForFile filters by file', () => {
    journal.addEntry('in app', 'note', { file: 'src/app.ts' });
    journal.addEntry('in utils', 'note', { file: 'src/utils.ts' });
    journal.addEntry('also in app', 'todo', { file: 'src/app.ts' });

    expect(journal.getEntriesForFile('src/app.ts')).toHaveLength(2);
    expect(journal.getEntriesForFile('src/utils.ts')).toHaveLength(1);
  });

  it('getEntriesForBranch filters by branch', () => {
    journal.addEntry('on main', 'note', { branch: 'main' });
    journal.addEntry('on feature', 'note', { branch: 'feature/auth' });
    journal.addEntry('also main', 'todo', { branch: 'main' });

    expect(journal.getEntriesForBranch('main')).toHaveLength(2);
    expect(journal.getEntriesForBranch('feature/auth')).toHaveLength(1);
  });

  it('getTodayEntries returns only today', () => {
    journal.addEntry('today note', 'note');
    // All entries added now should be "today"
    expect(journal.getTodayEntries()).toHaveLength(1);
  });

  it('deleteEntry removes by id', () => {
    const entry = journal.addEntry('to delete', 'note');
    expect(journal.count).toBe(1);

    const result = journal.deleteEntry(entry.id);
    expect(result).toBe(true);
    expect(journal.count).toBe(0);
  });

  it('deleteEntry returns false for unknown id', () => {
    expect(journal.deleteEntry('nonexistent')).toBe(false);
  });

  it('clearAll removes everything', () => {
    journal.addEntry('one', 'note');
    journal.addEntry('two', 'bug');
    journal.clearAll();
    expect(journal.count).toBe(0);
  });

  it('getStats returns correct counts', () => {
    journal.addEntry('n1', 'note');
    journal.addEntry('n2', 'note');
    journal.addEntry('t1', 'todo');
    journal.addEntry('b1', 'bug');

    const stats = journal.getStats();
    expect(stats.note).toBe(2);
    expect(stats.todo).toBe(1);
    expect(stats.bug).toBe(1);
    expect(stats.idea).toBe(0);
  });

  it('exportAsMarkdown produces valid markdown', () => {
    journal.addEntry('test note', 'note', { file: 'src/app.ts', line: 10, branch: 'main' });
    journal.addEntry('fix login', 'bug', { file: 'src/auth.ts' });

    const md = journal.exportAsMarkdown();
    expect(md).toContain('# Voice Journal');
    expect(md).toContain('**Entries:** 2');
    expect(md).toContain('test note');
    expect(md).toContain('fix login');
    expect(md).toContain('📝');
    expect(md).toContain('🐛');
    expect(md).toContain('src/app.ts:10');
    expect(md).toContain('branch: main');
  });

  it('exportAsMarkdown handles empty journal', () => {
    const md = journal.exportAsMarkdown();
    expect(md).toContain('# Voice Journal');
    expect(md).toContain('**Entries:** 0');
  });

  it('entries have unique ids', () => {
    const e1 = journal.addEntry('first', 'note');
    const e2 = journal.addEntry('second', 'note');
    expect(e1.id).not.toBe(e2.id);
  });
});
