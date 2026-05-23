/**
 * AI Code Generation Mode — say "create a function that..." to generate code via Copilot/LLM.
 *
 * Detects voice prompts that begin with code generation trigger phrases and routes
 * the natural language description to VS Code's Language Model API (Copilot or compatible).
 * Generated code is inserted at the cursor position in the active editor.
 *
 * Supported trigger phrases:
 *   "create a function that..."    → Generate a function
 *   "create a class that..."       → Generate a class
 *   "create a method that..."      → Generate a method
 *   "create an interface..."       → Generate an interface
 *   "generate a function..."       → Generate a function
 *   "generate a class..."          → Generate a class
 *   "write a function that..."     → Generate a function
 *   "write a method that..."       → Generate a method
 *   "write code that..."           → Generate code
 *   "implement a function..."      → Generate a function
 *   "add a function that..."       → Generate a function
 *   "scaffold a component..."      → Generate a component
 *
 * The remaining text after the trigger phrase is used as the natural language prompt.
 * Editor context (language, surrounding code) is included for better results.
 */

import * as vscode from 'vscode';

/** Trigger phrases that activate AI code generation (sorted longest first) */
const TRIGGER_PHRASES: string[] = [
  'create a function that',
  'create a function called',
  'create a function named',
  'create a class that',
  'create a class called',
  'create a method that',
  'create a method called',
  'create an interface called',
  'create an interface for',
  'create a component that',
  'create a component called',
  'create a type that',
  'create a type called',
  'generate a function that',
  'generate a function called',
  'generate a class that',
  'generate a class called',
  'generate a method that',
  'generate code that',
  'generate code to',
  'write a function that',
  'write a function called',
  'write a method that',
  'write a class that',
  'write code that',
  'write code to',
  'implement a function that',
  'implement a function called',
  'implement a method that',
  'implement a class that',
  'scaffold a component',
  'scaffold a function',
  'add a function that',
  'add a function called',
  'add a method that',
  'add a method called',
  'add a class that',
  'add a class called',
  // Shorter fallbacks (must come after longer variants)
  'create a function',
  'create a class',
  'create a method',
  'create an interface',
  'create a component',
  'create a type',
  'generate a function',
  'generate a class',
  'generate a method',
  'generate code',
  'write a function',
  'write a class',
  'write a method',
  'write code',
  'implement a function',
  'implement a method',
  'implement a class',
  'scaffold a',
  'add a function',
  'add a method',
  'add a class',
];

export interface AiCodeGenMatch {
  /** The trigger phrase that was matched */
  trigger: string;
  /** The natural language description (everything after the trigger) */
  description: string;
  /** Full original transcript */
  original: string;
}

/**
 * Normalize text for matching: lowercase, collapse whitespace.
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Check if a transcript matches an AI code generation trigger phrase.
 * Returns the match with the description, or null if no match.
 */
export function matchAiCodeGeneration(transcript: string): AiCodeGenMatch | null {
  const config = vscode.workspace.getConfiguration('voxpilot');
  if (!config.get<boolean>('aiCodeGeneration', false)) {
    return null;
  }

  const normalized = normalize(transcript);

  for (const trigger of TRIGGER_PHRASES) {
    if (normalized === trigger) {
      // Trigger phrase alone — no description
      return { trigger, description: '', original: transcript };
    }
    if (normalized.startsWith(trigger + ' ')) {
      const description = transcript.trim().slice(trigger.length).trim();
      return { trigger, description, original: transcript };
    }
  }

  return null;
}

/**
 * Build the editor context for the generation prompt.
 */
function getEditorContext(contextLines: number): { context: string; language: string; fileName: string } {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return { context: '', language: 'plaintext', fileName: '' };
  }

  const doc = editor.document;
  const cursor = editor.selection.active;
  const startLine = Math.max(0, cursor.line - contextLines);
  const endLine = Math.min(doc.lineCount - 1, cursor.line + contextLines);

  const lines: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const prefix = i === cursor.line ? '>>> ' : '    ';
    lines.push(prefix + doc.lineAt(i).text);
  }

  const language = doc.languageId;
  const fileName = doc.fileName.split(/[/\\]/).pop() ?? '';

  return {
    context: lines.join('\n'),
    language,
    fileName,
  };
}

/**
 * Build the code generation prompt for the LLM.
 */
