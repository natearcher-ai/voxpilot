import { describe, it, expect } from 'vitest';
import {
  matchAuditCommand,
  checkAltText,
  checkHeadings,
  checkLabels,
  checkAria,
  checkContrast,
  checkStructure,
  checkKeyboard,
  checkMedia,
  runFullAudit,
  isAuditable,
  generateReport,
} from '../accessibilityAudit';

describe('matchAuditCommand', () => {
  it('matches full audit phrases', () => {
    expect(matchAuditCommand('check accessibility')).toEqual({ type: 'audit-full', trigger: 'check accessibility' });
    expect(matchAuditCommand('accessibility audit')).toEqual({ type: 'audit-full', trigger: 'accessibility audit' });
    expect(matchAuditCommand('wcag check')).toEqual({ type: 'audit-full', trigger: 'wcag check' });
    expect(matchAuditCommand('a11y check')).toEqual({ type: 'audit-full', trigger: 'a11y check' });
  });

  it('matches category-specific phrases', () => {
    expect(matchAuditCommand('check contrast')).toEqual({ type: 'audit-contrast', trigger: 'check contrast' });
    expect(matchAuditCommand('check alt text')).toEqual({ type: 'audit-alt', trigger: 'check alt text' });
    expect(matchAuditCommand('check aria')).toEqual({ type: 'audit-aria', trigger: 'check aria' });
    expect(matchAuditCommand('check headings')).toEqual({ type: 'audit-headings', trigger: 'check headings' });
    expect(matchAuditCommand('check labels')).toEqual({ type: 'audit-labels', trigger: 'check labels' });
  });

  it('matches action phrases', () => {
    expect(matchAuditCommand('clear accessibility')).toEqual({ type: 'clear', trigger: 'clear accessibility' });
    expect(matchAuditCommand('fix accessibility')).toEqual({ type: 'fix', trigger: 'fix accessibility' });
    expect(matchAuditCommand('accessibility report')).toEqual({ type: 'report', trigger: 'accessibility report' });
  });

  it('is case-insensitive', () => {
    expect(matchAuditCommand('Check Accessibility')).toEqual({ type: 'audit-full', trigger: 'check accessibility' });
    expect(matchAuditCommand('WCAG CHECK')).toEqual({ type: 'audit-full', trigger: 'wcag check' });
  });

  it('returns null for non-matching text', () => {
    expect(matchAuditCommand('hello world')).toBeNull();
    expect(matchAuditCommand('check the weather')).toBeNull();
    expect(matchAuditCommand('')).toBeNull();
  });

  it('handles extra whitespace', () => {
    expect(matchAuditCommand('  check  accessibility  ')).toEqual({ type: 'audit-full', trigger: 'check accessibility' });
  });
});

describe('checkAltText', () => {
  it('flags img without alt', () => {
    const issues = checkAltText('<img src="photo.jpg">');
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('1.1.1');
    expect(issues[0].severity).toBe('error');
    expect(issues[0].category).toBe('alt-text');
  });

  it('passes img with alt', () => {
    const issues = checkAltText('<img src="photo.jpg" alt="A nice photo">');
    expect(issues).toHaveLength(0);
  });

  it('allows empty alt with role=presentation', () => {
    const issues = checkAltText('<img src="divider.png" alt="" role="presentation">');
    expect(issues).toHaveLength(0);
  });

  it('flags empty alt without role=presentation as info', () => {
    const issues = checkAltText('<img src="photo.jpg" alt="">');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('info');
  });

  it('skips img with aria-hidden', () => {
    const issues = checkAltText('<img src="icon.svg" aria-hidden="true">');
    expect(issues).toHaveLength(0);
  });

  it('flags area without alt', () => {
    const issues = checkAltText('<area shape="rect" coords="0,0,10,10" href="/link">');
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('1.1.1');
  });
});

