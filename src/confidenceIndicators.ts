/**
 * Confidence indicators — highlight uncertain words with dotted underline,
 * click to see alternatives.
 *
 * When transcription returns word-level confidence scores, words below a
 * configurable threshold are decorated with a dotted underline. Hovering
 * shows the confidence score and alternative candidates. Clicking (via
 * code action) lets the user pick an alternative replacement.
 *
 * Enable via `voxpilot.confidenceIndicators` setting (default: true).
 */

import * as vscode from 'vscode';

/** A single word with its confidence score and position in the transcript */
export interface WordConfidence {
  /** The transcribed word */
  word: string;
  /** Confidence score from 0.0 to 1.0 */
  confidence: number;
  /** Character offset in the final transcript string */
  startOffset: number;
  /** Character end offset in the final transcript string */
  endOffset: number;
  /** Alternative word candidates (if available from the model) */
  alternatives: string[];
}

/** Result of confidence analysis on a transcript */
export interface ConfidenceResult {
  /** All words with their confidence scores */
  words: WordConfidence[];
  /** Words below the uncertainty threshold */
  uncertainWords: WordConfidence[];
  /** Average confidence across all words */
  averageConfidence: number;
}

/** Decoration type for uncertain words — dotted underline with warning color */
let _uncertainDecoration: vscode.TextEditorDecorationType | null = null;

function getUncertainDecoration(): vscode.TextEditorDecorationType {
  if (!_uncertainDecoration) {
    _uncertainDecoration = vscode.window.createTextEditorDecorationType({
      textDecoration: 'underline dotted',
      overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      light: {
        textDecoration: 'underline dotted rgba(200, 150, 0, 0.8)',
      },
      dark: {
        textDecoration: 'underline dotted rgba(255, 200, 50, 0.7)',
      },
    });
  }
  return _uncertainDecoration;
}

/**
 * Confidence threshold below which words are marked as uncertain.
 * Default: 0.7 (70% confidence).
 */
const DEFAULT_THRESHOLD = 0.7;

/**
 * Common ASR confusion pairs — when a word is uncertain, suggest these
 * phonetically similar alternatives.
 */
const CONFUSION_PAIRS: Record<string, string[]> = {
  'their': ['there', 'they\'re'],
  'there': ['their', 'they\'re'],
  'they\'re': ['their', 'there'],
  'your': ['you\'re'],
  'you\'re': ['your'],
  'its': ['it\'s'],
  'it\'s': ['its'],
  'to': ['too', 'two'],
  'too': ['to', 'two'],
  'two': ['to', 'too'],
  'then': ['than'],
  'than': ['then'],
  'affect': ['effect'],
  'effect': ['affect'],
  'accept': ['except'],
  'except': ['accept'],
  'weather': ['whether'],
  'whether': ['weather'],
  'right': ['write', 'rite'],
  'write': ['right', 'rite'],
  'no': ['know'],
  'know': ['no'],
  'new': ['knew'],
  'knew': ['new'],
  'hear': ['here'],
  'here': ['hear'],
  'break': ['brake'],
  'brake': ['break'],
  'peace': ['piece'],
  'piece': ['peace'],
  'wait': ['weight'],
  'weight': ['wait'],
  'where': ['wear', 'ware'],
  'wear': ['where', 'ware'],
  'which': ['witch'],
  'witch': ['which'],
  'would': ['wood'],
  'wood': ['would'],
  'flour': ['flower'],
  'flower': ['flour'],
  'principal': ['principle'],
  'principle': ['principal'],
  'stationary': ['stationery'],
  'stationery': ['stationary'],
  // Programming terms commonly confused by ASR
  'function': ['junction'],
  'class': ['glass'],
  'const': ['cost', 'constant'],
  'let': ['lit', 'led'],
  'var': ['bar', 'far'],
  'null': ['nil', 'nul'],
  'true': ['through', 'threw'],
  'false': ['falls'],
  'array': ['a ray', 'aray'],
  'string': ['sting'],
  'int': ['in', 'hint'],
  'float': ['bloat'],
  'import': ['in port'],
  'export': ['ex port'],
  'async': ['a sync'],
  'await': ['a wait'],
};

/**
 * Analyze transcript confidence from model output.
 * Extracts word-level scores when available, or estimates confidence
 * based on heuristics (word length, repetition, common confusion patterns).
 */