function buildGenerationPrompt(match: AiCodeGenMatch, editorCtx: { context: string; language: string; fileName: string }): string {
  const parts: string[] = [
    'You are a code generation assistant inside a voice-to-code IDE extension.',
    `Generate code in ${editorCtx.language || 'the appropriate language'} based on the user\'s voice description.`,
    '',
    'Rules:',
    '- Output ONLY the code — no explanations, no markdown fences, no comments about what you did',
    '- Match the style and conventions of the surrounding code',
    '- Use proper indentation matching the cursor context',
    '- Include necessary type annotations if the language uses them',
    '- Keep it concise and production-ready',
    '- If the description is vague, make reasonable assumptions',
  ];

  if (editorCtx.context) {
    parts.push(
      '',
      `File: ${editorCtx.fileName} (${editorCtx.language})`,
      'Surrounding code (>>> marks cursor position):',
      '```',
      editorCtx.context,
      '```',
    );
  }

  const description = match.description || match.trigger;
  parts.push('', `Voice command: "${match.original}"`, `Generate: ${description}`);

  return parts.join('\n');
}

/**
 * Select the best available language model.
 */
async function selectModel(preferredFamily: string): Promise<vscode.LanguageModelChat | undefined> {
  const models = await vscode.lm.selectChatModels({
    family: preferredFamily || undefined,
  });

  if (models.length === 0) {
    if (preferredFamily) {
      const fallback = await vscode.lm.selectChatModels();
      return fallback[0];
    }
    return undefined;
  }

  return models[0];
}

/**
 * Execute AI code generation: send the prompt to the LLM and insert the result.
 */
export async function executeAiCodeGeneration(match: AiCodeGenMatch): Promise<boolean> {
  const config = vscode.workspace.getConfiguration('voxpilot');
  const contextLines = config.get<number>('aiCodeGenerationContextLines', 30);
  const modelFamily = config.get<string>('aiCodeGenerationModel', '');
  const insertMode = config.get<string>('aiCodeGenerationInsertMode', 'cursor');

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('VoxPilot: No active editor — open a file to generate code.');
    return false;
  }

  // Show progress while generating
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'VoxPilot: Generating code...',
      cancellable: true,
    },
    async (progress, cancellationToken) => {
      try {
        const model = await selectModel(modelFamily);
        if (!model) {
          vscode.window.showWarningMessage(
            'VoxPilot: No language model available. Install GitHub Copilot or a compatible extension.',
          );
          return false;
        }

        const editorCtx = getEditorContext(contextLines);
        const prompt = buildGenerationPrompt(match, editorCtx);

        const messages = [vscode.LanguageModelChatMessage.User(prompt)];

        const response = await model.sendRequest(
          messages,
          {},
          cancellationToken,
        );

        // Collect the streamed response
        let generatedCode = '';
        for await (const chunk of response.text) {
          if (cancellationToken.isCancellationRequested) {
            return false;
          }
          generatedCode += chunk;
          progress.report({ message: `${generatedCode.split('\n').length} lines...` });
        }

        // Clean up: remove markdown fences if the model wrapped it
        generatedCode = stripMarkdownFences(generatedCode).trimEnd();

        if (!generatedCode) {
          vscode.window.showWarningMessage('VoxPilot: AI returned empty response.');
          return false;
        }

        // Insert the generated code
        if (insertMode === 'newFile') {
          const doc = await vscode.workspace.openTextDocument({ content: generatedCode, language: editorCtx.language });
          await vscode.window.showTextDocument(doc);
        } else {
          // Default: insert at cursor
          await editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, generatedCode);
          });

          // Format the inserted code
          try {
            await vscode.commands.executeCommand('editor.action.formatDocument');
          } catch {
            // Formatting is best-effort
          }
        }

        vscode.window.showInformationMessage(
          `VoxPilot: Generated ${generatedCode.split('\n').length} lines of code.`,
        );
        return true;
      } catch (err: any) {
        if (cancellationToken.isCancellationRequested) {
          return false;
        }
        vscode.window.showWarningMessage(
          `VoxPilot: Code generation failed — ${err.message || String(err)}`,
        );
        return false;
      }
    },
  );
}

/**
 * Strip markdown code fences from LLM output.
 */
function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();

  // Remove opening fence (```language or ```)
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    }
  }

  // Remove closing fence
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }

  return cleaned;
}

/**
 * Register the AI code generation command for manual triggering.
 */
export function registerAiCodeGenerationCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('voxpilot.aiCodeGeneration', async () => {
    const input = await vscode.window.showInputBox({
      prompt: 'Describe the code you want to generate',
      placeHolder: 'e.g., a function that sorts an array of objects by a given key',
    });

    if (!input) {
      return;
    }

    const match: AiCodeGenMatch = {
      trigger: 'generate code',
      description: input,
      original: `generate code that ${input}`,
    };

    await executeAiCodeGeneration(match);
  });
}
