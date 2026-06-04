/**
 * Accessibility Audit Mode — WCAG compliance checker triggered by voice.
 *
 * Say commands like:
 *   "check accessibility"         → Run WCAG audit on current file
 *   "accessibility audit"         → Run WCAG audit on current file
 *   "wcag check"                  → Run WCAG audit on current file
 *   "audit accessibility"         → Run WCAG audit on current file
 *   "check contrast"              → Run color contrast checks only
 *   "check alt text"              → Run image alt text checks only
 *   "check aria"                  → Run ARIA attribute checks only
 *   "check headings"              → Run heading hierarchy checks only
 *   "check labels"                → Run form label checks only
 *   "clear accessibility"         → Clear audit diagnostics
 *   "fix accessibility"           → Show quick fixes for audit issues
 *   "accessibility report"        → Generate summary report
 *
 * Checks performed (subset of WCAG 2.1 AA):
 *   - Missing alt attributes on images (1.1.1)
 *   - Empty links and buttons (2.4.4 / 4.1.2)
 *   - Missing form labels (1.3.1 / 3.3.2)
 *   - Heading hierarchy violations (1.3.1)
 *   - Insufficient color contrast hints (1.4.3)
 *   - Missing lang attribute (3.1.1)
 *   - Missing ARIA roles on interactive elements (4.1.2)
 *   - Duplicate IDs (4.1.1)
 *   - Missing skip navigation (2.4.1)
 *   - Keyboard accessibility patterns (2.1.1)
 *   - Missing document title (2.4.2)
 *   - Auto-play media (1.4.2)
 *
 * Enable via `voxpilot.accessibilityAudit` setting (default: true).
 *
 * Note: Automated checks catch common issues but cannot replace manual
 * testing with assistive technologies and expert accessibility review.
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

// ── Types ────────────────────────────────────────────────────────────

export type AuditCommandType =
  | 'audit-full' | 'audit-contrast' | 'audit-alt'
  | 'audit-aria' | 'audit-headings' | 'audit-labels'
  | 'clear' | 'fix' | 'report';

export interface AuditMatch {
  type: AuditCommandType;
  trigger: string;
}

export type AuditCategory =
  | 'alt-text' | 'contrast' | 'aria' | 'headings'
  | 'labels' | 'structure' | 'keyboard' | 'media';

export interface AuditIssue {
  /** Line number (0-based) */
  line: number;
  /** Column start (0-based) */
  column: number;
  /** Column end */
  columnEnd: number;
  /** WCAG criterion (e.g. "1.1.1") */
  criterion: string;
  /** Severity */
  severity: 'error' | 'warning' | 'info';
  /** Category */
  category: AuditCategory;
  /** Human-readable message */
  message: string;
  /** Suggested fix (if available) */
  fix?: string;
}

// ── Voice Command Matching ───────────────────────────────────────────

const AUDIT_TRIGGERS: Array<{ phrases: string[]; type: AuditCommandType }> = [
  // Full audit
  {
    phrases: [
      'check accessibility', 'accessibility audit', 'wcag check',
      'audit accessibility', 'run accessibility audit', 'wcag audit',
      'accessibility check', 'a11y check', 'a11y audit',
    ],
    type: 'audit-full',
  },
  // Category-specific
  { phrases: ['check contrast', 'contrast check', 'audit contrast'], type: 'audit-contrast' },
  { phrases: ['check alt text', 'check alt tags', 'check images', 'audit images'], type: 'audit-alt' },
  { phrases: ['check aria', 'audit aria', 'aria check'], type: 'audit-aria' },
  { phrases: ['check headings', 'audit headings', 'heading check', 'heading hierarchy'], type: 'audit-headings' },
  { phrases: ['check labels', 'audit labels', 'label check', 'check form labels'], type: 'audit-labels' },
  // Actions
  { phrases: ['clear accessibility', 'clear audit', 'clear a11y', 'dismiss accessibility'], type: 'clear' },
  { phrases: ['fix accessibility', 'fix a11y', 'accessibility fix', 'fix audit'], type: 'fix' },
  { phrases: ['accessibility report', 'a11y report', 'audit report', 'show accessibility report'], type: 'report' },
];

