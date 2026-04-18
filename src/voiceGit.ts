/**
 * Voice-driven git — execute git operations by voice.
 *
 * Say commands like:
 *   "commit <message>"           → git commit -m "<message>"
 *   "push"                       → git push
 *   "pull"                       → git pull
 *   "stash"                      → git stash
 *   "stash pop"                  → git stash pop
 *   "checkout <branch>"          → git checkout <branch>
 *   "create branch <name>"       → git checkout -b <name>
 *   "merge <branch>"             → git merge <branch>
 *   "status"                     → git status (show in output channel)
 *   "diff"                       → git diff (open diff view)
 *   "log"                        → git log --oneline -10
 *   "stage all"                  → git add -A
 *   "unstage all"                → git reset HEAD
 *   "discard changes"            → git checkout -- . (with confirmation)
 *
 * Dangerous operations (discard, force push) require confirmation.
 *
 * Enable via `voxpilot.voiceGit` setting (default: true).
 */

import * as vscode from 'vscode';

export type GitCommandType =
  | 'commit' | 'push' | 'pull' | 'stash' | 'stash-pop'
  | 'checkout' | 'create-branch' | 'merge' | 'status'
  | 'diff' | 'log' | 'stage-all' | 'unstage-all' | 'discard';

export interface GitMatch {
  type: GitCommandType;
  argument: string;
  trigger: string;
  dangerous: boolean;
}

const GIT_TRIGGERS: Array<{ phrases: string[]; type: GitCommandType; dangerous?: boolean }> = [
  { phrases: ['commit'], type: 'commit' },
  { phrases: ['push', 'git push'], type: 'push' },
  { phrases: ['pull', 'git pull'], type: 'pull' },
  { phrases: ['stash pop', 'pop stash', 'unstash'], type: 'stash-pop' },
  { phrases: ['stash', 'git stash'], type: 'stash' },
  { phrases: ['checkout branch', 'switch to branch', 'switch branch', 'checkout'], type: 'checkout' },
  { phrases: ['create branch', 'new branch'], type: 'create-branch' },
  { phrases: ['merge branch', 'merge'], type: 'merge' },
  { phrases: ['git status', 'status'], type: 'status' },
  { phrases: ['git diff', 'show diff', 'diff'], type: 'diff' },
  { phrases: ['git log', 'show log', 'log'], type: 'log' },
  { phrases: ['stage all', 'add all', 'stage everything'], type: 'stage-all' },
  { phrases: ['unstage all', 'unstage everything', 'reset stage'], type: 'unstage-all' },
  { phrases: ['discard changes', 'discard all changes', 'reset changes'], type: 'discard', dangerous: true },
];

function buildGitIndex(): Array<[string, GitCommandType, boolean]> {
  const pairs: Array<[string, GitCommandType, boolean]> = [];
  for (const { phrases, type, dangerous } of GIT_TRIGGERS) {
    for (const phrase of phrases) {
      pairs.push([phrase.toLowerCase(), type, dangerous ?? false]);
    }
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

const GIT_INDEX = buildGitIndex();

/**
 * Match a transcript against git commands.
 */
export function matchGitCommand(transcript: string): GitMatch | null {
  const normalized = transcript.toLowerCase().replace(/\s+/g, ' ').trim();

  for (const [trigger, type, dangerous] of GIT_INDEX) {
    if (normalized === trigger) {
      return { type, argument: '', trigger, dangerous };
    }
    if (normalized.startsWith(trigger + ' ')) {
      const argument = transcript.trim().slice(trigger.length).trim();
      return { type, argument, trigger, dangerous };
    }
  }

  return null;
}

/**
 * Build the git command string for a matched voice command.
 */
export function buildGitCommand(match: GitMatch): string | null {
  switch (match.type) {
    case 'commit':
      if (!match.argument) { return null; }
      // Sanitize commit message (escape quotes)
      const msg = match.argument.replace(/"/g, '\\"');
      return `git commit -m "${msg}"`;

    case 'push':
      return 'git push';

    case 'pull':
      return 'git pull';

    case 'stash':
      return 'git stash';

    case 'stash-pop':
      return 'git stash pop';

    case 'checkout':
      if (!match.argument) { return null; }
      const branch = match.argument.replace(/[^a-zA-Z0-9_\-/.]/g, '');
      return `git checkout ${branch}`;

    case 'create-branch':
      if (!match.argument) { return null; }
      const newBranch = match.argument.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_\-/.]/g, '');
      return `git checkout -b ${newBranch}`;

    case 'merge':
      if (!match.argument) { return null; }
      const mergeBranch = match.argument.replace(/[^a-zA-Z0-9_\-/.]/g, '');
      return `git merge ${mergeBranch}`;

    case 'status':
      return 'git status';

    case 'diff':
      return 'git diff';

    case 'log':
      return 'git log --oneline -10';

    case 'stage-all':
      return 'git add -A';

    case 'unstage-all':
      return 'git reset HEAD';

    case 'discard':
      return 'git checkout -- .';

    default:
      return null;
  }
}

/**
 * Sanitize a branch name from voice input.
 * Converts spaces to hyphens, removes invalid characters.
 */
export function sanitizeBranchName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_\-/.]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Execute a git command via VS Code's built-in git extension or terminal.
 */
export async function executeGitCommand(match: GitMatch): Promise<boolean> {
  // Dangerous operations need confirmation
  if (match.dangerous) {
    const confirm = await vscode.window.showWarningMessage(
      `VoxPilot: Are you sure you want to ${match.trigger}? This cannot be undone.`,
      { modal: true },
      'Yes, proceed',
    );
    if (confirm !== 'Yes, proceed') { return false; }
  }

  const cmd = buildGitCommand(match);
  if (!cmd) {
    vscode.window.showWarningMessage(`VoxPilot: "${match.trigger}" requires an argument.`);
    return false;
  }

  // Use VS Code's built-in git commands when available
  try {
    switch (match.type) {
      case 'stage-all':
        await vscode.commands.executeCommand('git.stageAll');
        return true;
      case 'unstage-all':
        await vscode.commands.executeCommand('git.unstageAll');
        return true;
      case 'push':
        await vscode.commands.executeCommand('git.push');
        return true;
      case 'pull':
        await vscode.commands.executeCommand('git.pull');
        return true;
      case 'stash':
        await vscode.commands.executeCommand('git.stash');
        return true;
      case 'stash-pop':
        await vscode.commands.executeCommand('git.stashPop');
        return true;
      case 'diff':
        await vscode.commands.executeCommand('git.openAllChanges');
        return true;
    }
  } catch {
    // Fall through to terminal execution
  }

  // Fallback: execute in terminal
  let terminal = vscode.window.activeTerminal;
  if (!terminal) {
    terminal = vscode.window.createTerminal('VoxPilot Git');
  }
  terminal.show(true);
  terminal.sendText(cmd, true);
  return true;
}