export function analyzeConfidence(
  text: string,
  modelOutput?: any,
  threshold?: number,
): ConfidenceResult {
  const confidenceThreshold = threshold ?? DEFAULT_THRESHOLD;
  const words: WordConfidence[] = [];

  // Try to extract word-level confidence from model output
  if (modelOutput?.chunks && Array.isArray(modelOutput.chunks)) {
    // Whisper/Parakeet models may return word-level chunks with scores
    let offset = 0;
    for (const chunk of modelOutput.chunks) {
      const word = chunk.text?.trim();
      if (!word) { continue; }

      // Find the word position in the full text
      const idx = text.indexOf(word, offset);
      if (idx === -1) { continue; }

      const confidence = chunk.confidence ?? chunk.score ?? estimateWordConfidence(word);
      const alternatives = getAlternatives(word, confidence, confidenceThreshold);

      words.push({
        word,
        confidence,
        startOffset: idx,
        endOffset: idx + word.length,
        alternatives,
      });

      offset = idx + word.length;
    }
  }

  // If no word-level data from model, estimate per-word confidence heuristically
  if (words.length === 0 && text.trim()) {
    const wordRegex = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(text)) !== null) {
      const word = match[0];
      // Strip trailing punctuation for analysis but keep offsets accurate
      const cleanWord = word.replace(/[.,!?;:'")\]}>]+$/, '').replace(/^['"(\[{<]+/, '');
      const confidence = estimateWordConfidence(cleanWord);
      const alternatives = getAlternatives(cleanWord, confidence, confidenceThreshold);

      words.push({
        word,
        confidence,
        startOffset: match.index,
        endOffset: match.index + word.length,
        alternatives,
      });
    }
  }

  const uncertainWords = words.filter(w => w.confidence < confidenceThreshold);
  const averageConfidence = words.length > 0
    ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length
    : 1.0;

  return { words, uncertainWords, averageConfidence };
}

/**
 * Estimate confidence for a single word based on heuristics.
 * This is used when the ASR model doesn't provide word-level scores.
 *
 * Heuristics:
 * - Very short words (1-2 chars) are often misheard → lower confidence
 * - Words in the confusion pairs list → slightly lower confidence
 * - Words with unusual capitalization patterns → lower confidence
 * - Common English words → higher confidence
 * - Longer, well-formed words → higher confidence
 */
function estimateWordConfidence(word: string): number {
  let confidence = 0.85; // Base confidence for heuristic estimation

  const lower = word.toLowerCase();

  // Very short words are more likely to be misheard
  if (word.length <= 2) {
    confidence -= 0.1;
  }

  // Words in confusion pairs are inherently ambiguous
  if (CONFUSION_PAIRS[lower]) {
    confidence -= 0.15;
  }

  // Single characters that aren't common words
  if (word.length === 1 && !['a', 'I', 'O'].includes(word)) {
    confidence -= 0.2;
  }

  // Mixed case in the middle of a word (not camelCase) suggests uncertainty
  if (/[a-z][A-Z]/.test(word) && !/^[a-z]+[A-Z]/.test(word)) {
    confidence -= 0.1;
  }

  // Numbers mixed with letters (not common patterns like "v2", "3D")
  if (/\d/.test(word) && /[a-zA-Z]/.test(word) && !/^[a-zA-Z]\d+$/.test(word) && !/^\d+[a-zA-Z]$/.test(word)) {
    confidence -= 0.1;
  }

  // Boost for common English words
  if (COMMON_WORDS.has(lower)) {
    confidence += 0.1;
  }

  return Math.max(0.1, Math.min(1.0, confidence));
}

/** Get alternative suggestions for an uncertain word */
function getAlternatives(word: string, confidence: number, threshold: number): string[] {
  if (confidence >= threshold) { return []; }

  const lower = word.toLowerCase();
  const alts: string[] = [];

  // Check confusion pairs
  if (CONFUSION_PAIRS[lower]) {
    alts.push(...CONFUSION_PAIRS[lower]);
  }

  // For very low confidence, suggest common phonetic alternatives
  if (confidence < 0.5) {
    // Add a "?" placeholder to indicate high uncertainty
    if (alts.length === 0) {
      alts.push(`[${word}?]`);
    }
  }

  return alts.slice(0, 5); // Limit to 5 alternatives
}