function buildAuditIndex(): Array<[string, AuditCommandType]> {
  const pairs: Array<[string, AuditCommandType]> = [];
  for (const { phrases, type } of AUDIT_TRIGGERS) {
    for (const phrase of phrases) {
      pairs.push([phrase.toLowerCase(), type]);
    }
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

const AUDIT_INDEX = buildAuditIndex();

/**
 * Match a transcript against accessibility audit commands.
 */
export function matchAuditCommand(transcript: string): AuditMatch | null {
  const normalized = transcript.toLowerCase().replace(/\s+/g, ' ').trim();

  for (const [trigger, type] of AUDIT_INDEX) {
    if (normalized === trigger || normalized.startsWith(trigger + ' ')) {
      return { type, trigger };
    }
  }

  return null;
}

// ── WCAG Checks ──────────────────────────────────────────────────────

/** Supported file languages for audit */
const AUDITABLE_LANGUAGES = new Set([
  'html', 'htm', 'jsx', 'tsx', 'vue', 'svelte',
  'php', 'erb', 'ejs', 'handlebars', 'razor',
  'typescriptreact', 'javascriptreact',
]);

/**
 * Check if a document can be audited.
 */
export function isAuditable(doc: vscode.TextDocument): boolean {
  const langId = doc.languageId;
  if (AUDITABLE_LANGUAGES.has(langId)) return true;
  // Also check file extensions for edge cases
  const ext = doc.fileName.split('.').pop()?.toLowerCase() ?? '';
  return AUDITABLE_LANGUAGES.has(ext);
}

/**
 * Run all WCAG checks on document text.
 */
export function runFullAudit(text: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  issues.push(...checkAltText(text));
  issues.push(...checkHeadings(text));
  issues.push(...checkLabels(text));
  issues.push(...checkAria(text));
  issues.push(...checkContrast(text));
  issues.push(...checkStructure(text));
  issues.push(...checkKeyboard(text));
  issues.push(...checkMedia(text));
  return issues;
}

/**
 * Run audit for a specific category only.
 */
export function runCategoryAudit(text: string, category: AuditCategory): AuditIssue[] {
  switch (category) {
    case 'alt-text': return checkAltText(text);
    case 'headings': return checkHeadings(text);
    case 'labels': return checkLabels(text);
    case 'aria': return checkAria(text);
    case 'contrast': return checkContrast(text);
    case 'structure': return checkStructure(text);
    case 'keyboard': return checkKeyboard(text);
    case 'media': return checkMedia(text);
  }
}

// ── Individual Check Functions ───────────────────────────────────────

/**
 * WCAG 1.1.1 — Images must have alt attributes.
 */
export function checkAltText(text: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const lines = text.split('\n');

  // Match <img tags without alt attribute
  const imgNoAlt = /<img\b(?![^>]*\balt\s*=)[^>]*>/gi;
  // Match <img tags with empty alt="" where it's not decorative
  const imgEmptyAlt = /<img\b[^>]*\balt\s*=\s*["']\s*["'][^>]*>/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match: RegExpExecArray | null;

    imgNoAlt.lastIndex = 0;
    while ((match = imgNoAlt.exec(line)) !== null) {
      // Skip if it has role="presentation" or aria-hidden="true"
      if (/role\s*=\s*["']presentation["']/i.test(match[0]) ||
          /aria-hidden\s*=\s*["']true["']/i.test(match[0])) {
        continue;
      }
      issues.push({
        line: i,
        column: match.index,
        columnEnd: match.index + match[0].length,
        criterion: '1.1.1',
        severity: 'error',
        category: 'alt-text',
        message: 'Image missing alt attribute. Add alt text describing the image content, or alt="" for decorative images.',
        fix: 'Add alt="description" attribute',
      });
    }

    imgEmptyAlt.lastIndex = 0;
    while ((match = imgEmptyAlt.exec(line)) !== null) {
      // Empty alt is valid for decorative images — flag as info
      if (!/role\s*=\s*["']presentation["']/i.test(match[0])) {
        issues.push({
          line: i,
          column: match.index,
          columnEnd: match.index + match[0].length,
          criterion: '1.1.1',
          severity: 'info',
          category: 'alt-text',
          message: 'Image has empty alt text. Verify this is intentionally decorative. Add role="presentation" to confirm.',
        });
      }
    }
  }

  // Check for <area> tags without alt
  const areaNoAlt = /<area\b(?![^>]*\balt\s*=)[^>]*>/gi;
  for (let i = 0; i < lines.length; i++) {
    areaNoAlt.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = areaNoAlt.exec(lines[i])) !== null) {
      issues.push({
        line: i,
        column: match.index,
        columnEnd: match.index + match[0].length,
        criterion: '1.1.1',
        severity: 'error',
        category: 'alt-text',
        message: 'Image map area missing alt attribute.',
        fix: 'Add alt="description" attribute',
      });
    }
  }

  return issues;
}

/**
 * WCAG 1.3.1 — Heading hierarchy should not skip levels.
 */
export function checkHeadings(text: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const lines = text.split('\n');
  const headingPattern = /<h([1-6])\b/gi;

  let lastLevel = 0;
  const headings: Array<{ level: number; line: number; column: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    headingPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = headingPattern.exec(lines[i])) !== null) {
      headings.push({ level: parseInt(match[1], 10), line: i, column: match.index });
    }
  }

  for (const heading of headings) {
    if (lastLevel > 0 && heading.level > lastLevel + 1) {
      issues.push({
        line: heading.line,
        column: heading.column,
        columnEnd: heading.column + 4,
        criterion: '1.3.1',
        severity: 'warning',
        category: 'headings',
        message: `Heading level skipped: h${lastLevel} → h${heading.level}. Headings should not skip levels.`,
        fix: `Change to h${lastLevel + 1}`,
      });
    }
    lastLevel = heading.level;
  }

  // Check for empty headings
  const emptyHeading = /<h[1-6][^>]*>\s*<\/h[1-6]>/gi;
  for (let i = 0; i < lines.length; i++) {
    emptyHeading.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = emptyHeading.exec(lines[i])) !== null) {
      issues.push({
        line: i,
        column: match.index,
        columnEnd: match.index + match[0].length,
        criterion: '1.3.1',
        severity: 'error',
        category: 'headings',
        message: 'Empty heading element. Headings must have text content.',
        fix: 'Add heading text or remove the empty element',
      });
    }
  }

  return issues;
}

