/**
 * Voice Shortcuts for AI Assistants — trigger Copilot, Kiro, or inline chat by voice.
 *
 * Detects spoken trigger phrases and routes them to the appropriate AI assistant
 * command in VS Code. Supports:
 *   - "ask copilot <question>"      → Open Copilot chat with question
 *   - "ask kiro <question>"         → Open Kiro chat with question
 *   - "inline fix <description>"    → Trigger inline chat fix
 *   - "explain this"                → Ask AI to explain selected code
 *   - "refactor this"               → Ask AI to refactor selected code
 *   - "add tests"                   → Ask AI to generate tests for selection
 *   - "document this"               → Ask AI to add documentation
 *   - "suggest fix"                 → Ask AI to suggest a fix for diagnostics
 *   - "open chat"                   → Open the AI chat panel
 *   - "new chat"                    → Start a new AI chat session
 *
 * The module auto-detects which AI assistant is available (Copilot, Kiro, Cody,
 * Continue, etc.) and routes to the correct command IDs.
 *
 * Enable via `voxpilot.aiVoiceShortcuts` setting (default: true).
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

/** Supported AI assistant providers */
export type AIProvider = 'copilot' | 'kiro' | 'cody' | 'continue' | 'unknown';

/** Command mapping for an AI provider */
interface ProviderCommands {
  openChat: string;
  newChat: string;
  inlineChat: string;
  explain: string;
  fix: string;
  refactor: string;
  tests: string;
  document: string;
}

/** Known provider command mappings */
const PROVIDER_COMMANDS: Record<AIProvider, ProviderCommands> = {
  copilot: {
    openChat: 'workbench.panel.chat.view.copilot.focus',
    newChat: 'workbench.action.chat.new',
    inlineChat: 'inlineChat.start',
    explain: 'github.copilot.interactiveEditor.explain',
    fix: 'github.copilot.interactiveEditor.fix',
    refactor: 'github.copilot.interactiveEditor.refactor',
    tests: 'github.copilot.interactiveEditor.generateTests',
    document: 'github.copilot.interactiveEditor.generateDocs',
  },
  kiro: {
    openChat: 'kiro.chat.focus',
    newChat: 'kiro.chat.new',
    inlineChat: 'inlineChat.start',
    explain: 'kiro.explain',
    fix: 'kiro.fix',
    refactor: 'kiro.refactor',
    tests: 'kiro.generateTests',
    document: 'kiro.generateDocs',
  },
  cody: {
    openChat: 'cody.chat.focus',
    newChat: 'cody.chat.new',
    inlineChat: 'cody.command.edit-code',
    explain: 'cody.command.explain-code',
    fix: 'cody.command.edit-code',
    refactor: 'cody.command.edit-code',
    tests: 'cody.command.unit-tests',
    document: 'cody.command.document-code',
  },
  continue: {
    openChat: 'continue.focusContinueInput',
    newChat: 'continue.newSession',
    inlineChat: 'continue.inlineEdit',
    explain: 'continue.focusContinueInputWithEdit',
    fix: 'continue.inlineEdit',
    refactor: 'continue.inlineEdit',
    tests: 'continue.focusContinueInputWithEdit',
    document: 'continue.focusContinueInputWithEdit',
  },
  unknown: {
    openChat: 'workbench.action.chat.open',
    newChat: 'workbench.action.chat.new',
    inlineChat: 'inlineChat.start',
    explain: 'inlineChat.start',
    fix: 'inlineChat.start',
    refactor: 'inlineChat.start',
    tests: 'inlineChat.start',
    document: 'inlineChat.start',
  },
};

/** Voice trigger definition */
interface AIVoiceTrigger {
  /** Phrases that activate this shortcut (longest first) */
  phrases: string[];
  /** Action to perform */
  action: keyof ProviderCommands | 'askWithPrompt';
  /** Whether remaining text after phrase is used as a prompt */
  capturesPrompt: boolean;
  /** Prompt prefix for inline actions */
  promptPrefix?: string;
}

