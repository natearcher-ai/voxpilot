import { describe, it, expect, vi } from 'vitest';
import { LanguageHistory, checkLanguageModelCompat, suggestModelForLanguage, formatLanguageDisplay } from '../multiLanguage';

// Mock vscode
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => {
        if (key === 'languageProfiles') { return []; }
        return undefined;
      },
      update: async () => {},
    }),
  },
}));

describe('LanguageHistory', () => {
  it('starts empty', () => {
    const h = new LanguageHistory();
    expect(h.current).toBeUndefined();
    expect(h.previous).toBeUndefined();
    expect(h.all).toEqual([]);
  });

  it('tracks current and previous', () => {
    const h = new LanguageHistory();
    h.push('en');
    h.push('es');
    expect(h.current).toBe('es');
    expect(h.previous).toBe('en');
  });

  it('deduplicates entries', () => {
    const h = new LanguageHistory();
    h.push('en');
    h.push('es');
    h.push('en');
    expect(h.all).toEqual(['en', 'es']);
  });

  it('respects max size', () => {
    const h = new LanguageHistory(3);
    h.push('en');
    h.push('es');
    h.push('fr');
    h.push('de');
    expect(h.all).toEqual(['de', 'fr', 'es']);
  });

  it('clear resets history', () => {
    const h = new LanguageHistory();
    h.push('en');
    h.clear();
    expect(h.all).toEqual([]);
  });

  it('load/toJSON round-trips', () => {
    const h = new LanguageHistory();
    h.push('en');
    h.push('es');
    const data = h.toJSON();
    const h2 = new LanguageHistory();
    h2.load(data);
    expect(h2.all).toEqual(['es', 'en']);
  });
});

describe('checkLanguageModelCompat', () => {
  it('auto and English are always compatible', () => {
    expect(checkLanguageModelCompat('auto', 'moonshine-base').compatible).toBe(true);
    expect(checkLanguageModelCompat('en', 'moonshine-base').compatible).toBe(true);
  });

  it('non-English with English-only model is incompatible', () => {
    const result = checkLanguageModelCompat('es', 'moonshine-base');
    expect(result.compatible).toBe(false);
    expect(result.suggestion).toContain('Whisper');
  });

  it('non-English with Whisper model is compatible', () => {
    expect(checkLanguageModelCompat('es', 'whisper-base').compatible).toBe(true);
    expect(checkLanguageModelCompat('zh', 'whisper-medium').compatible).toBe(true);
  });
});

describe('suggestModelForLanguage', () => {
  it('suggests whisper-base for European languages', () => {
    expect(suggestModelForLanguage('es')).toBe('whisper-base');
    expect(suggestModelForLanguage('fr')).toBe('whisper-base');
  });

  it('suggests whisper-medium for CJK and complex scripts', () => {
    expect(suggestModelForLanguage('zh')).toBe('whisper-medium');
    expect(suggestModelForLanguage('ja')).toBe('whisper-medium');
    expect(suggestModelForLanguage('ar')).toBe('whisper-medium');
  });
});

describe('formatLanguageDisplay', () => {
  it('shows flag + name for known languages', () => {
    expect(formatLanguageDisplay('en')).toBe('🇬🇧 English');
    expect(formatLanguageDisplay('es')).toBe('🇪🇸 Spanish');
    expect(formatLanguageDisplay('ja')).toBe('🇯🇵 Japanese');
  });

  it('shows globe for unknown languages', () => {
    const result = formatLanguageDisplay('xx');
    expect(result).toContain('🌐');
  });
});