/**
 * WCAG 1.3.1 / 3.3.2 — Form inputs must have associated labels.
 */
export function checkLabels(text: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const lines = text.split('\n');
  const fullText = text;

  // Find inputs without associated labels
  const inputPattern = /<input\b[^>]*>/gi;
  const hiddenInput = /type\s*=\s*["']hidden["']/i;
  const submitInput = /type\s*=\s*["'](submit|button|reset|image)["']/i;
  const hasAriaLabel = /aria-label\s*=\s*["'][^"']+["']/i;
  const hasAriaLabelledBy = /aria-labelled?by\s*=\s*["'][^"']+["']/i;
  const hasTitle = /title\s*=\s*["'][^"']+["']/i;
  const hasId = /id\s*=\s*["']([^"']+)["']/i;

  for (let i = 0; i < lines.length; i++) {
    inputPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = inputPattern.exec(lines[i])) !== null) {
      const tag = match[0];
      // Skip hidden, submit, button, reset, image inputs
      if (hiddenInput.test(tag) || submitInput.test(tag)) continue;
      // Skip if has aria-label, aria-labelledby, or title
      if (hasAriaLabel.test(tag) || hasAriaLabelledBy.test(tag) || hasTitle.test(tag)) continue;
      // Check if input has id and a matching <label for="id">
      const idMatch = hasId.exec(tag);
      if (idMatch) {
        const labelFor = new RegExp(`<label[^>]*\\bfor\\s*=\\s*["']${escapeRegex(idMatch[1])}["']`, 'i');
        if (labelFor.test(fullText)) continue;
      }
      // Check if input is wrapped in a <label>
      // Simple heuristic: check if there's a <label> on the same or preceding line
      const precedingLines = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
      if (/<label\b[^>]*>(?!<\/label>)/i.test(precedingLines) && !/<\/label>/i.test(precedingLines.slice(0, precedingLines.lastIndexOf(match[0])))) {
        continue;
      }

      issues.push({
        line: i,
        column: match.index,
        columnEnd: match.index + match[0].length,
        criterion: '3.3.2',
        severity: 'error',
        category: 'labels',
        message: 'Form input missing accessible label. Add a <label>, aria-label, or aria-labelledby.',
        fix: 'Add aria-label="description" or wrap in <label>',
      });
    }
  }

  // Check <select> and <textarea> too
  const selectTextarea = /<(select|textarea)\b[^>]*>/gi;
  for (let i = 0; i < lines.length; i++) {
    selectTextarea.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = selectTextarea.exec(lines[i])) !== null) {
      const tag = match[0];
      if (hasAriaLabel.test(tag) || hasAriaLabelledBy.test(tag) || hasTitle.test(tag)) continue;
      const idMatch = hasId.exec(tag);
      if (idMatch) {
        const labelFor = new RegExp(`<label[^>]*\\bfor\\s*=\\s*["']${escapeRegex(idMatch[1])}["']`, 'i');
        if (labelFor.test(fullText)) continue;
      }
      issues.push({
        line: i,
        column: match.index,
        columnEnd: match.index + match[0].length,
        criterion: '3.3.2',
        severity: 'error',
        category: 'labels',
        message: `<${match[1]}> missing accessible label.`,
        fix: 'Add aria-label="description" or associate with <label>',
      });
    }
  }

  return issues;
}

