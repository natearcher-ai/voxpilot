/**
 * Voice-driven refactoring — say "rename", "extract function", "extract variable"
 * to trigger VS Code's built-in refactoring actions by voice.
 *
 * Supported commands:
 *   "rename <name>"           → Rename symbol at cursor to <name>
 *   "extract function"        → Extract selection to a new function
 *   "extract variable"        → Extract selection to a new variable
 *   "extract constant"        → Extract selection to a new constant
 *   "extract method"          → Extract selection to a new method
 *   "inline variable"         → Inline the variable at cursor
 *   "move to file"            → Move symbol to a new file
 *   "organize imports"        → Sort and remove unused imports
 *   "add import"              → Trigger auto-import suggestion
 *   "quick fix"               → Open quick fix menu at cursor
 *   "refactor"                → Open refactor menu at cursor
 *
 * These are detected as transcript prefixes and executed as VS Code commands
 * instead of being inserted as text.
 */

import * as vscode from 'vscode';

export interface RefactorCommand {
  /** Spoken phrases that trigger this refactoring (longest first) */
  phrases: string[];
  /** VS Code command to execute */
  command: string;
  /** Whether this command takes the remaining transcript as an argument */
  takesArgument: boolean;
  /** Description for UI/help */
  description: string;
}

export const REFACTOR_COMMANDS: RefactorCommand[] = [
  {
    phrases: ['rename to', 'rename'],
    command: 'editor.action.rename',
    takesArgument: true,
    description: 'Rename symbol at cursor',
  },
  {
    phrases: ['extract function', 'extract to function'],
    command: 'editor.action.codeAction',
    takesArgument: false,
    description: 'Extract selection to a new function',
  },
  {
    phrases: ['extract variable', 'extract to variable'],
    command: 'editor.action.codeAction',
    takesArgument: false,
    description: 'Extract selection to a new variable',
  },
  {
    phrases: ['extract constant', 'extract to constant'],
    command: 'editor.action.codeAction',
    takesArgument: false,
    description: 'Extract selection to a new constant',
  },
  {
    phrases: ['extract method', 'extract to method'],
    command: 'editor.action.codeAction',
    takesArgument: false,
    description: 'Extract selection to a new method',
  },
  {
    phrases: ['inline variable', 'inline'],
    command: 'editor.action.codeAction',
    takesArgument: false,
    description: 'Inline the variable at cursor',
  },
  {
    phrases: ['move to file', 'move to new file'],
    command: 'editor.action.codeAction',
    takesArgument: false,
    description: 'Move symbol to a new file',
  },
  {
    phrases: ['organize imports', 'sort imports', 'clean imports'],
    command: 'editor.action.organizeImports',
    takesArgument: false,
    description: 'Sort and remove unused imports',
  },
  {
    phrases: ['add import', 'auto import'],
    command: 'editor.action.autoImport',
    takesArgument: false,
    description: 'Trigger auto-import suggestion',
  },
  {
    phrases: ['quick fix', 'fix this', 'fix it'],
    command: 'editor.action.quickFix',
    takesArgument: false,
    description: 'Open quick fix menu at cursor',
  },
  {
    phrases: ['refactor', 'refactor this'],
    command: 'editor.action.refactor',
    takesArgument: false,
    description: 'Open refactor menu at cursor',
  },
  {
    phrases: ['format document', 'format file'],
    command: 'editor.action.formatDocument',
    takesArgument: false,
    description: 'Format the entire document',
  },
  {
    phrases: ['format selection'],
    command: 'editor.action.formatSelection',
    takesArgument: false,
    description: 'Format the selected code',
  },
];

/**
 * Normalize text for matching: lowercase, collapse whitespace.
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Build a sorted index of [phrase, command] pairs for greedy matching.
 */
function buildIndex(commands: RefactorCommand[]): Array<[string, RefactorCommand]> {
  const pairs: Array<[string, RefactorCommand]> = [];
  for (const cmd of commands) {
    for (const phrase of cmd.phrases) {
      pairs.push([normalize(phrase), cmd]);
    }
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

const REFACTOR_INDEX = buildIndex(REFACTOR_COMMANDS);

export interface RefactorMatch {
  /** The matched refactoring command */
  command: RefactorCommand;
  /** The matched phrase */
  phrase: string;
  /** Remaining text after the phrase (for commands that take arguments) */
  argument: string;
}

/**
 * Check if a transcript matches a refactoring command.
 * Returns the match with any argument text, or null if no match.
 */
export function matchRefactorCommand(transcript: string): RefactorMatch | null {
  const normalized = normalize(transcript);

  for (const [phrase, cmd] of REFACTOR_INDEX) {
    if (normalized === phrase) {
      return { command: cmd, phrase, argument: '' };
    }
    if (normalized.startsWith(phrase + ' ')) {
      const argument = transcript.trim().slice(phrase.length).trim();
      return { command: cmd, phrase, argument };
    }
  }

  return null;
}

/**
 * Execute a matched refactoring command.
 */
export async function executeRefactorCommand(match: RefactorMatch): Promise<boolean> {
  try {
    if (match.command.command === 'editor.action.rename' && match.argument) {
      // For rename: trigger rename, then type the new name
      await vscode.commands.executeCommand('editor.action.rename');
      // Small delay for rename widget to appear
      await new Promise(r => setTimeout(r, 300));
      // Type the new name into the rename widget
      await vscode.commands.executeCommand('type', { text: match.argument });
      return true;
    }

    if (match.command.command === 'editor.action.codeAction') {
      // For code actions: pass the kind as preferred
      const kindMap: Record<string, string> = {
        'extract function': 'refactor.extract.function',
        'extract to function': 'refactor.extract.function',
        'extract variable': 'refactor.extract.constant',
        'extract to variable': 'refactor.extract.constant',
        'extract constant': 'refactor.extract.constant',
        'extract to constant': 'refactor.extract.constant',
        'extract method': 'refactor.extract.function',
        'extract to method': 'refactor.extract.function',
        'inline variable': 'refactor.inline',
        'inline': 'refactor.inline',
        'move to file': 'refactor.move',
        'move to new file': 'refactor.move',
      };

      const kind = kindMap[match.phrase];
      if (kind) {
        await vscode.commands.executeCommand('editor.action.codeAction', {
          kind,
          apply: 'ifSingle',
        });
        return true;
      }
    }

    // Default: just execute the command
    await vscode.commands.executeCommand(match.command.command);
    return true;
  } catch (err: any) {
    vscode.window.showWarningMessage(`VoxPilot: Refactoring "${match.phrase}" failed — ${err.message}`);
    return false;
  }
}
