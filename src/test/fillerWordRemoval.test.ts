import { describe, it, expect } from 'vitest';
import { FillerWordRemovalProcessor } from '../postProcessingPipeline';
import type { ProcessorContext } from '../postProcessingPipeline';

function makeContext(): ProcessorContext {
  return { segments: [], voiceCommandsApplied: 0, punctuationAdded: false, capitalized: false, pendingCommands: [] };
}

describe('FillerWordRemovalProcessor', () => {
  const processor = new FillerWordRemovalProcessor();

  it('removes common filler words', () => {
    expect(processor.process('um I want to refactor this', makeContext())).toBe('I want to refactor this');
    expect(processor.process('so uh can you fix the bug', makeContext())).toBe('so can you fix the bug');
    expect(processor.process('hmm let me think about that', makeContext())).toBe('let me think about that');
  });

  it('removes multiple fillers in one sentence', () => {
    expect(processor.process('um like I want to uh refactor this', makeContext())).toBe('I want to refactor this');
  });

  it('removes multi-word fillers', () => {
    expect(processor.process('you know the function is broken', makeContext())).toBe('the function is broken');
    expect(processor.process('I mean it should work', makeContext())).toBe('it should work');
    expect(processor.process('it is sort of working', makeContext())).toBe('it is working');
    expect(processor.process('it is kind of slow', makeContext())).toBe('it is slow');
  });

  it('is case-insensitive', () => {
    expect(processor.process('Um I want to Um refactor', makeContext())).toBe('I want to refactor');
    expect(processor.process('UH fix this', makeContext())).toBe('fix this');
  });

  it('collapses double spaces after removal', () => {
    const result = processor.process('the um function is uh broken', makeContext());
    expect(result).not.toContain('  ');
    expect(result).toBe('the function is broken');
  });

  it('preserves text with no fillers', () => {
    expect(processor.process('refactor this function', makeContext())).toBe('refactor this function');
  });

  it('handles empty string', () => {
    expect(processor.process('', makeContext())).toBe('');
  });

  it('does not remove filler substrings inside words', () => {
    // "like" inside "unlikely" should not be removed
    expect(processor.process('this is unlikely', makeContext())).toBe('this is unlikely');
    // "um" inside "umbrella" should not be removed
    expect(processor.process('grab the umbrella', makeContext())).toBe('grab the umbrella');
  });
});