/**
 * WCAG 4.1.2 — ARIA roles and attributes.
 */
export function checkAria(text: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const lines = text.split('\n');

  // Check for empty links (no text, no aria-label)
  const emptyLink = /<a\b[^>]*>(\s*<\/a>|\s*<img[^>]*>\s*<\/a>)/gi;
  for (let i = 0; i < lines.length; i++) {
    emptyLink.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = emptyLink.exec(lines[i])) !== null) {
      const fullTag = match[0];
      if (/aria-label\s*=\s*["'][^"']+["']/i.test(fullTag)) continue;
      if (/aria-labelled?by\s*=\s*["'][^"']+["']/i.test(fullTag)) continue;
      if (/title\s*=\s*["'][^"']+["']/i.test(fullTag)) continue;
      issues.push({
        line: i,
        column: match.index,
        columnEnd: match.index + match[0].length,
        criterion: '2.4.4',
        severity: 'error',
        category: 'aria',
        message: 'Link has no accessible text. Add text content, aria-label, or title.',
        fix: 'Add descriptive text inside the link or aria-label',
      });
    }
  }

  // Check for empty buttons
  const emptyButton = /<button\b[^>]*>\s*<\/button>/gi;
  for (let i = 0; i < lines.length; i++) {
    emptyButton.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = emptyButton.exec(lines[i])) !== null) {
      if (/aria-label\s*=\s*["'][^"']+["']/i.test(match[0])) continue;
      issues.push({
        line: i,
        column: match.index,
        columnEnd: match.index + match[0].length,
        criterion: '4.1.2',
        severity: 'error',
        category: 'aria',
        message: 'Button has no accessible text. Add text content or aria-label.',
        fix: 'Add button text or aria-label="description"',
      });
    }
  }

  // Check for interactive elements with click handlers but no role/tabindex (JSX/React)
  const divClick = /<div\b[^>]*on[Cc]lick[^>]*>/gi;
  for (let i = 0; i < lines.length; i++) {
    divClick.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = divClick.exec(lines[i])) !== null) {
      const tag = match[0];
      if (/role\s*=/i.test(tag)) continue;
      if (/tabIndex\s*=/i.test(tag) || /tabindex\s*=/i.test(tag)) continue;
      issues.push({
        line: i,
        column: match.index,
        columnEnd: match.index + match[0].length,
        criterion: '4.1.2',
        severity: 'warning',
        category: 'aria',
        message: 'Clickable element missing role and tabindex. Non-semantic elements with click handlers need role="button" and tabIndex={0}.',
        fix: 'Add role="button" and tabIndex={0}, or use a <button>',
      });
    }
  }

  // Check for invalid ARIA roles
  const validRoles = new Set([
    'alert', 'alertdialog', 'application', 'article', 'banner', 'button',
    'cell', 'checkbox', 'columnheader', 'combobox', 'complementary',
    'contentinfo', 'definition', 'dialog', 'directory', 'document',
    'feed', 'figure', 'form', 'grid', 'gridcell', 'group', 'heading',
    'img', 'link', 'list', 'listbox', 'listitem', 'log', 'main',
    'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'navigation', 'none', 'note', 'option', 'presentation',
    'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup',
    'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider',
    'spinbutton', 'status', 'switch', 'tab', 'table', 'tablist', 'tabpanel',
    'term', 'textbox', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid',
    'treeitem',
  ]);

  const roleAttr = /role\s*=\s*["']([^"']+)["']/gi;
  for (let i = 0; i < lines.length; i++) {
    roleAttr.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = roleAttr.exec(lines[i])) !== null) {
      const roles = match[1].split(/\s+/);
      for (const role of roles) {
        if (role && !validRoles.has(role.toLowerCase())) {
          issues.push({
            line: i,
            column: match.index,
            columnEnd: match.index + match[0].length,
            criterion: '4.1.2',
            severity: 'error',
            category: 'aria',
            message: `Invalid ARIA role "${role}". Use a valid WAI-ARIA role.`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * WCAG 1.4.3 — Color contrast hints.
 * Note: True contrast checking requires rendering. This flags suspicious patterns.
 */
export function checkContrast(text: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const lines = text.split('\n');

  // Flag inline styles with low-contrast color combinations
  const inlineStyle = /style\s*=\s*["'][^"']*color\s*:\s*([^;"']+)[^"']*["']/gi;
  const lightColors = /^(white|#fff|#ffffff|#fafafa|#f5f5f5|#eee|#eeeeee|rgb\s*\(\s*2[4-5]\d|lightgray|lightgrey|snow|ivory|beige)/i;

  for (let i = 0; i < lines.length; i++) {
    inlineStyle.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = inlineStyle.exec(lines[i])) !== null) {
      const colorVal = match[1].trim();
      // Flag very light colors used as text color (potential contrast issue)
      if (lightColors.test(colorVal)) {
        issues.push({
          line: i,
          column: match.index,
          columnEnd: match.index + match[0].length,
          criterion: '1.4.3',
          severity: 'warning',
          category: 'contrast',
          message: `Potential contrast issue: light text color "${colorVal}". Verify contrast ratio is at least 4.5:1 for normal text.`,
        });
      }
    }
  }

  // Flag opacity values that might reduce contrast
  const opacityPattern = /opacity\s*:\s*(0\.[0-4]\d*|0\.5)\b/gi;
  for (let i = 0; i < lines.length; i++) {
    opacityPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = opacityPattern.exec(lines[i])) !== null) {
      issues.push({
        line: i,
        column: match.index,
        columnEnd: match.index + match[0].length,
        criterion: '1.4.3',
        severity: 'info',
        category: 'contrast',
        message: `Low opacity (${match[1]}) may reduce text contrast below WCAG threshold. Verify readability.`,
      });
    }
  }

  return issues;
}

/**
 * WCAG 3.1.1, 4.1.1, 2.4.1, 2.4.2 — Document structure checks.
 */
export function checkStructure(text: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const lines = text.split('\n');

  // Check for missing lang attribute on <html>
  const htmlTag = /<html\b[^>]*>/i;
  const htmlMatch = htmlTag.exec(text);
  if (htmlMatch && !/lang\s*=\s*["'][^"']+["']/i.test(htmlMatch[0])) {
    const lineIndex = text.slice(0, htmlMatch.index).split('\n').length - 1;
    issues.push({
      line: lineIndex,
      column: 0,
      columnEnd: htmlMatch[0].length,
      criterion: '3.1.1',
      severity: 'error',
      category: 'structure',
      message: 'Missing lang attribute on <html> element. Add lang="en" (or appropriate language code).',
      fix: 'Add lang="en" to <html>',
    });
  }

  // Check for missing <title> when <head> is present
  if (/<head\b/i.test(text) && !/<title\b[^>]*>[^<]+<\/title>/i.test(text)) {
    const headMatch = /<head\b[^>]*>/i.exec(text);
    if (headMatch) {
      const lineIndex = text.slice(0, headMatch.index).split('\n').length - 1;
      issues.push({
        line: lineIndex,
        column: 0,
        columnEnd: headMatch[0].length,
        criterion: '2.4.2',
        severity: 'error',
        category: 'structure',
        message: 'Page missing <title> element. Every page must have a descriptive title.',
        fix: 'Add <title>Page Title</title> inside <head>',
      });
    }
  }

  // Check for duplicate IDs
  const idPattern = /\bid\s*=\s*["']([^"']+)["']/gi;
  const idMap = new Map<string, Array<{ line: number; column: number }>>();
  for (let i = 0; i < lines.length; i++) {
    idPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = idPattern.exec(lines[i])) !== null) {
      const id = match[1];
      if (!idMap.has(id)) {
        idMap.set(id, []);
      }
      idMap.get(id)!.push({ line: i, column: match.index });
    }
  }
  for (const [id, locations] of idMap) {
    if (locations.length > 1) {
      for (const loc of locations.slice(1)) {
        issues.push({
          line: loc.line,
          column: loc.column,
          columnEnd: loc.column + id.length + 5,
          criterion: '4.1.1',
          severity: 'error',
          category: 'structure',
          message: `Duplicate ID "${id}". IDs must be unique within a document.`,
          fix: `Rename this ID to a unique value`,
        });
      }
    }
  }

  // Check for skip navigation (if <main> or <nav> exists but no skip link)
  if (/<(main|nav)\b/i.test(text)) {
    const hasSkipLink = /<a\b[^>]*href\s*=\s*["']#[^"']+["'][^>]*>.*skip/i.test(text) ||
                        /class\s*=\s*["'][^"']*skip[^"']*["']/i.test(text);
    if (!hasSkipLink && /<body\b/i.test(text)) {
      issues.push({
        line: 0,
        column: 0,
        columnEnd: 0,
        criterion: '2.4.1',
        severity: 'warning',
        category: 'structure',
        message: 'Consider adding a "Skip to main content" link for keyboard users.',
        fix: 'Add <a href="#main" class="skip-link">Skip to main content</a>',
      });
    }
  }

  return issues;
}

/**
 * WCAG 2.1.1 — Keyboard accessibility patterns.
 */
export function checkKeyboard(text: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const lines = text.split('\n');

  // Check for positive tabindex (disrupts natural tab order)
  const tabIndexPattern = /tabindex\s*=\s*["']?(\d+)["']?/gi;
  for (let i = 0; i < lines.length; i++) {
    tabIndexPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = tabIndexPattern.exec(lines[i])) !== null) {
      const value = parseInt(match[1], 10);
      if (value > 0) {
        issues.push({
          line: i,
          column: match.index,
          columnEnd: match.index + match[0].length,
          criterion: '2.4.3',
          severity: 'warning',
          category: 'keyboard',
          message: `Positive tabindex (${value}) disrupts natural tab order. Use tabindex="0" or "-1" instead.`,
          fix: 'Change to tabindex="0"',
        });
      }
    }
  }

  // Check for onmousedown/onmouseup without keyboard equivalents
  const mouseOnly = /\b(onmousedown|onmouseup|onmouseover|onmouseout)\s*=/gi;
  for (let i = 0; i < lines.length; i++) {
    mouseOnly.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = mouseOnly.exec(lines[i])) !== null) {
      const line = lines[i];
      const hasKeyboard = /\b(onkeydown|onkeyup|onkeypress|onfocus|onblur)\s*=/i.test(line);
      if (!hasKeyboard) {
        issues.push({
          line: i,
          column: match.index,
          columnEnd: match.index + match[0].length,
          criterion: '2.1.1',
          severity: 'warning',
          category: 'keyboard',
          message: `Mouse-only event handler "${match[1]}" without keyboard equivalent. Add onKeyDown/onFocus handlers.`,
          fix: 'Add keyboard event handler (onKeyDown, onFocus)',
        });
      }
    }
  }

  // Check for accesskey (screen reader conflict risk)
  const accessKey = /accesskey\s*=\s*["'][^"']+["']/gi;
  for (let i = 0; i < lines.length; i++) {
    accessKey.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = accessKey.exec(lines[i])) !== null) {
      issues.push({
        line: i,
        column: match.index,
        columnEnd: match.index + match[0].length,
        criterion: '2.1.1',
        severity: 'info',
        category: 'keyboard',
        message: 'accesskey may conflict with assistive technology shortcuts. Use sparingly.',
      });
    }
  }

  return issues;
}

