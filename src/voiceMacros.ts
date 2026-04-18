/**
 * Voice macros — record and replay custom voice-triggered code snippets
 * and multi-step editor actions.
 *
 * Users can define macros that map a spoken phrase to a sequence of actions:
 *   "insert header"     → inserts a file header template
 *   "wrap try catch"    → wraps selection in try/catch block
 *   "log selection"     → wraps selection in console.log()
 *   "run tests"         → executes terminal command "npm test"
 *
 * Macro actions:
 *   - insert: Insert text at cursor
 *   - snippet: Insert a VS Code snippet (with tab stops)
 *   - command: Execute a VS Code command
 *   - terminal: Send text to terminal
 *   - wrap: Wrap current selection with prefix/suffix
 *
 * Macros are stored in voxpilot.voiceMacros setting.
 * Enable via `voxpilot.voiceMacros` setting (default: true).
 */

import * as vscode from 'vscode';

export type MacroActionType = 'insert' | 'snippet' | 'command' | 'terminal' | 'wrap';

export interface MacroAction {
  /** Type of action to perform */
  type: MacroActionType;
  /** Text to insert, snippet body, command ID, or terminal text */
  value: string;
  /** For 'wrap' type: suffix to add after selection */
  suffix?: string;
  /** For 'command' type: optional arguments */
  args?: unknown;
}

export interface VoiceMacro {
  /** Spoken phrase that triggers this macro (case-insensitive) */
  phrase: string;
  /** Human-readable description */
  description?: string;
  /** Sequence of actions to execute */
  actions: MacroAction[];
}

/**
 * Normalize a phrase for matching: lowercase, collapse whitespace, strip punctuation.
 */
export function normalizePhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a transcript matches any macro phrase.
 * Returns the matched macro or undefined.
 * Matches are checked longest-phrase-first for greedy matching.
 */
export function findMatchingMacro(transcript: string, macros: VoiceMacro[]): VoiceMacro | undefined {
  const normalized = normalizePhrase(transcript);

  // Sort by phrase length descending for greedy matching
  const sorted = [...macros].sort((a, b) =>
    normalizePhrase(b.phrase).length - normalizePhrase(a.phrase).length
  );

  for (const macro of sorted) {
    const macroPhrase = normalizePhrase(macro.phrase);
    if (!macroPhrase) { continue; }

    // Check if the transcript starts with or exactly matches the macro phrase
    if (normalized === macroPhrase || normalized.startsWith(macroPhrase + ' ')) {
      return macro;
    }
  }

  return undefined;
}

/**
 * Execute a single macro action.
 */
export async function executeMacroAction(action: MacroAction): Promise<void> {
  switch (action.type) {
    case 'insert': {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await editor.edit(editBuilder => {
          editBuilder.insert(editor.selection.active, action.value);
        });
      }
      break;
    }

    case 'snippet': {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await editor.insertSnippet(new vscode.SnippetString(action.value));
      }
      break;
    }

    case 'command': {
      if (action.args !== undefined) {
        await vscode.commands.executeCommand(action.value, action.args);
      } else {
        await vscode.commands.executeCommand(action.value);
      }
      break;
    }

    case 'terminal': {
      let terminal = vscode.window.activeTerminal;
      if (!terminal) {
        terminal = vscode.window.createTerminal('VoxPilot Macro');
      }
      terminal.show(true);
      terminal.sendText(action.value, true);
      break;
    }

    case 'wrap': {
      const editor = vscode.window.activeTextEditor;
      if (editor && !editor.selection.isEmpty) {
        const selection = editor.document.getText(editor.selection);
        await editor.edit(editBuilder => {
          editBuilder.replace(editor.selection, `${action.value}${selection}${action.suffix || ''}`);
        });
      }
      break;
    }
  }
}

/**
 * Execute all actions in a macro sequentially.
 */
export async function executeMacro(macro: VoiceMacro): Promise<void> {
  for (const action of macro.actions) {
    await executeMacroAction(action);
  }
}

/**
 * Load macros from VS Code settings.
 */
export function loadMacros(): VoiceMacro[] {
  const config = vscode.workspace.getConfiguration('voxpilot');
  const macros = config.get<VoiceMacro[]>('voiceMacroDefinitions', []);

  // Validate
  return macros.filter(m =>
    m.phrase && typeof m.phrase === 'string' &&
    Array.isArray(m.actions) && m.actions.length > 0
  );
}

/**
 * Built-in example macros (not active by default — just for documentation).
 */
export const EXAMPLE_MACROS: VoiceMacro[] = [
  {
    phrase: 'insert header',
    description: 'Insert a file header comment',
    actions: [{ type: 'insert', value: '/**\n * ${1:Description}\n * @author ${2:Author}\n */\n' }],
  },
  {
    phrase: 'wrap try catch',
    description: 'Wrap selection in try/catch block',
    actions: [{ type: 'wrap', value: 'try {\n  ', suffix: '\n} catch (error) {\n  console.error(error);\n}' }],
  },
  {
    phrase: 'log selection',
    description: 'Wrap selection in console.log()',
    actions: [{ type: 'wrap', value: 'console.log(', suffix: ');' }],
  },
  {
    phrase: 'run tests',
    description: 'Run npm test in terminal',
    actions: [{ type: 'terminal', value: 'npm test' }],
  },
];
