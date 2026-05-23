/**
 * Voice-driven Code Review — navigate PR diffs, approve, request changes by voice.
 *
 * Voice commands for code review workflows:
 *   "next change"                 → Navigate to next diff hunk
 *   "previous change"            → Navigate to previous diff hunk
 *   "next file"                  → Jump to next changed file
 *   "previous file"              → Jump to previous changed file
 *   "approve"                    → Approve the PR
 *   "request changes"            → Request changes on the PR
 *   "comment <text>"             → Add inline comment at current position
 *   "suggest <text>"             → Add suggestion (code block) at current position
 *   "resolve thread"             → Resolve the current review thread
 *   "show diff"                  → Open the diff view
 *   "show files changed"         → Show list of changed files
 *   "summarize changes"          → AI-generated summary of the PR
 *   "what changed in <file>"     → Focus on specific file changes
 *   "mark as viewed"             → Mark current file as viewed
 *   "start review"               → Begin a new review
 *   "submit review"              → Submit pending review
 *
 * Integrates with VS Code's built-in Git and GitHub PR extension.
 * Enable via `voxpilot.voiceCodeReview` setting (default: true).
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

/** Code review command types */
export type ReviewCommandType =
  | 'next-change' | 'prev-change' | 'next-file' | 'prev-file'
  | 'approve' | 'request-changes' | 'comment' | 'suggest'
  | 'resolve-thread' | 'show-diff' | 'show-files'
  | 'summarize' | 'what-changed' | 'mark-viewed'
  | 'start-review' | 'submit-review';

/** Parsed review command */
export interface ReviewCommand {
  type: ReviewCommandType;
  argument: string;
  requiresConfirmation: boolean;
}

/** Review trigger definition */
interface ReviewTrigger {
  phrases: string[];
  type: ReviewCommandType;
  capturesArg: boolean;
  requiresConfirmation: boolean;
}

const REVIEW_TRIGGERS: ReviewTrigger[] = [
  { phrases: ['next change', 'next diff', 'next hunk'], type: 'next-change', capturesArg: false, requiresConfirmation: false },
  { phrases: ['previous change', 'prev change', 'previous diff', 'prev diff'], type: 'prev-change', capturesArg: false, requiresConfirmation: false },
  { phrases: ['next file', 'next changed file'], type: 'next-file', capturesArg: false, requiresConfirmation: false },
  { phrases: ['previous file', 'prev file'], type: 'prev-file', capturesArg: false, requiresConfirmation: false },
  { phrases: ['approve', 'approve pr', 'approve pull request', 'lgtm'], type: 'approve', capturesArg: false, requiresConfirmation: true },
  { phrases: ['request changes', 'needs changes'], type: 'request-changes', capturesArg: false, requiresConfirmation: true },
  { phrases: ['comment', 'add comment', 'review comment'], type: 'comment', capturesArg: true, requiresConfirmation: false },
  { phrases: ['suggest', 'add suggestion', 'suggest change'], type: 'suggest', capturesArg: true, requiresConfirmation: false },
  { phrases: ['resolve thread', 'resolve comment', 'resolve'], type: 'resolve-thread', capturesArg: false, requiresConfirmation: false },
  { phrases: ['show diff', 'open diff', 'view diff'], type: 'show-diff', capturesArg: false, requiresConfirmation: false },
  { phrases: ['show files changed', 'files changed', 'changed files', 'show changes'], type: 'show-files', capturesArg: false, requiresConfirmation: false },
  { phrases: ['summarize changes', 'summarize pr', 'summarize pull request'], type: 'summarize', capturesArg: false, requiresConfirmation: false },
  { phrases: ['what changed in'], type: 'what-changed', capturesArg: true, requiresConfirmation: false },
  { phrases: ['mark as viewed', 'mark viewed', 'viewed'], type: 'mark-viewed', capturesArg: false, requiresConfirmation: false },
  { phrases: ['start review', 'begin review'], type: 'start-review', capturesArg: false, requiresConfirmation: false },
  { phrases: ['submit review', 'finish review', 'send review'], type: 'submit-review', capturesArg: false, requiresConfirmation: true },
];