/** All supported voice triggers */
const AI_TRIGGERS: AIVoiceTrigger[] = [
  { phrases: ['ask copilot', 'hey copilot'], action: 'askWithPrompt', capturesPrompt: true },
  { phrases: ['ask kiro', 'hey kiro'], action: 'askWithPrompt', capturesPrompt: true },
  { phrases: ['ask cody', 'hey cody'], action: 'askWithPrompt', capturesPrompt: true },
  { phrases: ['inline fix', 'fix this'], action: 'fix', capturesPrompt: true, promptPrefix: 'Fix: ' },
  { phrases: ['explain this', 'explain code'], action: 'explain', capturesPrompt: false },
  { phrases: ['refactor this', 'refactor code'], action: 'refactor', capturesPrompt: false },
  { phrases: ['add tests', 'generate tests', 'write tests'], action: 'tests', capturesPrompt: false },
  { phrases: ['document this', 'add docs', 'add documentation'], action: 'document', capturesPrompt: false },
  { phrases: ['suggest fix', 'suggest a fix'], action: 'fix', capturesPrompt: false },
  { phrases: ['open chat', 'open ai chat'], action: 'openChat', capturesPrompt: false },
  { phrases: ['new chat', 'new ai chat', 'start chat'], action: 'newChat', capturesPrompt: false },
];

/** Compiled trigger for efficient matching */
interface CompiledTrigger {
  pattern: RegExp;
  trigger: AIVoiceTrigger;
  /** The matched phrase (for extracting the prompt portion) */
  phraseLength: number;
}

/**
 * Detect which AI provider is available in the current VS Code instance.
 */
export function detectProvider(): AIProvider {
  const extensions = vscode.extensions?.all?.map(e => e.id.toLowerCase()) ?? [];

  if (extensions.some(id => id.includes('github.copilot'))) return 'copilot';
  if (extensions.some(id => id.includes('kiro'))) return 'kiro';
  if (extensions.some(id => id.includes('sourcegraph.cody'))) return 'cody';
  if (extensions.some(id => id.includes('continue.continue'))) return 'continue';

  return 'unknown';
}

/**
 * AI Voice Shortcuts processor — detects AI assistant trigger phrases
 * and queues the corresponding commands for execution.
 */
export class AIVoiceShortcutsProcessor implements PostProcessor {
  readonly id = 'aiVoiceShortcuts';
  readonly name = 'AI Voice Shortcuts';
  readonly description = 'Trigger AI assistants (Copilot, Kiro, Cody) by voice';

  private compiled: CompiledTrigger[] = [];
  private provider: AIProvider = 'unknown';
  private commands: ProviderCommands;

  constructor() {
    this.provider = detectProvider();
    this.commands = PROVIDER_COMMANDS[this.provider];
    this.compile();
  }

  /** Redetect provider (useful after extension install) */
  refresh(): void {
    this.provider = detectProvider();
    this.commands = PROVIDER_COMMANDS[this.provider];
  }

  /** Get the detected provider */
  getProvider(): AIProvider {
    return this.provider;
  }

  private compile(): void {
    this.compiled = [];
    for (const trigger of AI_TRIGGERS) {
      for (const phrase of trigger.phrases) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = trigger.capturesPrompt
          ? new RegExp(`(?:^|\\s)${escaped}\\s+(.+?)(?:\\s*$)`, 'i')
          : new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'i');

        this.compiled.push({
          pattern,
          trigger,
          phraseLength: phrase.length,
        });
      }
    }
    // Sort by phrase length descending (match longest first)
    this.compiled.sort((a, b) => b.phraseLength - a.phraseLength);
  }

  process(text: string, context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (!config.get<boolean>('aiVoiceShortcuts', true)) {
      return text;
    }

    for (const { pattern, trigger } of this.compiled) {
      const match = text.match(pattern);
      if (!match) continue;

      // Extract prompt if applicable
      const prompt = trigger.capturesPrompt ? (match[1] || '').trim() : '';

      // Queue the command for execution
      if (trigger.action === 'askWithPrompt') {
        this.executeAskWithPrompt(prompt);
      } else {
        const commandId = this.commands[trigger.action];
        const fullPrompt = trigger.promptPrefix ? `${trigger.promptPrefix}${prompt}` : prompt;
        this.executeCommand(commandId, fullPrompt || undefined);
      }

      // Remove the matched portion from the transcript
      return text.replace(match[0], '').trim();
    }

    return text;
  }

  private executeAskWithPrompt(prompt: string): void {
    // Open chat and type the prompt
    const commandId = this.commands.openChat;
    vscode.commands.executeCommand(commandId).then(() => {
      if (prompt) {
        // Small delay to let the chat panel open, then type
        setTimeout(() => {
          vscode.commands.executeCommand('workbench.action.chat.insertIntoInput', prompt);
        }, 200);
      }
    });
  }

  private executeCommand(commandId: string, prompt?: string): void {
    if (prompt) {
      vscode.commands.executeCommand(commandId, { prompt });
    } else {
      vscode.commands.executeCommand(commandId);
    }
  }
}

/** Singleton instance */
export const aiVoiceShortcuts = new AIVoiceShortcutsProcessor();
