/**
 * Voice-driven debugging — control the VS Code debugger by voice.
 *
 * Say commands like:
 *   "set breakpoint"            → Toggle breakpoint at current line
 *   "remove breakpoint"        → Remove breakpoint at current line
 *   "clear all breakpoints"    → Remove all breakpoints
 *   "step over"                → Step over (next line)
 *   "step into"                → Step into function call
 *   "step out"                 → Step out of current function
 *   "continue"                 → Continue execution
 *   "pause"                    → Pause execution
 *   "stop debugging"           → Stop the debug session
 *   "restart debugging"        → Restart the debug session
 *   "start debugging"          → Start debugging (F5)
 *   "run without debugging"    → Run without debugging (Ctrl+F5)
 *   "inspect <variable>"       → Show variable value in hover/watch
 *   "add watch <expression>"   → Add expression to watch panel
 *   "toggle breakpoint"        → Toggle breakpoint at cursor
 *   "conditional breakpoint <condition>" → Set conditional breakpoint
 *   "log breakpoint <message>" → Set logpoint with message
 *   "run to cursor"            → Run to the cursor position
 *   "focus call stack"         → Focus the call stack panel
 *   "focus variables"          → Focus the variables panel
 *   "focus watch"              → Focus the watch panel
 *   "focus breakpoints"        → Focus the breakpoints panel
 *
 * Enable via `voxpilot.voiceDebugging` setting (default: true).
 */

import * as vscode from 'vscode';

export type DebugCommandType =
  | 'set-breakpoint' | 'remove-breakpoint' | 'clear-breakpoints'
  | 'toggle-breakpoint' | 'conditional-breakpoint' | 'log-breakpoint'
  | 'step-over' | 'step-into' | 'step-out'
  | 'continue' | 'pause' | 'stop' | 'restart'
  | 'start' | 'run-no-debug' | 'run-to-cursor'
  | 'inspect' | 'add-watch'
  | 'focus-call-stack' | 'focus-variables' | 'focus-watch' | 'focus-breakpoints';

export interface DebugMatch {
  type: DebugCommandType;
  argument: string;
  trigger: string;
}

const DEBUG_TRIGGERS: Array<{ phrases: string[]; type: DebugCommandType }> = [
  // Breakpoints
  { phrases: ['set breakpoint', 'add breakpoint', 'breakpoint here'], type: 'set-breakpoint' },
  { phrases: ['remove breakpoint', 'delete breakpoint', 'clear breakpoint'], type: 'remove-breakpoint' },
  { phrases: ['clear all breakpoints', 'remove all breakpoints', 'delete all breakpoints'], type: 'clear-breakpoints' },
  { phrases: ['toggle breakpoint'], type: 'toggle-breakpoint' },
  { phrases: ['conditional breakpoint', 'condition breakpoint'], type: 'conditional-breakpoint' },
  { phrases: ['log breakpoint', 'logpoint', 'log point'], type: 'log-breakpoint' },

  // Stepping
  { phrases: ['step over', 'next line', 'next'], type: 'step-over' },
  { phrases: ['step into', 'step in'], type: 'step-into' },
  { phrases: ['step out', 'step back'], type: 'step-out' },

  // Execution control
  { phrases: ['continue', 'resume', 'go'], type: 'continue' },
  { phrases: ['pause', 'break', 'halt'], type: 'pause' },
  { phrases: ['stop debugging', 'stop debug', 'end debugging', 'kill debug'], type: 'stop' },
  { phrases: ['restart debugging', 'restart debug', 'relaunch'], type: 'restart' },
  { phrases: ['start debugging', 'start debug', 'debug', 'launch'], type: 'start' },
  { phrases: ['run without debugging', 'run no debug', 'run without debug'], type: 'run-no-debug' },
  { phrases: ['run to cursor', 'run to here'], type: 'run-to-cursor' },

  // Inspection
  { phrases: ['inspect variable', 'inspect', 'show value', 'what is'], type: 'inspect' },
  { phrases: ['add watch', 'watch', 'add to watch'], type: 'add-watch' },

  // Panel focus
  { phrases: ['focus call stack', 'show call stack', 'open call stack'], type: 'focus-call-stack' },
  { phrases: ['focus variables', 'show variables', 'open variables'], type: 'focus-variables' },
  { phrases: ['focus watch', 'show watch', 'open watch'], type: 'focus-watch' },
  { phrases: ['focus breakpoints', 'show breakpoints', 'open breakpoints'], type: 'focus-breakpoints' },
];

