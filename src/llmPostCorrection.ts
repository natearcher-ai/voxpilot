/**
 * LLM Post-Correction — optional AI pass to fix transcription errors using file context.
 *
 * Uses VS Code's Language Model API (vscode.lm) to send the raw transcript along with
 * surrounding editor context, allowing the LLM to fix misrecognized words, correct
 * technical terms, and improve overall accuracy based on what the user is working on.
 *
 * This processor runs asynchronously, so it hooks into the pipeline as a synchronous
 * pass-through that queues correction. The actual correction is applied after the
 * pipeline completes, via the engine's async post-pipeline hook.
 */

import * as vscode from 'vscode';

/** Configuration for LLM post-correction behavior */
export interface LlmCorrectionConfig {
  /** Whether the feature is enabled */
  enabled: boolean;
  /** Maximum context lines to include from the active editor (before + after cursor) */
  contextLines: number;
  /** Minimum transcript length to trigger correction (skip very short phrases) */
  minLength: number;
  /** Model family preference (e.g. 'copilot', 'gpt-4o', empty = any available) */
  modelFamily: string;
  /** Whether to show a diff notification before applying corrections */
  showDiff: boolean;
}

/** Result of an LLM correction attempt */
export interface CorrectionResult {
  /** Original transcript text */
  original: string;
  /** Corrected text from the LLM */
  corrected: string;
  /** Whether any changes were made */
  changed: boolean;
  /** Model that performed the correction */
  model?: string;
}

/**
 * Get the current LLM correction configuration from VS Code settings.
 */
export function getLlmCorrectionConfig(): LlmCorrectionConfig {
  const config = vscode.workspace.getConfiguration('voxpilot');
  return {
    enabled: config.get<boolean>('llmPostCorrection', false),
    contextLines: config.get<number>('llmPostCorrectionContextLines', 20),
    minLength: config.get<number>('llmPostCorrectionMinLength', 10),
    modelFamily: config.get<string>('llmPostCorrectionModel', ''),
    showDiff: config.get<boolean>('llmPostCorrectionShowDiff', false),
  };
}

/**
 * Build the surrounding editor context for the LLM prompt.
 * Extracts lines around the cursor from the active editor.
 */
function getEditorContext(contextLines: number): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return '';
  }

  const doc = editor.document;
  const cursor = editor.selection.active;
  const startLine = Math.max(0, cursor.line - contextLines);
  const endLine = Math.min(doc.lineCount - 1, cursor.line + contextLines);

  const lines: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    lines.push(doc.lineAt(i).text);
  }

  const language = doc.languageId;
  const fileName = doc.fileName.split(/[/\\]/).pop() ?? '';

  return `File: ${fileName} (${language})\nCursor at line ${cursor.line + 1}:\n---\n${lines.join('\n')}\n---`;
}

/**
 * Build the correction prompt for the LLM.
 */
function buildCorrectionPrompt(transcript: string, editorContext: string): string {
  const parts: string[] = [
    'You are a transcription correction assistant. Fix any speech-to-text errors in the transcript below.',
    'Use the surrounding code context to identify technical terms, variable names, and domain-specific words that may have been misrecognized.',
    '',
    'Rules:',
    '- Only fix clear transcription errors (misheard words, wrong technical terms)',
    '- Preserve the user\'s intent and sentence structure',
    '- Do NOT add punctuation, capitalization, or formatting beyond fixing errors',
    '- Do NOT rephrase or rewrite — only correct misrecognized words',
    '- If the transcript looks correct, return it unchanged',
    '- Return ONLY the corrected text, nothing else',
  ];

  if (editorContext) {
    parts.push('', 'Editor context:', editorContext);
  }

  parts.push('', `Transcript: ${transcript}`);

  return parts.join('\n');
}

/**
 * Select the best available language model based on user preference.
 */
async function selectModel(preferredFamily: string): Promise<vscode.LanguageModelChat | undefined> {
  const models = await vscode.lm.selectChatModels({
    family: preferredFamily || undefined,
  });

  if (models.length === 0) {
    // Try without family filter as fallback
    if (preferredFamily) {
      const fallback = await vscode.lm.selectChatModels();
      return fallback[0];
    }
    return undefined;
  }

  return models[0];
}

/**
 * Run LLM post-correction on a transcript.
 * Returns the corrected text, or the original if correction fails or is unavailable.
 */
export async function correctTranscript(
  transcript: string,
  config?: LlmCorrectionConfig,
): Promise<CorrectionResult> {
  const cfg = config ?? getLlmCorrectionConfig();

  // Skip if disabled or transcript too short
  if (!cfg.enabled || transcript.length < cfg.minLength) {
    return { original: transcript, corrected: transcript, changed: false };
  }

  try {
    const model = await selectModel(cfg.modelFamily);
    if (!model) {
      return { original: transcript, corrected: transcript, changed: false };
    }

    const editorContext = getEditorContext(cfg.contextLines);
    const prompt = buildCorrectionPrompt(transcript, editorContext);

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    const cts = new vscode.CancellationTokenSource();
    let response;
    try {
      response = await model.sendRequest(messages, {}, cts.token);
    } finally {
      cts.dispose();
    }

    // Collect the streamed response
    let corrected = '';
    for await (const chunk of response.text) {
      corrected += chunk;
    }

    // Clean up: trim whitespace, remove quotes if the model wrapped it
    corrected = corrected.trim();
    if (corrected.startsWith('"') && corrected.endsWith('"')) {
      corrected = corrected.slice(1, -1);
    }
    if (corrected.startsWith('`') && corrected.endsWith('`')) {
      corrected = corrected.slice(1, -1);
    }

    // Sanity check: if the LLM returned something wildly different in length, skip
    const lengthRatio = corrected.length / transcript.length;
    if (lengthRatio < 0.5 || lengthRatio > 2.0) {
      return { original: transcript, corrected: transcript, changed: false };
    }

    const changed = corrected !== transcript;
    return {
      original: transcript,
      corrected: changed ? corrected : transcript,
      changed,
      model: model.id,
    };
  } catch (err) {
    // Silently fall back to original on any error (model unavailable, rate limit, etc.)
    // Note: avoid creating an OutputChannel here as it leaks if called frequently.
    // The engine's own output channel handles logging.
    return { original: transcript, corrected: transcript, changed: false };
  }
}

/**
 * Show a diff notification letting the user accept or reject the correction.
 */
export async function showCorrectionDiff(result: CorrectionResult): Promise<boolean> {
  if (!result.changed) {
    return false;
  }

  const action = await vscode.window.showInformationMessage(
    `VoxPilot AI correction: "${result.original}" → "${result.corrected}"`,
    'Accept',
    'Reject',
  );

  return action === 'Accept';
}