/**
 * WCAG 1.4.2 — Media auto-play checks.
 */
export function checkMedia(text: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const lines = text.split('\n');

  // Check for autoplay on audio/video
  const autoplay = /<(audio|video)\b[^>]*autoplay[^>]*>/gi;
  for (let i = 0; i < lines.length; i++) {
    autoplay.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = autoplay.exec(lines[i])) !== null) {
      const tag = match[0];
      const hasMuted = /muted/i.test(tag);
      issues.push({
        line: i,
        column: match.index,
        columnEnd: match.index + match[0].length,
        criterion: '1.4.2',
        severity: hasMuted ? 'info' : 'warning',
        category: 'media',
        message: hasMuted
          ? 'Auto-playing muted media. Ensure controls are available to unmute.'
          : 'Auto-playing media with sound. Users must be able to pause/stop/mute. Consider adding muted attribute.',
        fix: hasMuted ? undefined : 'Add muted attribute or remove autoplay',
      });
    }
  }

  // Check for video/audio without controls
  const noControls = /<(audio|video)\b(?![^>]*\bcontrols\b)[^>]*>/gi;
  for (let i = 0; i < lines.length; i++) {
    noControls.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = noControls.exec(lines[i])) !== null) {
      issues.push({
        line: i,
        column: match.index,
        columnEnd: match.index + match[0].length,
        criterion: '1.4.2',
        severity: 'warning',
        category: 'media',
        message: `<${match[1]}> without controls attribute. Users must be able to control media playback.`,
        fix: 'Add controls attribute',
      });
    }
  }

  return issues;
}

