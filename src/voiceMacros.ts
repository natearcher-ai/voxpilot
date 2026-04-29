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
 * Save macros to VS Code settings (global scope).
 */
async function saveMacros(macros: VoiceMacro[]): Promise<void> {
  const config = vscode.workspace.getConfiguration('voxpilot');
  await config.update('voiceMacroDefinitions', macros, vscode.ConfigurationTarget.Global);
}

/**
 * Check whether voice macros are enabled.
 */
export function isMacrosEnabled(): boolean {
  return vscode.workspace.getConfiguration('voxpilot').get<boolean>('voiceMacros', true);
}

/**
 * Try to match and execute a macro for the given transcript.
 * Returns true if a macro was executed, false otherwise.
 */
export async function tryExecuteMacro(transcript: string): Promise<boolean> {
  if (!isMacrosEnabled()) { return false; }

  const macros = loadMacros();
  if (macros.length === 0) { return false; }

  const match = findMatchingMacro(transcript, macros);
  if (!match) { return false; }

  await executeMacro(match);
  return true;
}

/**
 * Manager for recording, listing, and deleting voice macros.
 */
export class VoiceMacroManager {
  /**
   * Record a new macro via interactive prompts.
   * The user provides a trigger phrase, then builds a list of actions.
   */
  async recordMacro(): Promise<void> {
    const phrase = await vscode.window.showInputBox({
      prompt: 'Trigger phrase — what you\'ll say to activate this macro',
      placeHolder: 'e.g. insert header, wrap try catch, run tests',
      validateInput: (v) => {
        if (!v.trim()) { return 'Phrase cannot be empty'; }
        const existing = loadMacros();
        const norm = normalizePhrase(v);
        if (existing.some(m => normalizePhrase(m.phrase) === norm)) {
          return `A macro with phrase "${v.trim()}" already exists`;
        }
        return undefined;
      },
    });
    if (!phrase) { return; }

    const description = await vscode.window.showInputBox({
      prompt: 'Description (optional)',
      placeHolder: 'e.g. Insert a file header comment',
    });

    const actions: MacroAction[] = [];
    let addMore = true;

    while (addMore) {
      const actionType = await vscode.window.showQuickPick(
        [
          { label: 'insert', description: 'Insert text at cursor' },
          { label: 'snippet', description: 'Insert a VS Code snippet (with tab stops)' },
          { label: 'command', description: 'Execute a VS Code command' },
          { label: 'terminal', description: 'Send text to terminal' },
          { label: 'wrap', description: 'Wrap current selection with prefix/suffix' },
        ],
        { placeHolder: `Action ${actions.length + 1} — choose type` },
      );
      if (!actionType) { break; }

      const action = await this.promptForAction(actionType.label as MacroActionType);
      if (!action) { break; }
      actions.push(action);

      if (actions.length >= 10) { break; } // safety cap

      const more = await vscode.window.showQuickPick(
        [
          { label: 'Done', description: 'Save the macro' },
          { label: 'Add another action', description: `Current: ${actions.length} action(s)` },
        ],
        { placeHolder: 'Add more actions or save?' },
      );
      addMore = more?.label === 'Add another action';
    }

    if (actions.length === 0) {
      vscode.window.showWarningMessage('VoxPilot: Macro not saved — no actions defined.');
      return;
    }

    const macro: VoiceMacro = {
      phrase: phrase.trim(),
      description: description?.trim() || undefined,
      actions,
    };

    const existing = loadMacros();
    existing.push(macro);
    await saveMacros(existing);

    vscode.window.showInformationMessage(
      `VoxPilot: Macro saved — say "${macro.phrase}" to trigger ${actions.length} action(s).`,
    );
  }

  /**
   * Show a quick pick of all macros for management (delete or view).
   */
  async listMacros(): Promise<void> {
    const macros = loadMacros();
    if (macros.length === 0) {
      const action = await vscode.window.showInformationMessage(
        'VoxPilot: No voice macros defined.',
        'Record a Macro',
      );
      if (action === 'Record a Macro') {
        await this.recordMacro();
      }
      return;
    }

    const items = macros.map((m, i) => ({
      label: `"${m.phrase}"`,
      description: m.description || `${m.actions.length} action(s)`,
      detail: m.actions.map(a => `${a.type}: ${a.value.slice(0, 40)}`).join(' → '),
      index: i,
    }));

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a macro to manage',
    });
    if (!pick) { return; }

    const action = await vscode.window.showQuickPick(
      [
        { label: '$(trash) Delete', description: 'Remove this macro', id: 'delete' },
        { label: '$(play) Test', description: 'Execute this macro now', id: 'test' },
      ],
      { placeHolder: `Macro: "${macros[pick.index].phrase}"` },
    );

    if (action?.id === 'delete') {
      const all = loadMacros();
      all.splice(pick.index, 1);
      await saveMacros(all);
      vscode.window.showInformationMessage(`VoxPilot: Macro "${macros[pick.index].phrase}" deleted.`);
    } else if (action?.id === 'test') {
      await executeMacro(macros[pick.index]);
    }
  }

  /** Prompt the user for action details based on type. */
  private async promptForAction(type: MacroActionType): Promise<MacroAction | undefined> {
    switch (type) {
      case 'insert': {
        const value = await vscode.window.showInputBox({
          prompt: 'Text to insert at cursor',
          placeHolder: 'e.g. // TODO: fix this',
        });
        return value ? { type, value } : undefined;
      }

      case 'snippet': {
        const value = await vscode.window.showInputBox({
          prompt: 'Snippet body (use $1, $2 for tab stops)',
          placeHolder: 'e.g. console.log($1);$0',
        });
        return value ? { type, value } : undefined;
      }

      case 'command': {
        const value = await vscode.window.showInputBox({
          prompt: 'VS Code command ID',
          placeHolder: 'e.g. editor.action.formatDocument',
        });
        return value ? { type, value } : undefined;
      }

      case 'terminal': {
        const value = await vscode.window.showInputBox({
          prompt: 'Terminal command to execute',
          placeHolder: 'e.g. npm test',
        });
        return value ? { type, value } : undefined;
      }

      case 'wrap': {
        const value = await vscode.window.showInputBox({
          prompt: 'Prefix (text before selection)',
          placeHolder: 'e.g. try {\\n  ',
        });
        if (!value) { return undefined; }
        const suffix = await vscode.window.showInputBox({
          prompt: 'Suffix (text after selection)',
          placeHolder: 'e.g. \\n} catch (e) {}',
        });
        return { type, value, suffix: suffix || '' };
      }
    }
  }
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
