import { describe, it, expect } from 'vitest';
import { validatePack, compareVersions, searchPacks, filterByCategory, sortPacks, BUILTIN_PACKS, MacroPack } from '../snippetMarketplace';

describe('validatePack', () => {
  it('validates a complete pack', () => {
    const result = validatePack({
      name: 'test-pack', version: '1.0.0', description: 'Test', author: 'me',
      category: 'tools', macroCount: 5, downloadUrl: 'https://example.com', tags: ['test'],
    });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('test-pack');
    expect(result!.category).toBe('tools');
  });

  it('defaults category to other for invalid', () => {
    const result = validatePack({ name: 'x', version: '1.0', description: '', author: '', category: 'invalid' });
    expect(result!.category).toBe('other');
  });

  it('rejects missing name', () => {
    expect(validatePack({ version: '1.0', description: '' })).toBeNull();
    expect(validatePack({ name: '', version: '1.0' })).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(validatePack(null)).toBeNull();
    expect(validatePack('string')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('equal versions return 0', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('higher major returns 1', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
  });

  it('lower minor returns -1', () => {
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
  });

  it('handles different length versions', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
  });
});

describe('searchPacks', () => {
  it('returns all for empty query', () => {
    expect(searchPacks(BUILTIN_PACKS, '')).toEqual(BUILTIN_PACKS);
  });

  it('searches by name', () => {
    const result = searchPacks(BUILTIN_PACKS, 'react');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].name).toContain('react');
  });

  it('searches by tag', () => {
    const result = searchPacks(BUILTIN_PACKS, 'docker');
    expect(result.length).toBe(1);
  });

  it('returns empty for no match', () => {
    expect(searchPacks(BUILTIN_PACKS, 'nonexistent')).toHaveLength(0);
  });
});

describe('filterByCategory', () => {
  it('filters by category', () => {
    const result = filterByCategory(BUILTIN_PACKS, 'frameworks');
    expect(result.every(p => p.category === 'frameworks')).toBe(true);
  });

  it('returns empty for unused category', () => {
    expect(filterByCategory(BUILTIN_PACKS, 'accessibility')).toHaveLength(0);
  });
});

describe('sortPacks', () => {
  const packs: MacroPack[] = [
    { name: 'b-pack', version: '1.0.0', description: '', author: '', category: 'other', macroCount: 0, downloadUrl: '', tags: [], installs: 10, rating: 3.0 },
    { name: 'a-pack', version: '2.0.0', description: '', author: '', category: 'other', macroCount: 0, downloadUrl: '', tags: [], installs: 50, rating: 5.0 },
    { name: 'c-pack', version: '1.5.0', description: '', author: '', category: 'other', macroCount: 0, downloadUrl: '', tags: [], installs: 30, rating: 4.0 },
  ];

  it('sorts by popular (installs desc)', () => {
    const result = sortPacks(packs, 'popular');
    expect(result[0].name).toBe('a-pack');
  });

  it('sorts by rating desc', () => {
    const result = sortPacks(packs, 'rating');
    expect(result[0].name).toBe('a-pack');
  });

  it('sorts by name asc', () => {
    const result = sortPacks(packs, 'name');
    expect(result[0].name).toBe('a-pack');
    expect(result[2].name).toBe('c-pack');
  });
});

describe('BUILTIN_PACKS', () => {
  it('has 4 starter packs', () => {
    expect(BUILTIN_PACKS).toHaveLength(4);
  });

  it('all packs have required fields', () => {
    for (const pack of BUILTIN_PACKS) {
      expect(pack.name).toBeTruthy();
      expect(pack.version).toBeTruthy();
      expect(pack.macroCount).toBeGreaterThan(0);
    }
  });
});
