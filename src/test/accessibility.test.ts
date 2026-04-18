import { describe, it, expect, vi } from 'vitest';
import { truncateForAria, isScreenReaderSafe, escapeHtml, ariaAttrs, ARIA_LABELS } from '../accessibility';

// Mock vscode
vi.mock('vscode', () => ({
  window: {
    activeColorTheme: { kind: 1 }, // Light theme
    showInformationMessage: () => {},
  },
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => {
        if (key === 'soundFeedback') { return true; }
        if (key === 'voiceLevelIndicator') { return true; }
        if (key === 'idleAutoStopSeconds') { return 30; }
        return undefined;
      },
    }),
  },
  ColorThemeKind: {
    Light: 1,
    Dark: 2,
    HighContrast: 3,
    HighContrastLight: 4,
  },
}));

describe('truncateForAria', () => {
  it('returns short text unchanged', () => {
    expect(truncateForAria('hello')).toBe('hello');
  });

  it('truncates long text with ellipsis', () => {
    const long = 'a'.repeat(150);
    const result = truncateForAria(long, 100);
    expect(result.length).toBe(101); // 100 chars + ellipsis
    expect(result.endsWith('…')).toBe(true);
  });

  it('respects custom max length', () => {
    expect(truncateForAria('hello world', 5)).toBe('hello…');
  });
});

describe('isScreenReaderSafe', () => {
  it('passes safe keybindings', () => {
    expect(isScreenReaderSafe('Ctrl+Shift+V').safe).toBe(true);
    expect(isScreenReaderSafe('Ctrl+Shift+D').safe).toBe(true);
    expect(isScreenReaderSafe('Alt+V').safe).toBe(true);
  });

  it('warns about Insert key conflicts', () => {
    const result = isScreenReaderSafe('Insert+F5');
    expect(result.safe).toBe(false);
    expect(result.warning).toContain('JAWS');
  });

  it('warns about CapsLock conflicts', () => {
    const result = isScreenReaderSafe('CapsLock+Space');
    expect(result.safe).toBe(false);
    expect(result.warning).toContain('NVDA');
  });
});

describe('escapeHtml', () => {
  it('escapes special characters', () => {
    expect(escapeHtml('<script>"alert"</script>')).toBe('&lt;script&gt;&quot;alert&quot;&lt;/script&gt;');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('ariaAttrs', () => {
  it('generates label attribute', () => {
    expect(ariaAttrs('Start recording')).toBe('aria-label="Start recording"');
  });

  it('includes role when specified', () => {
    expect(ariaAttrs('Status', 'status')).toBe('aria-label="Status" role="status"');
  });

  it('includes aria-live when specified', () => {
    expect(ariaAttrs('Alert', 'alert', 'assertive')).toBe('aria-label="Alert" role="alert" aria-live="assertive"');
  });

  it('escapes HTML in labels', () => {
    expect(ariaAttrs('Say "hello"')).toBe('aria-label="Say &quot;hello&quot;"');
  });
});

describe('ARIA_LABELS', () => {
  it('has labels for all status bar states', () => {
    expect(ARIA_LABELS.idle).toBeTruthy();
    expect(ARIA_LABELS.listening).toBeTruthy();
    expect(ARIA_LABELS.processing).toBeTruthy();
    expect(ARIA_LABELS.dictating).toBeTruthy();
  });

  it('error label includes message', () => {
    expect(ARIA_LABELS.error('mic failed')).toContain('mic failed');
  });

  it('sent label includes transcript', () => {
    expect(ARIA_LABELS.sent('hello world')).toContain('hello world');
  });

  it('has labels for all controls', () => {
    expect(ARIA_LABELS.startButton).toBeTruthy();
    expect(ARIA_LABELS.stopButton).toBeTruthy();
    expect(ARIA_LABELS.historyButton).toBeTruthy();
  });
});
