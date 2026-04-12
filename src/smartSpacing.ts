/**
 * Smart spacing for multi-segment transcript stitching.
 *
 * Ensures exactly one space between segments, collapses internal
 * whitespace runs, and avoids spaces before punctuation.
 */

/**
 * Stitch an array of transcript segments into a single string
 * with clean, consistent spacing.
 */
export function stitchSegments(segments: string[]): string {
  // Filter out empty/whitespace-only segments and trim each
  const cleaned = segments.map(s => s.trim()).filter(s => s.length > 0);
  if (cleaned.length === 0) { return ''; }
  if (cleaned.length === 1) { return normalizeSpaces(cleaned[0]); }

  let result = normalizeSpaces(cleaned[0]);

  for (let i = 1; i < cleaned.length; i++) {
    const segment = normalizeSpaces(cleaned[i]);
    if (segment.length === 0) { continue; }

    // If the next segment starts with punctuation that shouldn't
    // have a leading space, append directly
    if (/^[.,!?;:…)\]}]/.test(segment)) {
      result += segment;
    } else {
      result += ' ' + segment;
    }
  }

  return result;
}

/**
 * Collapse multiple whitespace characters into a single space.
 */
export function normalizeSpaces(text: string): string {
  return text.replace(/\s{2,}/g, ' ');
}