/** Common English words that are rarely misheard */
const COMMON_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
  'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go',
  'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
  'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them',
  'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its',
  'over', 'think', 'also', 'back', 'after', 'use', 'how', 'our', 'work',
  'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
  'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'has',
  'had', 'did', 'does', 'should', 'must', 'may', 'might', 'shall',
]);

/**
 * Manager for confidence indicator decorations in the editor.
 * Applies decorations to uncertain words and provides hover information
 * and code actions for replacements.
 */
export class ConfidenceIndicatorManager implements vscode.Disposable {
  private decorations: Map<string, vscode.DecorationOptions[]> = new Map();
  private uncertainWordsMap: Map<string, WordConfidence[]> = new Map();
  private disposables: vscode.Disposable[] = [];
  private _enabled: boolean;
  private _threshold: number;

  constructor() {
    const config = vscode.workspace.getConfiguration('voxpilot');
    this._enabled = config.get<boolean>('confidenceIndicators', true);
    this._threshold = config.get<number>('confidenceThreshold', DEFAULT_THRESHOLD);

    // Register hover provider for uncertain words
    const hoverProvider = vscode.languages.registerHoverProvider(
      { scheme: '*' },
      { provideHover: (doc, pos) => this.provideHover(doc, pos) },
    );

    // Register code action provider for word replacement
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
      { scheme: '*' },
      { provideCodeActions: (doc, range) => this.provideCodeActions(doc, range) },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    );