function buildDebugIndex(): Array<[string, DebugCommandType]> {
  const pairs: Array<[string, DebugCommandType]> = [];
  for (const { phrases, type } of DEBUG_TRIGGERS) {
    for (const phrase of phrases) {
      pairs.push([phrase.toLowerCase(), type]);
    }
  }
  // Sort by length descending for greedy matching (longest phrase first)
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

const DEBUG_INDEX = buildDebugIndex();

/**
 * Match a transcript against debug commands.
 */
export function matchDebugCommand(transcript: string): DebugMatch | null {
  const normalized = transcript.toLowerCase().replace(/\s+/g, ' ').trim();

  for (const [trigger, type] of DEBUG_INDEX) {
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
 * Execute a matched debug command via VS Code's debug API.
 */
export async function executeDebugCommand(match: DebugMatch): Promise<boolean> {
  try {
    switch (match.type) {
      // Breakpoints
      case 'set-breakpoint':
      case 'toggle-breakpoint':
        await vscode.commands.executeCommand('editor.debug.action.toggleBreakpoint');
        return true;

      case 'remove-breakpoint': {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('VoxPilot: No active editor to remove breakpoint from.');
          return false;
        }
        const line = editor.selection.active.line;
        const uri = editor.document.uri;
        const existing = vscode.debug.breakpoints.filter(
          bp => bp instanceof vscode.SourceBreakpoint &&
            bp.location.uri.toString() === uri.toString() &&
            bp.location.range.start.line === line,
        );
        if (existing.length > 0) {
          vscode.debug.removeBreakpoints(existing);
          return true;
        }
        vscode.window.showInformationMessage('VoxPilot: No breakpoint on current line.');
        return true;
      }

      case 'clear-breakpoints':
        vscode.debug.removeBreakpoints(vscode.debug.breakpoints);
        vscode.window.showInformationMessage(`VoxPilot: Cleared all breakpoints.`);
        return true;

      case 'conditional-breakpoint': {
        if (!match.argument) {
          // Open inline breakpoint widget for user to type condition
          await vscode.commands.executeCommand('editor.debug.action.conditionalBreakpoint');
          return true;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('VoxPilot: No active editor.');
          return false;
        }
        const location = new vscode.Location(
          editor.document.uri,
          new vscode.Position(editor.selection.active.line, 0),
        );
        const bp = new vscode.SourceBreakpoint(location, true, match.argument);
        vscode.debug.addBreakpoints([bp]);
        return true;
      }

      case 'log-breakpoint': {
        if (!match.argument) {
          await vscode.commands.executeCommand('editor.debug.action.toggleLogPoint');
          return true;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('VoxPilot: No active editor.');
          return false;
        }
        const location = new vscode.Location(
          editor.document.uri,
          new vscode.Position(editor.selection.active.line, 0),
        );
        const bp = new vscode.SourceBreakpoint(location, true, undefined, undefined, match.argument);
        vscode.debug.addBreakpoints([bp]);
        return true;
      }

      // Stepping
      case 'step-over':
        await vscode.commands.executeCommand('workbench.action.debug.stepOver');
        return true;

      case 'step-into':
        await vscode.commands.executeCommand('workbench.action.debug.stepInto');
        return true;

      case 'step-out':
        await vscode.commands.executeCommand('workbench.action.debug.stepOut');
        return true;

      // Execution control
      case 'continue':
        await vscode.commands.executeCommand('workbench.action.debug.continue');
        return true;

      case 'pause':
        await vscode.commands.executeCommand('workbench.action.debug.pause');
        return true;

      case 'stop':
        await vscode.commands.executeCommand('workbench.action.debug.stop');
        return true;

      case 'restart':
        await vscode.commands.executeCommand('workbench.action.debug.restart');
        return true;

      case 'start':
        await vscode.commands.executeCommand('workbench.action.debug.start');
        return true;

      case 'run-no-debug':
        await vscode.commands.executeCommand('workbench.action.debug.run');
        return true;

      case 'run-to-cursor':
        await vscode.commands.executeCommand('editor.debug.action.runToCursor');
        return true;

      // Inspection
      case 'inspect': {
        if (!match.argument) {
          // Show debug hover at cursor position
          await vscode.commands.executeCommand('editor.debug.action.showDebugHover');
          return true;
        }
        // Try to select the word in the editor and show hover
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const doc = editor.document;
          const text = doc.getText();
          const varName = match.argument.trim();
          // Find the variable in the current visible range
          const visibleRange = editor.visibleRanges[0];
          if (visibleRange) {
            const visibleText = doc.getText(visibleRange);
            const regex = new RegExp(`\\b${escapeRegex(varName)}\\b`);
            const localMatch = regex.exec(visibleText);
            if (localMatch) {
              const offset = doc.offsetAt(visibleRange.start) + localMatch.index;
              const pos = doc.positionAt(offset);
              editor.selection = new vscode.Selection(pos, pos.translate(0, varName.length));
              await vscode.commands.executeCommand('editor.debug.action.showDebugHover');
              return true;
            }
          }
        }
        // Fallback: add to watch panel
        await addToWatch(match.argument);
        return true;
      }

      case 'add-watch': {
        if (!match.argument) {
          vscode.window.showWarningMessage('VoxPilot: Say "add watch" followed by an expression.');
          return false;
        }
        await addToWatch(match.argument);
        return true;
      }

      // Panel focus
      case 'focus-call-stack':
        await vscode.commands.executeCommand('workbench.debug.action.focusCallStackView');
        return true;

      case 'focus-variables':
        await vscode.commands.executeCommand('workbench.debug.action.focusVariablesView');
        return true;

      case 'focus-watch':
        await vscode.commands.executeCommand('workbench.debug.action.focusWatchView');
        return true;

      case 'focus-breakpoints':
        await vscode.commands.executeCommand('workbench.debug.action.focusBreakpointsView');
        return true;

      default:
        return false;
    }
  } catch (err: any) {
    vscode.window.showWarningMessage(`VoxPilot: Debug command "${match.trigger}" failed — ${err.message}`);
    return false;
  }
}

/**
 * Add an expression to the debug watch panel.
 */
async function addToWatch(expression: string): Promise<void> {
  try {
    await vscode.commands.executeCommand('workbench.debug.action.focusWatchView');
    await new Promise(r => setTimeout(r, 200));
    await vscode.commands.executeCommand('workbench.debug.viewlet.action.addExpression', expression);
  } catch {
    // Fallback: use the debug console to evaluate
    try {
      await vscode.commands.executeCommand('workbench.debug.action.focusRepl');
      await new Promise(r => setTimeout(r, 200));
      // Type the expression into the debug console
      const original = await vscode.env.clipboard.readText();
      await vscode.env.clipboard.writeText(expression);
      await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
      await vscode.env.clipboard.writeText(original);
    } catch (err: any) {
      vscode.window.showWarningMessage(`VoxPilot: Could not add "${expression}" to watch — ${err.message}`);
    }
  }
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
