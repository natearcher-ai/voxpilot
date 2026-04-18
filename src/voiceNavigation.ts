/**
 * Multi-file voice navigation — navigate across workspace files by voice.
 *
 * Say commands like:
 *   "go to file app.ts"           → Open file by name
 *   "find function handleClick"   → Go to function definition
 *   "open test for this file"     → Open corresponding test file
 *   "switch to previous file"     → Go back to last edited file
 *   "go to line 42"               → Jump to line number
 *   "find class UserService"      → Go to class definition
 *   "open recent"                 → Show recent files picker
 *
 * Uses VS Code's workspace symbol search and file finder APIs.
 *
 * Enable via `voxpilot.voiceNavigation` setting (default: true).
 */

import * as vscode from 'vscode';

export type NavigationCommandType =
  | 'go-to-file'
  | 'find-function'
  | 'find-class'
  | 'find-symbol'
  | 'open-test'
  | 'switch-previous'
  | 'go-to-line'
  | 'open-recent';

export interface NavigationMatch {
  type: NavigationCommandType;
  argument: string;
  trigger: string;
}

const NAVIGATION_TRIGGERS: Array<{ phrases: string[]; type: NavigationCommandType }> = [
  { phrases: ['go to file', 'open file', 'switch to file'], type: 'go-to-file' },
  { phrases: ['find function', 'go to function', 'jump to function'], type: 'find-function' },
  { phrases: ['find class', 'go to class', 'jump to class'], type: 'find-class' },
  { phrases: ['find symbol', 'go to symbol', 'jump to symbol'], type: 'find-symbol' },
  { phrases: ['open test', 'go to test', 'switch to test'], type: 'open-test' },
  { phrases: ['switch to previous', 'go back', 'previous file', 'last file'], type: 'switch-previous' },
  { phrases: ['go to line', 'jump to line', 'line'], type: 'go-to-line' },
  { phrases: ['open recent', 'recent files', 'recent'], type: 'open-recent' },
];

function buildNavIndex(): Array<[string, NavigationCommandType]> {
  const pairs: Array<[string, NavigationCommandType]> = [];
  for (const { phrases, type } of NAVIGATION_TRIGGERS) {
    for (const phrase of phrases) {
      pairs.push([phrase.toLowerCase(), type]);
    }
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

const NAV_INDEX = buildNavIndex();

/**
 * Match a transcript against navigation commands.
 */
export function matchNavigation(transcript: string): NavigationMatch | null {
  const normalized = transcript.toLowerCase().replace(/\s+/g, ' ').trim();

  for (const [trigger, type] of NAV_INDEX) {
    if (normalized === trigger) {
      return { type, argument: '', trigger };
    }
    if (normalized.startsWith(trigger + ' ')) {
      const argument = transcript.trim().slice(trigger.length).trim();
      return { type, argument, trigger };
    }
  }

  return null;
}

/**
 * Infer the test file path from a source file path.
 * Handles common conventions: src/foo.ts → src/test/foo.test.ts, __tests__/foo.test.ts
 */
export function inferTestFilePath(filePath: string): string[] {
  const candidates: string[] = [];
  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1];
  const baseName = fileName.replace(/\.(ts|js|tsx|jsx|py|rb|go|rs|java)$/, '');
  const ext = fileName.slice(baseName.length);

  // Convention 1: src/foo.ts → src/test/foo.test.ts
  const dirParts = [...parts.slice(0, -1)];
  candidates.push([...dirParts, 'test', `${baseName}.test${ext}`].join('/'));

  // Convention 2: src/foo.ts → src/__tests__/foo.test.ts
  candidates.push([...dirParts, '__tests__', `${baseName}.test${ext}`].join('/'));

  // Convention 3: src/foo.ts → test/foo.test.ts (root test dir)
  const srcIdx = dirParts.indexOf('src');
  if (srcIdx >= 0) {
    const testParts = [...dirParts];
    testParts[srcIdx] = 'test';
    candidates.push([...testParts, `${baseName}.test${ext}`].join('/'));
  }

  // Convention 4: foo.ts → foo.spec.ts
  candidates.push([...dirParts, `${baseName}.spec${ext}`].join('/'));

  // Convention 5: foo.py → test_foo.py (Python)
  if (ext === '.py') {
    candidates.push([...dirParts, `test_${baseName}${ext}`].join('/'));
    candidates.push([...dirParts, 'tests', `test_${baseName}${ext}`].join('/'));
  }

  return candidates;
}

/**
 * Parse a line number from a voice command argument.
 * Handles: "42", "line 42", "forty two"
 */
export function parseLineNumber(argument: string): number | null {
  // Try direct number
  const num = parseInt(argument.replace(/[^0-9]/g, ''), 10);
  if (!isNaN(num) && num > 0) { return num; }

  // Try word numbers
  const wordNumbers: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    hundred: 100,
  };

  const words = argument.toLowerCase().split(/\s+/);
  let total = 0;
  let current = 0;

  for (const word of words) {
    if (wordNumbers[word] !== undefined) {
      const val = wordNumbers[word];
      if (val === 100) {
        current = (current || 1) * 100;
      } else if (val >= 20) {
        current += val;
      } else {
        current += val;
      }
    }
  }

  total += current;
  return total > 0 ? total : null;
}

/**
 * Execute a navigation command.
 */
export async function executeNavigation(match: NavigationMatch): Promise<boolean> {
  try {
    switch (match.type) {
      case 'go-to-file':
        if (match.argument) {
          await vscode.commands.executeCommand('workbench.action.quickOpen', match.argument);
        } else {
          await vscode.commands.executeCommand('workbench.action.quickOpen');
        }
        return true;

      case 'find-function':
      case 'find-class':
      case 'find-symbol':
        if (match.argument) {
          await vscode.commands.executeCommand('workbench.action.showAllSymbols', match.argument);
        } else {
          await vscode.commands.executeCommand('workbench.action.showAllSymbols');
        }
        return true;

      case 'open-test': {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('VoxPilot: No active file to find test for.');
          return false;
        }
        const candidates = inferTestFilePath(editor.document.uri.fsPath);
        for (const candidate of candidates) {
          try {
            const uri = vscode.Uri.file(candidate);
            await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(uri);
            return true;
          } catch { /* try next candidate */ }
        }
        // Fallback: search for test file
        await vscode.commands.executeCommand('workbench.action.quickOpen', `test ${editor.document.fileName.split('/').pop()}`);
        return true;
      }

      case 'switch-previous':
        await vscode.commands.executeCommand('workbench.action.openPreviousRecentlyUsedEditor');
        return true;

      case 'go-to-line': {
        const lineNum = parseLineNumber(match.argument);
        if (lineNum) {
          await vscode.commands.executeCommand('workbench.action.gotoLine', `${lineNum}`);
        } else {
          await vscode.commands.executeCommand('workbench.action.gotoLine');
        }
        return true;
      }

      case 'open-recent':
        await vscode.commands.executeCommand('workbench.action.quickOpen');
        return true;

      default:
        return false;
    }
  } catch (err: any) {
    vscode.window.showWarningMessage(`VoxPilot: Navigation failed — ${err.message}`);
    return false;
  }
}