    // Listen for config changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('voxpilot.confidenceIndicators')) {
        this._enabled = vscode.workspace.getConfiguration('voxpilot').get<boolean>('confidenceIndicators', true);
        if (!this._enabled) {
          this.clearAll();
        }
      }
      if (e.affectsConfiguration('voxpilot.confidenceThreshold')) {
        this._threshold = vscode.workspace.getConfiguration('voxpilot').get<number>('confidenceThreshold', DEFAULT_THRESHOLD);
      }
    });

    this.disposables.push(hoverProvider, codeActionProvider, configWatcher);
  }

  get enabled(): boolean { return this._enabled; }
  get threshold(): number { return this._threshold; }

  /**
   * Apply confidence decorations to the editor after a transcript is inserted.
   * Call this after text has been inserted at a known position.
   */
  applyDecorations(
    editor: vscode.TextEditor,
    insertPosition: vscode.Position,
    confidenceResult: ConfidenceResult,
  ): void {
    if (!this._enabled || confidenceResult.uncertainWords.length === 0) { return; }

    const docUri = editor.document.uri.toString();
    const decorationOptions: vscode.DecorationOptions[] = [];

    for (const word of confidenceResult.uncertainWords) {
      const startPos = editor.document.positionAt(
        editor.document.offsetAt(insertPosition) + word.startOffset,
      );
      const endPos = editor.document.positionAt(
        editor.document.offsetAt(insertPosition) + word.endOffset,
      );
      const range = new vscode.Range(startPos, endPos);

      const confidencePercent = Math.round(word.confidence * 100);
      const altText = word.alternatives.length > 0
        ? `\nAlternatives: ${word.alternatives.join(', ')}`
        : '';

      decorationOptions.push({
        range,
        hoverMessage: new vscode.MarkdownString(
          `⚠️ **Low confidence** (${confidencePercent}%)${altText}\n\n` +
          `_Click the lightbulb or use Quick Fix to see alternatives._`,
        ),
      });
    }

    // Store for hover/code action lookups
    this.decorations.set(docUri, decorationOptions);
    this.uncertainWordsMap.set(docUri, confidenceResult.uncertainWords);

    // Apply the decoration
    editor.setDecorations(getUncertainDecoration(), decorationOptions);
  }

  /**
   * Apply decorations for inline mode where we know the exact insert range.
   */
  applyForRange(
    editor: vscode.TextEditor,
    startOffset: number,
    confidenceResult: ConfidenceResult,
  ): void {
    if (!this._enabled || confidenceResult.uncertainWords.length === 0) { return; }

    const docUri = editor.document.uri.toString();
    const decorationOptions: vscode.DecorationOptions[] = [];

    for (const word of confidenceResult.uncertainWords) {
      const startPos = editor.document.positionAt(startOffset + word.startOffset);
      const endPos = editor.document.positionAt(startOffset + word.endOffset);
      const range = new vscode.Range(startPos, endPos);

      const confidencePercent = Math.round(word.confidence * 100);
      const altText = word.alternatives.length > 0
        ? `\nAlternatives: ${word.alternatives.join(', ')}`
        : '';

      decorationOptions.push({
        range,
        hoverMessage: new vscode.MarkdownString(
          `⚠️ **Low confidence** (${confidencePercent}%)${altText}\n\n` +
          `_Click the lightbulb or use Quick Fix to see alternatives._`,
        ),
      });
    }

    this.decorations.set(docUri, decorationOptions);
    this.uncertainWordsMap.set(docUri, confidenceResult.uncertainWords);
    editor.setDecorations(getUncertainDecoration(), decorationOptions);
  }

  /** Clear decorations for a specific document */
  clearForDocument(editor: vscode.TextEditor): void {
    const docUri = editor.document.uri.toString();
    this.decorations.delete(docUri);
    this.uncertainWordsMap.delete(docUri);
    editor.setDecorations(getUncertainDecoration(), []);
  }

  /** Clear all decorations across all documents */
  clearAll(): void {
    this.decorations.clear();
    this.uncertainWordsMap.clear();
    // Clear decorations on visible editors
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(getUncertainDecoration(), []);
    }
  }

  /** Provide hover information for uncertain words */
  private provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    if (!this._enabled) { return undefined; }

    const docUri = document.uri.toString();
    const decorations = this.decorations.get(docUri);
    if (!decorations) { return undefined; }

    for (const dec of decorations) {
      if (dec.range.contains(position)) {
        return new vscode.Hover(dec.hoverMessage as vscode.MarkdownString, dec.range);
      }
    }

    return undefined;
  }

  /** Provide code actions (Quick Fix) to replace uncertain words with alternatives */
  private provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
  ): vscode.CodeAction[] | undefined {
    if (!this._enabled) { return undefined; }

    const docUri = document.uri.toString();
    const uncertainWords = this.uncertainWordsMap.get(docUri);
    const decorations = this.decorations.get(docUri);
    if (!uncertainWords || !decorations) { return undefined; }

    const actions: vscode.CodeAction[] = [];

    for (let i = 0; i < decorations.length; i++) {
      const dec = decorations[i];
      if (!dec.range.intersection(range)) { continue; }

      const word = uncertainWords[i];
      if (!word || word.alternatives.length === 0) { continue; }

      for (const alt of word.alternatives) {
        const action = new vscode.CodeAction(
          `Replace "${word.word}" with "${alt}"`,
          vscode.CodeActionKind.QuickFix,
        );
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, dec.range, alt);
        action.isPreferred = false;
        actions.push(action);
      }

      // Add a "dismiss" action to clear the indicator for this word
      const dismissAction = new vscode.CodeAction(
        `Accept "${word.word}" (dismiss indicator)`,
        vscode.CodeActionKind.QuickFix,
      );
      dismissAction.command = {
        command: 'voxpilot.dismissConfidenceIndicator',
        title: 'Dismiss',
        arguments: [docUri, i],
      };
      dismissAction.isPreferred = true;
      actions.push(dismissAction);
    }

    return actions.length > 0 ? actions : undefined;
  }

  /** Dismiss a single confidence indicator by index */
  dismissIndicator(docUri: string, index: number): void {
    const decorations = this.decorations.get(docUri);
    const words = this.uncertainWordsMap.get(docUri);
    if (!decorations || !words) { return; }

    // Remove the decoration and word at the given index
    decorations.splice(index, 1);
    words.splice(index, 1);

    // Re-apply remaining decorations
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === docUri,
    );
    if (editor) {
      editor.setDecorations(getUncertainDecoration(), decorations);
    }

    // Clean up if no more decorations
    if (decorations.length === 0) {
      this.decorations.delete(docUri);
      this.uncertainWordsMap.delete(docUri);
    }
  }

  dispose(): void {
    this.clearAll();
    if (_uncertainDecoration) {
      _uncertainDecoration.dispose();
      _uncertainDecoration = null;
    }
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
