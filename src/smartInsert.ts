/**
 * Smart insert mode — detect cursor context and format transcription accordingly.
 *
 * When inserting at cursor, analyzes the surrounding code context to determine
 * the appropriate formatting:
 *   - Inside a string literal → insert raw text (no code formatting)
 *   - Inside a comment → insert as natural language (capitalize, punctuate)
 *   - Inside a function signature → format as parameter name (camelCase)
 *   - At statement level → format as code (no extra punctuation)
 *   - Inside template literal → insert raw text
 *
 * Enable via `voxpilot.smartInsert` setting (default: true).
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

export type CursorContext =
  | 'string'       // Inside a string literal (single, double, or backtick)
  | 'comment'      // Inside a line or block comment
  | 'function-sig' // Inside function parameters
  | 'code'         // General code context (default)
  | 'unknown';     // Could not determine

/**
 * Analyze the text around the cursor to determine the context.
 * Uses a lightweight character-scanning approach (no AST required).
 */
export function detectCursorContext(lineText: string, charPos: number): CursorContext {
  if (!lineText || charPos < 0) { return 'unknown'; }

  const before = lineText.slice(0, charPos);

  // Check for line comment (// or #)
  const lineCommentIdx = findUnquotedPattern(before, ['//','#']);
  if (lineCommentIdx >= 0) { return 'comment'; }

  // Check for block comment start without close
  const blockStart = before.lastIndexOf('/*');
  const blockEnd = before.lastIndexOf('*/');
  if (blockStart >= 0 && (blockEnd < 0 || blockEnd < blockStart)) { return 'comment'; }

  // Check if inside a string literal
  const stringCtx = detectStringContext(before);
  if (stringCtx) { return 'string'; }

  // Check if inside function parameters
  if (isInsideFunctionSignature(before)) { return 'function-sig'; }

  return 'code';
}

/**
 * Find the last unquoted occurrence of any pattern in text.
 * Returns the index or -1 if not found outside quotes.
 */
function findUnquotedPattern(text: string, patterns: string[]): number {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';

    if (prev === '\\') { continue; } // Skip escaped characters

    if (ch === "'" && !inDouble && !inBacktick) { inSingle = !inSingle; }
    else if (ch === '"' && !inSingle && !inBacktick) { inDouble = !inDouble; }
    else if (ch === '`' && !inSingle && !inDouble) { inBacktick = !inBacktick; }

    if (!inSingle && !inDouble && !inBacktick) {
      for (const pattern of patterns) {
        if (text.slice(i, i + pattern.length) === pattern) {
          return i;
        }
      }
    }
  }

  return -1;
}

/**
 * Detect if the cursor is inside a string literal by counting unescaped quotes.
 */
function detectStringContext(before: string): boolean {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let i = 0; i < before.length; i++) {
    const ch = before[i];
    const prev = i > 0 ? before[i - 1] : '';

    if (prev === '\\') { continue; }

    if (ch === "'" && !inDouble && !inBacktick) { inSingle = !inSingle; }
    else if (ch === '"' && !inSingle && !inBacktick) { inDouble = !inDouble; }
    else if (ch === '`' && !inSingle && !inDouble) { inBacktick = !inBacktick; }
  }

  return inSingle || inDouble || inBacktick;
}

/**
 * Check if cursor is inside function parameters by counting unmatched open parens
 * that follow a function-like keyword or identifier.
 */
function isInsideFunctionSignature(before: string): boolean {
  let depth = 0;

  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i];
    if (ch === ')') { depth++; }
    else if (ch === '(') {
      if (depth > 0) { depth--; }
      else {
        // Found unmatched open paren — check if preceded by function-like pattern
        const preceding = before.slice(0, i).trimEnd();
        if (/(?:function\s*\w*|=>|\w+|=)\s*$/.test(preceding)) {
          return true;
        }
        return false;
      }
    }
  }

  return false;
}

/**
 * Format text based on detected cursor context.
 */
export function formatForContext(text: string, context: CursorContext): string {
  switch (context) {
    case 'string':
      // Inside string: use raw text, no extra formatting
      return text;

    case 'comment':
      // Inside comment: capitalize first letter, add period if missing
      if (!text) { return text; }
      let comment = text.charAt(0).toUpperCase() + text.slice(1);
      if (comment.length > 0 && !/[.!?]$/.test(comment)) {
        comment += '.';
      }
      return comment;

    case 'function-sig':
      // Inside function signature: convert to camelCase parameter name
      return toCamelCase(text);

    case 'code':
    case 'unknown':
    default:
      // General code: return as-is (other processors handle formatting)
      return text;
  }
}

/**
 * Convert spoken words to camelCase identifier.
 * "get user name" → "getUserName"
 */
function toCamelCase(text: string): string {
  const words = text.trim().toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) { return ''; }
  return words[0] + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

export class SmartInsertProcessor implements PostProcessor {
  readonly id = 'smartInsert';
  readonly name = 'Smart Insert';
  readonly description = 'Detect cursor context (string, comment, function signature) and format transcription accordingly';

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (config.get<boolean>('smartInsert') === false) {
      return text;
    }

    // Only apply when there's an active editor with a cursor position
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return text; }

    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const cursorCtx = detectCursorContext(line.text, position.character);

    if (cursorCtx === 'code' || cursorCtx === 'unknown') {
      return text; // No special formatting needed
    }

    return formatForContext(text, cursorCtx);
  }
}