/**
 * Parse voice input into a review command.
 */
export function parseReviewCommand(text: string): ReviewCommand | null {
  const trimmed = text.trim().toLowerCase();

  for (const trigger of REVIEW_TRIGGERS) {
    for (const phrase of trigger.phrases) {
      if (trimmed === phrase) {
        return {
          type: trigger.type,
          argument: '',
          requiresConfirmation: trigger.requiresConfirmation,
        };
      }
      if (trigger.capturesArg && trimmed.startsWith(phrase + ' ')) {
        const arg = text.trim().slice(phrase.length).trim();
        return {
          type: trigger.type,
          argument: arg,
          requiresConfirmation: trigger.requiresConfirmation,
        };
      }
    }
  }

  return null;
}

/**
 * Execute a review command using VS Code's Git/GitHub PR extension APIs.
 */
export async function executeReviewCommand(cmd: ReviewCommand): Promise<boolean> {
  // Confirmation for destructive actions
  if (cmd.requiresConfirmation) {
    const actionName = cmd.type === 'approve' ? 'approve this PR'
      : cmd.type === 'request-changes' ? 'request changes'
      : 'submit the review';

    const confirm = await vscode.window.showInformationMessage(
      `VoxPilot: ${actionName}?`,
      { modal: false },
      'Yes',
    );
    if (confirm !== 'Yes') return false;
  }

  try {
    switch (cmd.type) {
      case 'next-change':
        await vscode.commands.executeCommand('workbench.action.editor.nextChange');
        return true;
      case 'prev-change':
        await vscode.commands.executeCommand('workbench.action.editor.previousChange');
        return true;
      case 'next-file':
        await vscode.commands.executeCommand('pr.nextFileChange');
        return true;
      case 'prev-file':
        await vscode.commands.executeCommand('pr.previousFileChange');
        return true;
      case 'approve':
        await vscode.commands.executeCommand('pr.approve');
        return true;
      case 'request-changes':
        await vscode.commands.executeCommand('pr.requestChanges');
        return true;
      case 'comment':
        if (cmd.argument) {
          await vscode.commands.executeCommand('pr.createComment', { text: cmd.argument });
        } else {
          await vscode.commands.executeCommand('workbench.action.addComment');
        }
        return true;
      case 'suggest':
        if (cmd.argument) {
          const suggestion = '```suggestion\n' + cmd.argument + '\n```';
          await vscode.commands.executeCommand('pr.createComment', { text: suggestion });
        }
        return true;
      case 'resolve-thread':
        await vscode.commands.executeCommand('pr.resolveComment');
        return true;
      case 'show-diff':
        await vscode.commands.executeCommand('git.openAllChanges');
        return true;
      case 'show-files':
        await vscode.commands.executeCommand('pr.openDescription');
        return true;
      case 'summarize':
        await vscode.commands.executeCommand('pr.summarize');
        return true;
      case 'what-changed':
        // Try to open the specific file's diff
        if (cmd.argument) {
          await vscode.commands.executeCommand('workbench.action.quickOpen', cmd.argument);
        }
        return true;
      case 'mark-viewed':
        await vscode.commands.executeCommand('pr.markFileAsViewed');
        return true;
      case 'start-review':
        await vscode.commands.executeCommand('pr.startReview');
        return true;
      case 'submit-review':
        await vscode.commands.executeCommand('pr.submitReview');
        return true;
    }
  } catch {
    vscode.window.showWarningMessage(`VoxPilot: Review command "${cmd.type}" failed. Is a PR open?`);
    return false;
  }

  return false;
}

/**
 * Voice Code Review processor — detects review commands in transcripts.
 */
export class VoiceCodeReviewProcessor implements PostProcessor {
  readonly id = 'voiceCodeReview';
  readonly name = 'Voice Code Review';
  readonly description = 'Navigate and manage code reviews by voice';

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (!config.get<boolean>('voiceCodeReview', true)) {
      return text;
    }

    const cmd = parseReviewCommand(text);
    if (cmd) {
      executeReviewCommand(cmd);
      return '';
    }

    return text;
  }
}

/** Singleton instance */
export const voiceCodeReview = new VoiceCodeReviewProcessor();
