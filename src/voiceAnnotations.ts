/**
 * Voice annotations — add inline comments by voice without moving the cursor.
 *
 * Say "annotate <text>" to insert a comment on the current line without
 * disrupting your cursor position or current editing flow.
 *
 * Supported patterns:
 *   "annotate fix this later"     → // fix this later (at end of current line)
 *   "annotate above needs refactor" → // needs refactor (on line above)
 *   "note remember to test"       → // remember to test
 *   "bookmark important"          → // BOOKMARK: important
 *
 * The comment style adapts to the current file's language:
 *   - JS/TS/Java/C/Go: // comment
 *   - Python/Ruby/Shell: # comment
 *   - HTML/XML: <!-- comment -->
 *   - CSS/SCSS: block comments
 *   - SQL: -- comment
 *   - Lua/Haskell: -- comment
 *
 * Enable via `voxpilot.voiceAnnotations` setting (default: true).
 */

import * as vscode from 'vscode';

export type AnnotationType = 'inline' | 'above' | 'below' | 'bookmark' | 'todo' | 'fixme';

export interface AnnotationMatch {
  /** Type of annotation */
  type: AnnotationType;
  /** The annotation text */
  text: string;
  /** The trigger phrase that was matched */
  trigger: string;
}

/** Trigger phrases and their annotation types, longest first */
const ANNOTATION_TRIGGERS: Array<{ phrases: string[]; type: AnnotationType }> = [
  { phrases: ['bookmark'], type: 'bookmark' },
  { phrases: ['annotate above', 'note above', 'comment above'], type: 'above' },
  { phrases: ['annotate below', 'note below', 'comment below'], type: 'below' },
  { phrases: ['annotate', 'note', 'add comment', 'comment'], type: 'inline' },
];

/**
 * Build sorted index for greedy matching.
 */
function buildTriggerIndex(): Array<[string, AnnotationType]> {
  const pairs: Array<[string, AnnotationType]> = [];
  for (const { phrases, type } of ANNOTATION_TRIGGERS) {
    for (const phrase of phrases) {
      pairs.push([phrase.toLowerCase(), type]);
    }
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

const TRIGGER_INDEX = buildTriggerIndex();

/**
 * Match a transcript against annotation triggers.
 */
export function matchAnnotation(transcript: string): AnnotationMatch | null {
  const normalized = transcript.toLowerCase().replace(/\s+/g, ' ').trim();

  for (const [trigger, type] of TRIGGER_INDEX) {
    if (normalized === trigger) {
      return { type, text: '', trigger };
    }
    if (normalized.startsWith(trigger + ' ')) {
      const text = transcript.trim().slice(trigger.length).trim();
      return { type, text, trigger };
    }
  }

  return null;
}

/**
 * Get the comment prefix for a given language ID.
 */
export function getCommentStyle(languageId: string): { prefix: string; suffix: string } {
  const lineComment: Record<string, string> = {
    javascript: '//', typescript: '//', typescriptreact: '//', javascriptreact: '//',
    java: '//', c: '//', cpp: '//', csharp: '//', go: '//', rust: '//', swift: '//',
    kotlin: '//', scala: '//', dart: '//', php: '//',
    python: '#', ruby: '#', shellscript: '#', bash: '#', zsh: '#', perl: '#',
    yaml: '#', toml: '#', dockerfile: '#', makefile: '#', r: '#',
    sql: '--', lua: '--', haskell: '--',
  };

  const blockComment: Record<string, { prefix: string; suffix: string }> = {
    html: { prefix: '<!-- ', suffix: ' -->' },
    xml: { prefix: '<!-- ', suffix: ' -->' },
    css: { prefix: '/* ', suffix: ' */' },
    scss: { prefix: '/* ', suffix: ' */' },
    less: { prefix: '/* ', suffix: ' */' },
  };

  if (lineComment[languageId]) {
    return { prefix: lineComment[languageId] + ' ', suffix: '' };
  }
  if (blockComment[languageId]) {
    return blockComment[languageId];
  }
  // Default to //
  return { prefix: '// ', suffix: '' };
}

/**
 * Format an annotation with the appropriate comment style and type prefix.
 */
export function formatAnnotation(text: string, type: AnnotationType, languageId: string): string {
  const { prefix, suffix } = getCommentStyle(languageId);

  switch (type) {
    case 'bookmark':
      return `${prefix}BOOKMARK: ${text}${suffix}`;
    case 'todo':
      return `${prefix}TODO: ${text}${suffix}`;
    case 'fixme':
      return `${prefix}FIXME: ${text}${suffix}`;
    default:
      return `${prefix}${text}${suffix}`;
  }
}

/**
 * Insert an annotation at the specified position relative to the current line.
 */
export async function insertAnnotation(
  editor: vscode.TextEditor,
  match: AnnotationMatch,
): Promise<boolean> {
  if (!match.text) { return false; }

  const languageId = editor.document.languageId;
  const comment = formatAnnotation(match.text, match.type, languageId);
  const currentLine = editor.selection.active.line;

  try {
    await editor.edit(editBuilder => {
      switch (match.type) {
        case 'above': {
          const lineStart = new vscode.Position(currentLine, 0);
          const indent = editor.document.lineAt(currentLine).text.match(/^\s*/)?.[0] || '';
          editBuilder.insert(lineStart, `${indent}${comment}\n`);
          break;
        }
        case 'below': {
          const nextLineStart = new vscode.Position(currentLine + 1, 0);
          const indent = editor.document.lineAt(currentLine).text.match(/^\s*/)?.[0] || '';
          editBuilder.insert(nextLineStart, `${indent}${comment}\n`);
          break;
        }
        default: {
          // Inline: append at end of current line
          const lineEnd = editor.document.lineAt(currentLine).range.end;
          const lineText = editor.document.lineAt(currentLine).text;
          const padding = lineText.trimEnd().length > 0 ? '  ' : '';
          editBuilder.insert(lineEnd, `${padding}${comment}`);
          break;
        }
      }
    });
    return true;
  } catch {
    return false;
  }
}