describe('checkHeadings', () => {
  it('flags skipped heading levels', () => {
    const html = '<h1>Title</h1>\n<h3>Subsection</h3>';
    const issues = checkHeadings(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('1.3.1');
    expect(issues[0].message).toContain('h1 → h3');
  });

  it('passes valid heading hierarchy', () => {
    const html = '<h1>Title</h1>\n<h2>Section</h2>\n<h3>Subsection</h3>';
    const issues = checkHeadings(html);
    expect(issues).toHaveLength(0);
  });

  it('flags empty headings', () => {
    const html = '<h2></h2>';
    const issues = checkHeadings(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('Empty heading');
  });
});

describe('checkLabels', () => {
  it('flags input without label', () => {
    const html = '<input type="text" name="email">';
    const issues = checkLabels(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('3.3.2');
  });

  it('passes input with aria-label', () => {
    const html = '<input type="text" aria-label="Email address">';
    const issues = checkLabels(html);
    expect(issues).toHaveLength(0);
  });

  it('passes input with matching label for', () => {
    const html = '<label for="email">Email</label>\n<input type="text" id="email">';
    const issues = checkLabels(html);
    expect(issues).toHaveLength(0);
  });

  it('skips hidden inputs', () => {
    const html = '<input type="hidden" name="csrf">';
    const issues = checkLabels(html);
    expect(issues).toHaveLength(0);
  });

  it('skips submit buttons', () => {
    const html = '<input type="submit" value="Send">';
    const issues = checkLabels(html);
    expect(issues).toHaveLength(0);
  });

  it('flags textarea without label', () => {
    const html = '<textarea name="bio"></textarea>';
    const issues = checkLabels(html);
    expect(issues).toHaveLength(1);
  });
});

describe('checkAria', () => {
  it('flags empty links', () => {
    const html = '<a href="/page"></a>';
    const issues = checkAria(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('2.4.4');
  });

  it('passes link with text', () => {
    const html = '<a href="/page">Click here</a>';
    const issues = checkAria(html);
    expect(issues).toHaveLength(0);
  });

  it('passes empty link with aria-label', () => {
    const html = '<a href="/page" aria-label="Go to page"></a>';
    const issues = checkAria(html);
    expect(issues).toHaveLength(0);
  });

  it('flags empty buttons', () => {
    const html = '<button></button>';
    const issues = checkAria(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('4.1.2');
  });

  it('flags clickable divs without role', () => {
    const html = '<div onClick={handleClick}>Click me</div>';
    const issues = checkAria(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('role');
  });

  it('passes clickable div with role', () => {
    const html = '<div onClick={handleClick} role="button" tabIndex={0}>Click me</div>';
    const issues = checkAria(html);
    expect(issues).toHaveLength(0);
  });

  it('flags invalid ARIA roles', () => {
    const html = '<div role="superbutton">Click</div>';
    const issues = checkAria(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('Invalid ARIA role');
  });

  it('passes valid ARIA roles', () => {
    const html = '<div role="dialog">Content</div>';
    const issues = checkAria(html);
    expect(issues).toHaveLength(0);
  });
});

describe('checkContrast', () => {
  it('flags light text colors', () => {
    const html = '<p style="color: #fff">Light text</p>';
    const issues = checkContrast(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('1.4.3');
  });

  it('flags low opacity', () => {
    const html = '<span style="opacity: 0.3">Faded</span>';
    const issues = checkContrast(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('info');
  });

  it('passes normal text', () => {
    const html = '<p style="color: #333">Normal text</p>';
    const issues = checkContrast(html);
    expect(issues).toHaveLength(0);
  });
});

describe('checkStructure', () => {
  it('flags missing lang on html', () => {
    const html = '<html>\n<head><title>Test</title></head>\n<body></body>\n</html>';
    const issues = checkStructure(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('3.1.1');
  });

  it('passes html with lang', () => {
    const html = '<html lang="en">\n<head><title>Test</title></head>\n<body></body>\n</html>';
    const issues = checkStructure(html);
    expect(issues).toHaveLength(0);
  });

  it('flags missing title', () => {
    const html = '<html lang="en">\n<head></head>\n<body></body>\n</html>';
    const issues = checkStructure(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('2.4.2');
  });

  it('flags duplicate IDs', () => {
    const html = '<div id="header">One</div>\n<div id="header">Two</div>';
    const issues = checkStructure(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('4.1.1');
    expect(issues[0].message).toContain('Duplicate ID');
  });
});

describe('checkKeyboard', () => {
  it('flags positive tabindex', () => {
    const html = '<button tabindex="5">Click</button>';
    const issues = checkKeyboard(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('2.4.3');
  });

  it('passes tabindex 0', () => {
    const html = '<div tabindex="0">Focusable</div>';
    const issues = checkKeyboard(html);
    expect(issues).toHaveLength(0);
  });

  it('flags mouse-only handlers', () => {
    const html = '<div onmousedown="handle()">Hover me</div>';
    const issues = checkKeyboard(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].criterion).toBe('2.1.1');
  });

  it('passes mouse handler with keyboard equivalent', () => {
    const html = '<div onmousedown="handle()" onkeydown="handle()">Click</div>';
    const issues = checkKeyboard(html);
    expect(issues).toHaveLength(0);
  });
});

describe('checkMedia', () => {
  it('flags autoplay video without muted', () => {
    const html = '<video src="intro.mp4" autoplay></video>';
    const issues = checkMedia(html);
    expect(issues.filter(i => i.message.includes('Auto-playing'))).toHaveLength(1);
    expect(issues.find(i => i.message.includes('Auto-playing'))!.severity).toBe('warning');
  });

  it('allows autoplay with muted as info', () => {
    const html = '<video src="intro.mp4" autoplay muted controls></video>';
    const issues = checkMedia(html);
    const autoplayIssue = issues.find(i => i.message.includes('Auto-playing'));
    expect(autoplayIssue?.severity).toBe('info');
  });

  it('flags media without controls', () => {
    const html = '<audio src="music.mp3"></audio>';
    const issues = checkMedia(html);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('without controls');
  });

  it('passes media with controls', () => {
    const html = '<video src="demo.mp4" controls></video>';
    const issues = checkMedia(html);
    expect(issues).toHaveLength(0);
  });
});

describe('runFullAudit', () => {
  it('runs all checks on a complex document', () => {
    const html = `<html>
<head></head>
<body>
  <img src="hero.jpg">
  <h1>Welcome</h1>
  <h3>About</h3>
  <input type="text" name="q">
  <a href="/x"></a>
  <video autoplay src="bg.mp4"></video>
</body>
</html>`;
    const issues = runFullAudit(html);
    expect(issues.length).toBeGreaterThan(0);
    // Should find: missing alt, heading skip, missing label, empty link, missing lang, missing title, autoplay, no controls
    const categories = new Set(issues.map(i => i.category));
    expect(categories.has('alt-text')).toBe(true);
    expect(categories.has('headings')).toBe(true);
    expect(categories.has('labels')).toBe(true);
    expect(categories.has('aria')).toBe(true);
    expect(categories.has('structure')).toBe(true);
    expect(categories.has('media')).toBe(true);
  });

  it('returns empty for clean document', () => {
    const html = `<html lang="en">
<head><title>Clean Page</title></head>
<body>
  <a href="#main" class="skip-link">Skip to content</a>
  <nav><a href="/">Home</a></nav>
  <main id="main">
    <h1>Title</h1>
    <h2>Section</h2>
    <img src="photo.jpg" alt="A beautiful sunset">
    <label for="search">Search</label>
    <input type="text" id="search">
    <video src="demo.mp4" controls></video>
  </main>
</body>
</html>`;
    const issues = runFullAudit(html);
    expect(issues).toHaveLength(0);
  });
});

describe('generateReport', () => {
  it('returns success message for no issues', () => {
    const report = generateReport([]);
    expect(report).toContain('No accessibility issues found');
  });

  it('shows summary counts', () => {
    const issues = [
      { line: 0, column: 0, columnEnd: 5, criterion: '1.1.1', severity: 'error' as const, category: 'alt-text' as const, message: 'test' },
      { line: 1, column: 0, columnEnd: 5, criterion: '1.3.1', severity: 'warning' as const, category: 'headings' as const, message: 'test' },
    ];
    const report = generateReport(issues);
    expect(report).toContain('2 issues');
    expect(report).toContain('1 error');
    expect(report).toContain('1 warning');
    expect(report).toContain('alt-text');
    expect(report).toContain('headings');
  });
});

describe('isAuditable', () => {
  it('accepts html language', () => {
    const doc = { languageId: 'html', fileName: 'test.html' } as any;
    expect(isAuditable(doc)).toBe(true);
  });

  it('accepts jsx language', () => {
    const doc = { languageId: 'javascriptreact', fileName: 'App.jsx' } as any;
    expect(isAuditable(doc)).toBe(true);
  });

  it('accepts tsx language', () => {
    const doc = { languageId: 'typescriptreact', fileName: 'App.tsx' } as any;
    expect(isAuditable(doc)).toBe(true);
  });

  it('rejects non-markup files', () => {
    const doc = { languageId: 'typescript', fileName: 'utils.ts' } as any;
    expect(isAuditable(doc)).toBe(false);
  });
});
