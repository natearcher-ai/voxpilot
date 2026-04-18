import { describe, it, expect } from 'vitest';
import { formatRelativeTime, generateEntryId, filterEntries, exportAsText, exportAsJSON, HistoryEntry } from '../historyPanel';

describe('formatRelativeTime', () => {
  const now = 1713460000000; // fixed reference

  it('shows "just now" for < 30s', () => {
    expect(formatRelativeTime(now - 10000, now)).toBe('just now');
  });

  it('shows seconds for < 60s', () => {
    expect(formatRelativeTime(now - 45000, now)).toBe('45s ago');
  });

  it('shows minutes for < 60min', () => {
    expect(formatRelativeTime(now - 300000, now)).toBe('5 min ago');
  });

  it('shows hours for < 24h', () => {
    expect(formatRelativeTime(now - 7200000, now)).toBe('2 hours ago');
    expect(formatRelativeTime(now - 3600000, now)).toBe('1 hour ago');
  });

  it('shows "yesterday" for 1 day', () => {
    expect(formatRelativeTime(now - 86400000, now)).toBe('yesterday');
  });

  it('shows "N days ago" for 2-6 days', () => {
    expect(formatRelativeTime(now - 3 * 86400000, now)).toBe('3 days ago');
  });

  it('shows date for 7+ days', () => {
    const result = formatRelativeTime(now - 10 * 86400000, now);
    expect(result).toMatch(/\w+ \d+/); // e.g. "Apr 8"
  });
});

describe('generateEntryId', () => {
  it('generates unique IDs', () => {
    const id1 = generateEntryId();
    const id2 = generateEntryId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^h_\d+_\w+$/);
  });
});

describe('filterEntries', () => {
  const entries: HistoryEntry[] = [
    { id: '1', text: 'hello world', timestamp: 1000 },
    { id: '2', text: 'foo bar baz', timestamp: 2000 },
    { id: '3', text: 'Hello again', timestamp: 3000 },
  ];

  it('returns all entries for empty query', () => {
    expect(filterEntries(entries, '')).toEqual(entries);
    expect(filterEntries(entries, '  ')).toEqual(entries);
  });

  it('filters case-insensitively', () => {
    const result = filterEntries(entries, 'hello');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('3');
  });

  it('returns empty for no match', () => {
    expect(filterEntries(entries, 'xyz')).toHaveLength(0);
  });
});

describe('exportAsText', () => {
  it('formats entries with timestamps', () => {
    const entries: HistoryEntry[] = [
      { id: '1', text: 'hello', timestamp: 1713460000000 },
    ];
    const result = exportAsText(entries);
    expect(result).toContain('hello');
    expect(result).toContain('2024'); // year from timestamp
  });
});

describe('exportAsJSON', () => {
  it('produces valid JSON', () => {
    const entries: HistoryEntry[] = [
      { id: '1', text: 'hello', timestamp: 1000 },
    ];
    const result = exportAsJSON(entries);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].text).toBe('hello');
  });
});