// ── Execution ────────────────────────────────────────────────────────

/** Diagnostic collection for audit results */
let diagnosticCollection: vscode.DiagnosticCollection | undefined;

function getDiagnosticCollection(): vscode.DiagnosticCollection {
  if (!diagnosticCollection) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('voxpilot-a11y');
  }
  return diagnosticCollection;
}

/**
 * Convert audit issues to VS Code diagnostics and display them.
 */
export function showAuditResults(doc: vscode.TextDocument, issues: AuditIssue[]): void {
  const collection = getDiagnosticCollection();
  const diagnostics: vscode.Diagnostic[] = issues.map(issue => {
    const range = new vscode.Range(
      issue.line, issue.column,
      issue.line, issue.columnEnd || issue.column + 1,
    );

    const severity = issue.severity === 'error'
      ? vscode.DiagnosticSeverity.Error
      : issue.severity === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information;

    const diag = new vscode.Diagnostic(range, issue.message, severity);
    diag.source = 'VoxPilot A11y';
    diag.code = `WCAG ${issue.criterion}`;
    return diag;
  });

  collection.set(doc.uri, diagnostics);
}

/**
 * Clear all audit diagnostics.
 */
export function clearAuditDiagnostics(): void {
  getDiagnosticCollection().clear();
}

