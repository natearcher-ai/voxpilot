/**
 * Voice command processor — converts spoken commands into punctuation or edit actions.
 * Runs as a post-processing step on raw transcripts before delivery.
 *
 * Supported commands:
 *   "new line" / "newline"       → \n
 *   "period" / "full stop"       → .
 *   "comma"                      → ,
 *   "question mark"              → ?
 *   "exclamation mark" / "exclamation point" → !
 *   "colon"                      → :
 *   "semicolon"                  → ;
 *   "open paren" / "left paren"  → (
 *   "close paren" / "right paren"→ )
 *   "delete that"                → removes the last word/phrase before the command
 *   "undo that"                  → alias for delete that
 */

export interface VoiceCommandResult {
  /** The processed text after applying voice commands */
  text: string;
  /** Number of commands that were applied */
  commandsApplied: number;
}

interface CommandRule {
  pattern: RegExp;
  apply: (text: string) => string;
}

const PUNCTUATION_COMMANDS: Array<{ patterns: string[]; replacement: string }> = [
  { patterns: ['new line', 'newline'], replacement: '\n' },
  { patterns: ['period', 'full stop'], replacement: '.' },
  { patterns: ['comma'], replacement: ',' },
  { patterns: ['question mark'], replacement: '?' },
  { patterns: ['exclamation mark', 'exclamation point'], replacement: '!' },
  { patterns: ['colon'], replacement: ':' },
  { patterns: ['semicolon', 'semi colon'], replacement: ';' },
  { patterns: ['open paren', 'left paren', 'open parenthesis'], replacement: '(' },
  { patterns: ['close paren', 'right paren', 'close parenthesis'], replacement: ')' },
];

/**
 * Build a single regex that matches all punctuation voice commands.
 * Commands are matched case-insensitively and can appear anywhere in the text.
 */
function buildPunctuationRules(): CommandRule[] {
  const rules: CommandRule[] = [];

  for (const cmd of PUNCTUATION_COMMANDS) {
    // Sort patterns longest-first so "full stop" matches before "stop" would
    const sorted = [...cmd.patterns].sort((a, b) => b.length - a.length);
    const alternation = sorted.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

    // Match the command optionally preceded by whitespace
    const pattern = new RegExp(`\\s*\\b(${alternation})\\b`, 'gi');
    const replacement = cmd.replacement;

    rules.push({
      pattern,
      apply: (text) => {
        // For newline, just insert the newline
        if (replacement === '\n') {
          return text.replace(pattern, '\n');
        }
        // For opening parens, add space before and the paren
        if (replacement === '(') {
          return text.replace(pattern, ' (');
        }
        // For punctuation, attach directly to the preceding word (trim trailing space)
        return text.replace(pattern, replacement);
      },
    });
  }

  return rules;
}

const punctuationRules = buildPunctuationRules();

/**
 * Handle "delete that" / "undo that" — removes the last word or phrase before the command.
 */
function applyDeleteThat(text: string): { text: string; count: number } {
  const deletePattern = /\s*\b(delete that|undo that)\b/gi;
  let count = 0;

  // Process iteratively since each delete changes the text
  let result = text;
  let match: RegExpExecArray | null;

  // Reset and find all occurrences
  while ((match = deletePattern.exec(result)) !== null) {
    const before = result.slice(0, match.index);
    const after = result.slice(match.index + match[0].length);

    // Remove the last word before the command
    const trimmed = before.trimEnd();
    const lastSpaceIdx = trimmed.lastIndexOf(' ');
    const withoutLastWord = lastSpaceIdx >= 0 ? trimmed.slice(0, lastSpaceIdx) : '';

    result = withoutLastWord + after;
    count++;

    // Reset regex since string changed
    deletePattern.lastIndex = 0;
  }

  return { text: result, count };
}

/**
 * Process a raw transcript and apply voice commands.
 */
export function processVoiceCommands(rawText: string): VoiceCommandResult {
  if (!rawText.trim()) {
    return { text: rawText, commandsApplied: 0 };
  }

  let text = rawText;
  let commandsApplied = 0;

  // Apply punctuation commands first
  for (const rule of punctuationRules) {
    const matchCount = [...text.matchAll(rule.pattern)].length;
    if (matchCount > 0) {
      text = rule.apply(text);
      commandsApplied += matchCount;
    }
  }

  // Apply delete commands last (they depend on final text state)
  const deleteResult = applyDeleteThat(text);
  text = deleteResult.text;
  commandsApplied += deleteResult.count;

  // Clean up: collapse multiple spaces, trim
  text = text.replace(/ {2,}/g, ' ').trim();

  return { text, commandsApplied };
}
