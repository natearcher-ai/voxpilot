/**
 * Editor voice commands — spoken phrases that execute VS Code editor actions
 * instead of being typed as text.
 *
 * Supported commands:
 *   "undo"                       → editor undo
 *   "redo"                       → editor redo
 *   "save" / "save file"         → save active file
 *   "select all"                 → select all text in editor
 *   "delete line"                → delete current line
 *   "copy" / "copy that"         → copy selection
 *   "cut" / "cut that"           → cut selection
 *   "paste" / "paste that"       → paste from clipboard
 *   "format document"            → format the active document
 *   "close tab" / "close file"   → close active editor tab
 *
 * These are stripped from the transcript and queued as pendingCommands
 * for deferred execution by the engine (via the pipeline context).
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

interface EditorCommand {
  /** Spoken phrases that trigger this command (longest first for matching) */
  phrases: string[];
  /** VS Code command ID to execute */
  command: string;
  /** Optional arguments for the command */
  args?: unknown;
}

const EDITOR_COMMANDS: EditorCommand[] = [
  { phrases: ['select all'], command: 'editor.action.selectAll' },
  { phrases: ['delete line'], command: 'editor.action.deleteLines' },
  { phrases: ['format document'], command: 'editor.action.formatDocument' },
  { phrases: ['close tab', 'close file'], command: 'workbench.action.closeActiveEditor' },
  { phrases: ['save file', 'save'], command: 'workbench.action.files.save' },
  { phrases: ['copy that', 'copy'], command: 'editor.action.clipboardCopyAction' },
  { phrases: ['cut that', 'cut'], command: 'editor.action.clipboardCutAction' },
  { phrases: ['paste that', 'paste'], command: 'editor.action.clipboardPasteAction' },
  { phrases: ['undo'], command: 'undo' },
  { phrases: ['redo'], command: 'redo' },
];

interface CompiledEditorCommand {
  pattern: RegExp;
  command: string;
  args?: unknown;
  /** The primary phrase (first/longest) for logging */
  phrase: string;
}

function compileCommands(): CompiledEditorCommand[] {
  const compiled: CompiledEditorCommand[] = [];

  for (const cmd of EDITOR_COMMANDS) {
    // Sort phrases longest-first so "save file" matches before "save"
    const sorted = [...cmd.phrases].sort((a, b) => b.length - a.length);
    const alternation = sorted
      .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    // Match the command as a whole word, optionally preceded by whitespace
    const pattern = new RegExp(`\\s*\\b(${alternation})\\b\\s*`, 'gi');
    compiled.push({
      pattern,
      command: cmd.command,
      args: cmd.args,
      phrase: sorted[0],
    });
  }

  // Sort compiled commands by phrase length descending so longer phrases match first
  compiled.sort((a, b) => b.phrase.length - a.phrase.length);
  return compiled;
}

const compiledCommands = compileCommands();

/**
 * Post-processor that intercepts spoken editor action phrases,
 * strips them from the transcript, and queues them as VS Code
 * commands for deferred execution.
 */
export class EditorVoiceCommandsProcessor implements PostProcessor {
  readonly id = 'editorVoiceCommands';
  readonly name = 'Editor Voice Commands';
  readonly description = 'Execute editor actions (undo, redo, save, select all, delete line) from spoken phrases';

  process(text: string, context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (config.get<boolean>('editorVoiceCommands') === false) {
      return text;
    }

    let result = text;

    for (const cmd of compiledCommands) {
      const before = result;
      result = result.replace(cmd.pattern, ' ');

      if (result !== before) {
        context.pendingCommands.push({
          command: cmd.command,
          args: cmd.args,
          phrase: cmd.phrase,
        });
        context.voiceCommandsApplied++;
      }
    }

    // Clean up extra whitespace from removals
    result = result.replace(/\s{2,}/g, ' ').trim();

    return result;
  }
}
