/**
 * Custom voice command schema — user-defined voice-to-action mappings.
 *
 * Users define commands in settings.json under `voxpilot.customVoiceCommands`.
 * Each entry maps a spoken phrase to an action:
 *   - "insert": replace the phrase with custom text
 *   - "command": execute a VS Code command (runtime in v0.6.9)
 *
 * This module handles schema validation, loading, and provides a pipeline
 * processor for insert-type commands.
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

/** Supported action types for custom voice commands */
export type CustomVoiceCommandAction = 'insert' | 'command';

/** A single user-defined voice command mapping */
export interface CustomVoiceCommand {
  /** The spoken phrase to match (case-insensitive) */
  phrase: string;
  /** Action type: "insert" replaces phrase with text, "command" runs a VS Code command */
  action: CustomVoiceCommandAction;
  /** Replacement text for "insert" actions. Supports \n and \t escapes. */
  text?: string;
  /** VS Code command ID for "command" actions (executed in v0.6.9) */
  command?: string;
  /** Optional arguments for "command" actions */
  args?: unknown;
  /** Optional description for UI display */
  description?: string;
}

/** Validation result for a single command entry */
export interface ValidationError {
  index: number;
  message: string;
}

/**
 * Validate an array of custom voice command definitions.
 * Returns an array of errors (empty = valid).
 */
export function validateCustomCommands(commands: unknown[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenPhrases = new Set<string>();

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i] as Record<string, unknown>;

    if (!cmd || typeof cmd !== 'object') {
      errors.push({ index: i, message: 'Entry must be an object' });
      continue;
    }

    // phrase is required and must be a non-empty string
    if (typeof cmd.phrase !== 'string' || !cmd.phrase.trim()) {
      errors.push({ index: i, message: 'Missing or empty "phrase"' });
      continue;
    }

    const phrase = cmd.phrase.trim().toLowerCase();

    // Check for duplicate phrases
    if (seenPhrases.has(phrase)) {
      errors.push({ index: i, message: `Duplicate phrase "${cmd.phrase}"` });
    }
    seenPhrases.add(phrase);

    // action is required
    if (cmd.action !== 'insert' && cmd.action !== 'command') {
      errors.push({ index: i, message: `Invalid action "${cmd.action}" — must be "insert" or "command"` });
      continue;
    }

    // insert requires text
    if (cmd.action === 'insert') {
      if (typeof cmd.text !== 'string') {
        errors.push({ index: i, message: '"insert" action requires a "text" string' });
      }
    }

    // command requires command id
    if (cmd.action === 'command') {
      if (typeof cmd.command !== 'string' || !cmd.command.trim()) {
        errors.push({ index: i, message: '"command" action requires a "command" string (VS Code command ID)' });
      }
    }
  }

  return errors;
}

/** A compiled custom command ready for matching */
interface CompiledCommand {
  pattern: RegExp;
  original: CustomVoiceCommand;
}

/**
 * Load and compile custom voice commands from VS Code settings.
 * Returns only valid, compiled commands. Logs warnings for invalid entries.
 */
export function loadCustomCommands(): CompiledCommand[] {
  const config = vscode.workspace.getConfiguration('voxpilot');
  const raw = config.get<unknown[]>('customVoiceCommands', []);

  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  const errors = validateCustomCommands(raw);
  if (errors.length > 0) {
    const channel = vscode.window.createOutputChannel('VoxPilot');
    for (const err of errors) {
      channel.appendLine(`[CustomVoiceCommands] Entry ${err.index}: ${err.message}`);
    }
    // Don't show a modal — just log. Users can check the output channel.
  }

  const errorIndices = new Set(errors.map(e => e.index));
  const compiled: CompiledCommand[] = [];

  for (let i = 0; i < raw.length; i++) {
    if (errorIndices.has(i)) { continue; }
    const cmd = raw[i] as CustomVoiceCommand;
    const escaped = cmd.phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
    compiled.push({ pattern, original: cmd });
  }

  // Sort by phrase length descending so longer phrases match first
  compiled.sort((a, b) => b.original.phrase.length - a.original.phrase.length);

  return compiled;
}

/**
 * Process escape sequences in replacement text (\n, \t).
 */
function processEscapes(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

/**
 * Post-processor that applies user-defined custom voice commands (insert type).
 * Command-type actions are stored for deferred execution by the engine (v0.6.9).
 */
export class CustomVoiceCommandsProcessor implements PostProcessor {
  readonly id = 'customVoiceCommands';
  readonly name = 'Custom Voice Commands';
  readonly description = 'Apply user-defined voice-to-text mappings from settings.json';

  private commands: CompiledCommand[] = [];

  constructor() {
    this.reload();
  }

  /** Reload custom commands from settings */
  reload(): void {
    this.commands = loadCustomCommands();
  }

  /** Get the number of loaded custom commands */
  get commandCount(): number {
    return this.commands.length;
  }

  process(text: string, context: ProcessorContext): string {
    if (this.commands.length === 0) { return text; }

    let result = text;

    for (const cmd of this.commands) {
      if (cmd.original.action === 'insert') {
        const replacement = processEscapes(cmd.original.text ?? '');
        const before = result;
        result = result.replace(cmd.pattern, replacement);

        if (result !== before) {
          context.voiceCommandsApplied++;
        }
      } else if (cmd.original.action === 'command') {
        // Check if the phrase appears in the text
        const before = result;
        // Strip the phrase from the transcript
        result = result.replace(cmd.pattern, '');

        if (result !== before) {
          // Queue the VS Code command for deferred execution
          context.pendingCommands.push({
            command: cmd.original.command!,
            args: cmd.original.args,
            phrase: cmd.original.phrase,
          });
          context.voiceCommandsApplied++;
        }
      }
    }

    return result;
  }
}
