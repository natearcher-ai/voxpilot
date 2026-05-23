/**
 * Voice-driven Terminal — run shell commands, navigate output, pipe results by voice.
 *
 * Detects spoken terminal commands and executes them in VS Code's integrated terminal:
 *   "run <command>"               → Execute command in terminal
 *   "terminal <command>"          → Execute command in terminal
 *   "npm install <package>"       → npm install in terminal
 *   "npm run <script>"            → npm run script
 *   "list files"                  → ls / dir
 *   "change directory <path>"     → cd <path>
 *   "clear terminal"              → clear / cls
 *   "kill process"                → Ctrl+C (SIGINT)
 *   "new terminal"                → Open new terminal
 *   "close terminal"              → Close active terminal
 *   "next terminal"               → Switch to next terminal
 *   "previous terminal"           → Switch to previous terminal
 *   "scroll up"                   → Scroll terminal up
 *   "scroll down"                 → Scroll terminal down
 *
 * Safety: destructive commands (rm -rf, format, drop) require voice confirmation.
 * Enable via `voxpilot.voiceTerminal` setting (default: true).
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

/** Terminal command types */
export type TerminalCommandType =
  | 'execute' | 'npm-install' | 'npm-run' | 'list-files'
  | 'cd' | 'clear' | 'kill' | 'new' | 'close'
  | 'next' | 'previous' | 'scroll-up' | 'scroll-down';

/** Parsed terminal command */
export interface TerminalCommand {
  type: TerminalCommandType;
  argument: string;
  raw: string;
  dangerous: boolean;
}

/** Dangerous command patterns */
const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--recursive)/i,
  /rmdir\s+\/s/i,
  /format\s+/i,
  /drop\s+(database|table)/i,
  /truncate\s+/i,
  /del\s+\/[sfq]/i,
  />\s*\/dev\/null/i,
  /mkfs/i,
  /dd\s+if=/i,
];

/** Terminal trigger definitions */
interface TerminalTrigger {
  phrases: string[];
  type: TerminalCommandType;
  capturesArg: boolean;
}

const TERMINAL_TRIGGERS: TerminalTrigger[] = [
  { phrases: ['npm install', 'npm add'], type: 'npm-install', capturesArg: true },
  { phrases: ['npm run', 'npm start', 'npm test'], type: 'npm-run', capturesArg: true },
  { phrases: ['run command', 'run', 'execute', 'terminal'], type: 'execute', capturesArg: true },
  { phrases: ['list files', 'show files', 'ls', 'dir'], type: 'list-files', capturesArg: false },
  { phrases: ['change directory', 'cd'], type: 'cd', capturesArg: true },
  { phrases: ['clear terminal', 'clear screen', 'clear'], type: 'clear', capturesArg: false },
  { phrases: ['kill process', 'stop process', 'cancel', 'control c'], type: 'kill', capturesArg: false },
  { phrases: ['new terminal', 'open terminal'], type: 'new', capturesArg: false },
  { phrases: ['close terminal'], type: 'close', capturesArg: false },
  { phrases: ['next terminal', 'switch terminal'], type: 'next', capturesArg: false },
  { phrases: ['previous terminal', 'prev terminal'], type: 'previous', capturesArg: false },
  { phrases: ['scroll up'], type: 'scroll-up', capturesArg: false },
  { phrases: ['scroll down'], type: 'scroll-down', capturesArg: false },
];

/** Compiled trigger */
interface CompiledTrigger {
  pattern: RegExp;
  trigger: TerminalTrigger;
}

/**
 * Check if a command string is potentially dangerous.
 */
export function isDangerous(command: string): boolean {
  return DANGEROUS_PATTERNS.some(p => p.test(command));
}

/**
 * Parse a voice input into a terminal command.
 */
export function parseTerminalCommand(text: string): TerminalCommand | null {
  const trimmed = text.trim().toLowerCase();

  for (const trigger of TERMINAL_TRIGGERS) {
    for (const phrase of trigger.phrases) {
      if (trimmed === phrase) {
        return {
          type: trigger.type,
          argument: '',
          raw: text.trim(),
          dangerous: false,
        };
      }
      if (trigger.capturesArg && trimmed.startsWith(phrase + ' ')) {
        const arg = text.trim().slice(phrase.length).trim();
        return {
          type: trigger.type,
          argument: arg,
          raw: text.trim(),
          dangerous: isDangerous(arg),
        };
      }
    }
  }

  return null;
}

/**
 * Build the actual shell command string from a parsed command.
 */
export function buildShellCommand(cmd: TerminalCommand): string | null {
  switch (cmd.type) {
    case 'execute':
      return cmd.argument || null;
    case 'npm-install':
      return cmd.argument ? `npm install ${cmd.argument}` : 'npm install';
    case 'npm-run':
      return cmd.argument ? `npm run ${cmd.argument}` : null;
    case 'list-files':
      return process.platform === 'win32' ? 'dir' : 'ls -la';
    case 'cd':
      return cmd.argument ? `cd ${cmd.argument}` : null;
    case 'clear':
      return process.platform === 'win32' ? 'cls' : 'clear';
    default:
      return null;
  }
}

/**
 * Execute a terminal command in VS Code.
 */
export async function executeTerminalCommand(cmd: TerminalCommand): Promise<boolean> {
  // Handle terminal management commands via VS Code API
  switch (cmd.type) {
    case 'new':
      vscode.window.createTerminal('VoxPilot');
      return true;
    case 'close':
      vscode.window.activeTerminal?.dispose();
      return true;
    case 'next':
      await vscode.commands.executeCommand('workbench.action.terminal.focusNext');
      return true;
    case 'previous':
      await vscode.commands.executeCommand('workbench.action.terminal.focusPrevious');
      return true;
    case 'scroll-up':
      await vscode.commands.executeCommand('workbench.action.terminal.scrollUp');
      return true;
    case 'scroll-down':
      await vscode.commands.executeCommand('workbench.action.terminal.scrollDown');
      return true;
    case 'kill':
      await vscode.commands.executeCommand('workbench.action.terminal.sendSequence', { text: '\x03' });
      return true;
  }

  // Build and execute shell command
  const shellCmd = buildShellCommand(cmd);
  if (!shellCmd) {
    vscode.window.showWarningMessage(`VoxPilot Terminal: command requires an argument.`);
    return false;
  }

  // Safety check for dangerous commands
  if (cmd.dangerous) {
    const confirm = await vscode.window.showWarningMessage(
      `⚠️ This command may be destructive:\n\n${shellCmd}\n\nProceed?`,
      { modal: true },
      'Yes, execute',
    );
    if (confirm !== 'Yes, execute') return false;
  }

  // Get or create terminal
  let terminal = vscode.window.activeTerminal;
  if (!terminal) {
    terminal = vscode.window.createTerminal('VoxPilot');
  }
  terminal.show(true);
  terminal.sendText(shellCmd, true);

  return true;
}

/**
 * Voice Terminal processor — detects terminal commands in transcripts.
 */
export class VoiceTerminalProcessor implements PostProcessor {
  readonly id = 'voiceTerminal';
  readonly name = 'Voice Terminal';
  readonly description = 'Execute shell commands and manage terminals by voice';

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (!config.get<boolean>('voiceTerminal', true)) {
      return text;
    }

    const cmd = parseTerminalCommand(text);
    if (cmd) {
      executeTerminalCommand(cmd);
      return '';
    }

    return text;
  }
}

/** Singleton instance */
export const voiceTerminal = new VoiceTerminalProcessor();
