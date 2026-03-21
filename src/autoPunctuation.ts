/**
 * Smart sentence-end punctuation — auto-period detection based on speech pause patterns.
 *
 * When speech ends after a natural pause (silence timeout), the transcript likely
 * represents a complete sentence. This module appends a period if the text doesn't
 * already end with sentence-ending punctuation.
 *
 * Runs as a post-processing step after voice commands and segment stitching,
 * but before auto-capitalization.
 */

/** Characters that count as sentence-ending punctuation — no period needed */
const SENTENCE_ENDERS = new Set(['.', '!', '?', ':', ';', '…']);

/** Characters that indicate an open/incomplete structure — no period needed */
const OPEN_STRUCTURES = new Set(['(', '[', '{', ',']);

/**
 * Append a period to the transcript if it doesn't already end with
 * sentence-ending punctuation. Only acts on non-empty trimmed text.
 *
 * @param text - The transcript text (after voice commands, before auto-capitalize)
 * @returns The text with a period appended if appropriate
 */
export function applyAutoPunctuation(text: string): string {
  const trimmed = text.trimEnd();
  if (trimmed.length === 0) {
    return text;
  }

  const lastChar = trimmed[trimmed.length - 1];

  // Already has sentence-ending punctuation
  if (SENTENCE_ENDERS.has(lastChar)) {
    return text;
  }

  // Ends with an open structure — don't close it with a period
  if (OPEN_STRUCTURES.has(lastChar)) {
    return text;
  }

  // Ends with a closing paren/bracket — add period after it
  // e.g. "something (like this)" → "something (like this)."

  // Default: append period
  return trimmed + '.';
}
