import { describe, it, expect, beforeEach } from 'vitest';
import { L10n, interpolate, SUPPORTED_LOCALES, LOCALE_INFO } from '../localization';

describe('interpolate', () => {
  it('replaces single variable', () => {
    expect(interpolate('Hello {name}', { name: 'World' })).toBe('Hello World');
  });

  it('replaces multiple variables', () => {
    expect(interpolate('{count} words in {time}ms', { count: 50, time: 100 })).toBe('50 words in 100ms');
  });

  it('replaces same variable multiple times', () => {
    expect(interpolate('{x} + {x} = {y}', { x: 2, y: 4 })).toBe('2 + 2 = 4');
  });

  it('leaves unmatched placeholders', () => {
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}');
  });

  it('handles empty template', () => {
    expect(interpolate('', { x: 1 })).toBe('');
  });
});

describe('L10n', () => {
  let l10n: L10n;

  beforeEach(() => {
    l10n = new L10n();
  });

  it('defaults to English', () => {
    expect(l10n.getLocale()).toBe('en');
  });

  it('setLocale changes locale', () => {
    l10n.setLocale('es');
    expect(l10n.getLocale()).toBe('es');
  });

  it('setLocale ignores unsupported locales', () => {
    l10n.setLocale('xx' as any);
    expect(l10n.getLocale()).toBe('en');
  });

  it('t returns English string by default', () => {
    expect(l10n.t('status.idle')).toBe('VoxPilot: Ready');
    expect(l10n.t('status.listening')).toBe('VoxPilot: Listening...');
  });

  it('t returns translated string for set locale', () => {
    l10n.setLocale('es');
    expect(l10n.t('status.idle')).toBe('VoxPilot: Listo');
    expect(l10n.t('status.listening')).toBe('VoxPilot: Escuchando...');
  });

  it('t falls back to English for missing translations', () => {
    l10n.setLocale('es');
    // A key that exists in EN but not ES
    const result = l10n.t('command.clearCache');
    expect(result).toBe('Clear Model Cache'); // English fallback
  });

  it('t returns key for completely unknown keys', () => {
    expect(l10n.t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('t interpolates variables', () => {
    const result = l10n.t('notify.modelLoaded', { model: 'moonshine-base' });
    expect(result).toBe('Model loaded: moonshine-base');
  });

  it('t interpolates in translated strings', () => {
    l10n.setLocale('es');
    const result = l10n.t('notify.modelLoaded', { model: 'whisper-small' });
    expect(result).toBe('Modelo cargado: whisper-small');
  });

  it('French translations work', () => {
    l10n.setLocale('fr');
    expect(l10n.t('status.idle')).toBe('VoxPilot : Prêt');
    expect(l10n.t('notify.recordingStarted')).toBe('Enregistrement démarré');
  });

  it('German translations work', () => {
    l10n.setLocale('de');
    expect(l10n.t('status.idle')).toBe('VoxPilot: Bereit');
    expect(l10n.t('notify.recordingStarted')).toBe('Aufnahme gestartet');
  });

  it('Japanese translations work', () => {
    l10n.setLocale('ja');
    expect(l10n.t('status.idle')).toBe('VoxPilot: 準備完了');
    expect(l10n.t('notify.recordingStarted')).toBe('録音開始');
  });

  it('Chinese translations work', () => {
    l10n.setLocale('zh');
    expect(l10n.t('status.idle')).toBe('VoxPilot：就绪');
    expect(l10n.t('notify.recordingStarted')).toBe('录音已开始');
  });

  it('addStrings adds custom overrides', () => {
    l10n.addStrings({ 'status.idle': 'Custom Idle Message' });
    expect(l10n.t('status.idle')).toBe('Custom Idle Message');
  });

  it('custom strings take priority over locale', () => {
    l10n.setLocale('es');
    l10n.addStrings({ 'status.idle': 'Override' });
    expect(l10n.t('status.idle')).toBe('Override');
  });

  it('getKeys returns all English keys', () => {
    const keys = l10n.getKeys();
    expect(keys.length).toBeGreaterThan(30);
    expect(keys).toContain('status.idle');
    expect(keys).toContain('notify.recordingStarted');
    expect(keys).toContain('error.audioCapture');
  });

  it('getCompleteness returns 100 for English', () => {
    expect(l10n.getCompleteness('en')).toBe(100);
  });

  it('getCompleteness returns less for other locales', () => {
    const esCompleteness = l10n.getCompleteness('es');
    expect(esCompleteness).toBeGreaterThan(20);
    expect(esCompleteness).toBeLessThan(100);
  });

  it('getAvailableLocales returns all locales with info', () => {
    const locales = l10n.getAvailableLocales();
    expect(locales).toHaveLength(SUPPORTED_LOCALES.length);
    expect(locales.every(l => l.code && l.name && l.nativeName)).toBe(true);
  });

  it('hasKey returns true for existing keys', () => {
    expect(l10n.hasKey('status.idle')).toBe(true);
    expect(l10n.hasKey('notify.recordingStarted')).toBe(true);
  });

  it('hasKey returns false for unknown keys', () => {
    expect(l10n.hasKey('nonexistent')).toBe(false);
  });

  it('stringCount returns total English strings', () => {
    expect(l10n.stringCount).toBeGreaterThan(30);
  });

  it('detectLocale returns a supported locale', () => {
    const detected = l10n.detectLocale();
    expect(SUPPORTED_LOCALES).toContain(detected);
  });
});

describe('LOCALE_INFO', () => {
  it('all locales have complete info', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const info = LOCALE_INFO[locale];
      expect(info.code).toBe(locale);
      expect(info.name).toBeTruthy();
      expect(info.nativeName).toBeTruthy();
      expect(info.direction).toBe('ltr');
      expect(info.completeness).toBeGreaterThan(0);
    }
  });
});