/**
 * Generate a human-readable summary report.
 */
export function generateReport(issues: AuditIssue[]): string {
  if (issues.length === 0) {
    return '✅ No accessibility issues found. Note: automated checks cannot replace manual testing with assistive technologies.';
  }

  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const infos = issues.filter(i => i.severity === 'info').length;

  const byCategory = new Map<AuditCategory, number>();
  for (const issue of issues) {
    byCategory.set(issue.category, (byCategory.get(issue.category) ?? 0) + 1);
  }

  let report = `♿ Accessibility Audit: ${issues.length} issue${issues.length === 1 ? '' : 's'} found\n`;
  report += `   ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}, ${infos} info\n\n`;
  report += 'By category:\n';
  for (const [cat, count] of byCategory) {
    report += `   • ${cat}: ${count}\n`;
  }
  report += '\n⚠️ Automated checks cover common patterns only. Full WCAG compliance requires manual testing with assistive technologies.';

  return report;
}

/**
 * Execute an accessibility audit command.
 */
export async function executeAuditCommand(match: AuditMatch): Promise<boolean> {
  const editor = vscode.window.activeTextEditor;

  switch (match.type) {
    case 'clear':
      clearAuditDiagnostics();
      vscode.window.showInformationMessage('VoxPilot: Accessibility diagnostics cleared.');
      return true;

    case 'report': {
      if (!editor) {
        vscode.window.showWarningMessage('VoxPilot: No active editor for accessibility report.');
        return false;
      }
      const text = editor.document.getText();
      const issues = runFullAudit(text);
      const report = generateReport(issues);
      const doc = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
      await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
      return true;
    }

    case 'fix': {
      if (!editor) {
        vscode.window.showWarningMessage('VoxPilot: No active editor.');
        return false;
      }
      await vscode.commands.executeCommand('editor.action.quickFix');
      return true;
    }

    case 'audit-full':
    case 'audit-contrast':
    case 'audit-alt':
    case 'audit-aria':
    case 'audit-headings':
    case 'audit-labels': {
      if (!editor) {
        vscode.window.showWarningMessage('VoxPilot: No active editor for accessibility audit.');
        return false;
      }

      if (!isAuditable(editor.document)) {
        vscode.window.showWarningMessage(
          'VoxPilot: Current file is not an HTML/JSX/template file. Accessibility audit works on markup files.',
        );
        return false;
      }

      const text = editor.document.getText();
      let issues: AuditIssue[];

      if (match.type === 'audit-full') {
        issues = runFullAudit(text);
      } else {
        const categoryMap: Record<string, AuditCategory> = {
          'audit-contrast': 'contrast',
          'audit-alt': 'alt-text',
          'audit-aria': 'aria',
          'audit-headings': 'headings',
          'audit-labels': 'labels',
        };
        issues = runCategoryAudit(text, categoryMap[match.type]);
      }

      showAuditResults(editor.document, issues);

      if (issues.length === 0) {
        vscode.window.showInformationMessage('VoxPilot: No accessibility issues found in this category. ✅');
      } else {
        const errors = issues.filter(i => i.severity === 'error').length;
        const warnings = issues.filter(i => i.severity === 'warning').length;
        vscode.window.showInformationMessage(
          `VoxPilot: Found ${issues.length} accessibility issue${issues.length === 1 ? '' : 's'} (${errors} errors, ${warnings} warnings). Check the Problems panel.`,
        );
      }

      // Focus problems panel
      await vscode.commands.executeCommand('workbench.actions.view.problems');
      return true;
    }

    default:
      return false;
  }
}

// ── Post-Processor ───────────────────────────────────────────────────

/**
 * Voice processor that intercepts accessibility audit commands.
 */
export class AccessibilityAuditProcessor implements PostProcessor {
  readonly id = 'accessibilityAudit';
  readonly name = 'Accessibility Audit';
  readonly description = 'WCAG compliance checker triggered by voice commands';

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (!config.get<boolean>('accessibilityAudit', true)) {
      return text;
    }

    const match = matchAuditCommand(text);
    if (match) {
      executeAuditCommand(match);
      return '';
    }

    return text;
  }
}

/** Singleton instance */
export const accessibilityAudit = new AccessibilityAuditProcessor();

// ── Utility ──────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Dispose diagnostic collection on extension deactivation.
 */
export function disposeAuditDiagnostics(): void {
  diagnosticCollection?.dispose();
  diagnosticCollection = undefined;
}
