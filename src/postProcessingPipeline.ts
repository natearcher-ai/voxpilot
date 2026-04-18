/**
 * Transcript post-processing framework — pluggable pipeline architecture for text transforms.
 *
 * Each processor implements the PostProcessor interface and is registered with a unique id.
 * The pipeline runs processors in order, passing the output of each to the next.
 * Processors can be enabled/disabled and reordered via voxpilot.postProcessors settings.
 */

import * as vscode from 'vscode';
import { processVoiceCommands } from './voiceCommands';
import { stitchSegments } from './smartSpacing';
import { applyAutoPunctuation } from './autoPunctuation';
import { CustomVoiceCommandsProcessor } from './customVoiceCommands';
import { CodeVocabularyProcessor } from './codeVocabulary';
import { EditorVoiceCommandsProcessor } from './editorVoiceCommands';
import { PrefixCommandsProcessor } from './prefixCommands';
import { AutoVocabularyProcessor } from './autoVocabulary';
import { SmartInsertProcessor } from './smartInsert';

/**
 * Context passed to each processor — includes raw segments and metadata
 * that processors may read or mutate.
 */
/** A VS Code command queued for execution after pipeline completes */
export interface PendingCommand {
  /** VS Code command ID */
  command: string;
  /** Optional arguments for the command */
  args?: unknown;
  /** The spoken phrase that triggered this command (for logging) */
  phrase: string;
}

export interface ProcessorContext {
  /** Original transcript segments before stitching (read-only after stitching) */
  segments: string[];
  /** Cumulative count of voice commands applied */
  voiceCommandsApplied: number;
  /** Whether the text was modified by auto-punctuation */
  punctuationAdded: boolean;
  /** Whether the text was modified by auto-capitalization */
  capitalized: boolean;
  /** VS Code commands queued by custom voice command processor for deferred execution */
  pendingCommands: PendingCommand[];
}

/**
 * A single post-processing step in the transcript pipeline.
 */
export interface PostProcessor {
  /** Unique identifier used in settings and logging */
  readonly id: string;
  /** Human-readable name for UI display */
  readonly name: string;
  /** Brief description of what this processor does */
  readonly description: string;
  /** Process the transcript text. Return the transformed text. */
  process(text: string, context: ProcessorContext): string;
}

// ── Built-in processors ──────────────────────────────────────────────

export class TrimProcessor implements PostProcessor {
  readonly id = 'trim';
  readonly name = 'Trim';
  readonly description = 'Remove leading and trailing whitespace from the transcript';

  process(text: string, _context: ProcessorContext): string {
    return text.trim();
  }
}

export class NormalizeWhitespaceProcessor implements PostProcessor {
  readonly id = 'normalizeWhitespace';
  readonly name = 'Normalize Whitespace';
  readonly description = 'Collapse multiple spaces, tabs, and newlines into single spaces';

  process(text: string, _context: ProcessorContext): string {
    return text.replace(/\s{2,}/g, ' ');
  }
}

/**
 * Common transcription typo corrections.
 * Each entry: [pattern, replacement].
 */
const TYPO_FIXES: Array<[RegExp, string]> = [
  // Standalone lowercase "i" → "I"
  [/\bi\b/g, 'I'],
  // Repeated words: "the the" → "the", "I I" → "I", etc.
  [/\b(\w+)\s+\1\b/gi, '$1'],
  // Common contractions ASR often misses
  [/\bim\b/gi, "I'm"],
  [/\bdont\b/gi, "don't"],
  [/\bcant\b/gi, "can't"],
  [/\bwont\b/gi, "won't"],
  [/\bdidnt\b/gi, "didn't"],
  [/\bdoesnt\b/gi, "doesn't"],
  [/\bisnt\b/gi, "isn't"],
  [/\barent\b/gi, "aren't"],
  [/\bwasnt\b/gi, "wasn't"],
  [/\bwerent\b/gi, "weren't"],
  [/\bhavent\b/gi, "haven't"],
  [/\bhasnt\b/gi, "hasn't"],
  [/\bwouldnt\b/gi, "wouldn't"],
  [/\bcouldnt\b/gi, "couldn't"],
  [/\bshouldnt\b/gi, "shouldn't"],
  [/\bive\b/gi, "I've"],
  [/\bId\b/g, "I'd"],
  [/\bIll\b/g, "I'll"],
  [/\bthats\b/gi, "that's"],
  [/\bwhats\b/gi, "what's"],
  [/\bheres\b/gi, "here's"],
  [/\btheres\b/gi, "there's"],
  [/\blets\b/gi, "let's"],
];

/**
 * Filler words to strip from transcriptions.
 * Matches whole words only, case-insensitive.
 */
const FILLER_WORDS = ['um', 'uh', 'uhh', 'umm', 'hmm', 'hm', 'mhm', 'uh huh', 'like', 'you know', 'I mean', 'sort of', 'kind of', 'basically', 'actually', 'literally'];

/** Build a single regex that matches any filler word/phrase as a whole word */
const FILLER_REGEX = new RegExp(
  '\\b(' + FILLER_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
  'gi',
);

export class FillerWordRemovalProcessor implements PostProcessor {
  readonly id = 'fillerWordRemoval';
  readonly name = 'Filler Word Removal';
  readonly description = 'Strip filler words (um, uh, hmm, like, you know) from transcriptions';

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (config.get<boolean>('fillerWordRemoval') === false) {
      return text;
    }
    // Remove fillers and collapse resulting double spaces
    return text.replace(FILLER_REGEX, '').replace(/\s{2,}/g, ' ').trim();
  }
}

export class FixTyposProcessor implements PostProcessor {
  readonly id = 'fixTypos';
  readonly name = 'Fix Typos';
  readonly description = 'Fix common transcription errors: repeated words, missing apostrophes, lowercase I';

  process(text: string, _context: ProcessorContext): string {
    let result = text;
    for (const [pattern, replacement] of TYPO_FIXES) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }
}

export class VoiceCommandsProcessor implements PostProcessor {
  readonly id = 'voiceCommands';
  readonly name = 'Voice Commands';
  readonly description = 'Convert spoken commands (new line, period, delete that) into text actions';

  process(text: string, context: ProcessorContext): string {
    const { text: processed, commandsApplied } = processVoiceCommands(text);
    context.voiceCommandsApplied += commandsApplied;
    return processed;
  }
}

export class StitchSegmentsProcessor implements PostProcessor {
  readonly id = 'stitchSegments';
  readonly name = 'Stitch Segments';
  readonly description = 'Join multi-segment transcripts with smart spacing';

  process(text: string, context: ProcessorContext): string {
    // Stitching operates on segments, not the running text.
    // If segments are available and this is the first pass, stitch them.
    // After stitching, segments are consumed — subsequent calls are no-ops.
    if (context.segments.length > 0) {
      const stitched = stitchSegments(context.segments);
      context.segments = [];
      return stitched;
    }
    return text;
  }
}

export class AutoPunctuationProcessor implements PostProcessor {
  readonly id = 'autoPunctuation';
  readonly name = 'Auto-Punctuation';
  readonly description = 'Add a period at the end of transcripts that lack sentence-ending punctuation';

  process(text: string, context: ProcessorContext): string {
    const result = applyAutoPunctuation(text);
    if (result !== text) {
      context.punctuationAdded = true;
    }
    return result;
  }
}

export class AutoCapitalizeProcessor implements PostProcessor {
  readonly id = 'autoCapitalize';
  readonly name = 'Auto-Capitalize';
  readonly description = 'Capitalize the first letter of every transcript';

  process(text: string, context: ProcessorContext): string {
    if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
      context.capitalized = true;
      return text[0].toUpperCase() + text.slice(1);
    }
    return text;
  }
}

// ── Pipeline ─────────────────────────────────────────────────────────

/** Default processor order */
const DEFAULT_ORDER: string[] = [
  'stitchSegments',
  'trim',
  'normalizeWhitespace',
  'voiceCommands',
  'editorVoiceCommands',
  'prefixCommands',
  'customVoiceCommands',
  'fixTypos',
  'fillerWordRemoval',
  'autoVocabulary',
  'codeVocabulary',
  'smartInsert',
  'autoPunctuation',
  'autoCapitalize',
];

/** Registry of all built-in processors */
const BUILTIN_PROCESSORS: PostProcessor[] = [
  new StitchSegmentsProcessor(),
  new TrimProcessor(),
  new NormalizeWhitespaceProcessor(),
  new VoiceCommandsProcessor(),
  new EditorVoiceCommandsProcessor(),
  new PrefixCommandsProcessor(),
  new CustomVoiceCommandsProcessor(),
  new FixTyposProcessor(),
  new FillerWordRemovalProcessor(),
  new AutoVocabularyProcessor(),
  new CodeVocabularyProcessor(),
  new SmartInsertProcessor(),
  new AutoPunctuationProcessor(),
  new AutoCapitalizeProcessor(),
];

export class PostProcessingPipeline {
  private processors: Map<string, PostProcessor> = new Map();
  private order: string[] = [];
  private disabled: Set<string> = new Set();

  constructor() {
    // Register built-ins
    for (const p of BUILTIN_PROCESSORS) {
      this.processors.set(p.id, p);
    }
    this.reloadConfig();
  }

  /**
   * Register a custom processor. It will be appended to the order
   * if not already present.
   */
  register(processor: PostProcessor): void {
    this.processors.set(processor.id, processor);
    if (!this.order.includes(processor.id)) {
      this.order.push(processor.id);
    }
  }

  /**
   * Reload pipeline configuration from VS Code settings.
   * Reads `voxpilot.postProcessors.order` and `voxpilot.postProcessors.disabled`.
   * Also respects legacy per-feature toggles (autoPunctuation, autoCapitalize).
   */
  reloadConfig(): void {
    const config = vscode.workspace.getConfiguration('voxpilot');
    const pipelineConfig = config.get<{ order?: string[]; disabled?: string[] }>('postProcessors');

    // Order: use configured order, falling back to default
    if (pipelineConfig?.order && Array.isArray(pipelineConfig.order) && pipelineConfig.order.length > 0) {
      // Only keep ids that are actually registered
      this.order = pipelineConfig.order.filter(id => this.processors.has(id));
      // Append any registered processors not in the custom order
      for (const id of this.processors.keys()) {
        if (!this.order.includes(id)) {
          this.order.push(id);
        }
      }
    } else {
      this.order = [...DEFAULT_ORDER];
      // Append any extra registered processors
      for (const id of this.processors.keys()) {
        if (!this.order.includes(id)) {
          this.order.push(id);
        }
      }
    }

    // Disabled set: from pipeline config
    this.disabled = new Set(pipelineConfig?.disabled ?? []);

    // Legacy toggles: if the individual settings are explicitly false, disable
    if (config.get<boolean>('autoPunctuation') === false) {
      this.disabled.add('autoPunctuation');
    }
    if (config.get<boolean>('autoCapitalize') === false) {
      this.disabled.add('autoCapitalize');
    }
    if (config.get<boolean>('codeVocabulary') === false) {
      this.disabled.add('codeVocabulary');
    }

    // Reload custom voice commands
    const customProcessor = this.processors.get('customVoiceCommands');
    if (customProcessor && 'reload' in customProcessor) {
      (customProcessor as CustomVoiceCommandsProcessor).reload();
    }

    // Reload custom vocabulary
    const vocabProcessor = this.processors.get('codeVocabulary');
    if (vocabProcessor && 'reload' in vocabProcessor) {
      (vocabProcessor as CodeVocabularyProcessor).reload();
    }
  }

  /**
   * Run the pipeline on transcript segments, returning the final text
   * and processing context.
   */
  run(segments: string[]): { text: string; context: ProcessorContext } {
    const context: ProcessorContext = {
      segments: [...segments],
      voiceCommandsApplied: 0,
      punctuationAdded: false,
      capitalized: false,
      pendingCommands: [],
    };

    // Start with a basic join of segments — stitchSegments will replace
    // this with smart spacing if enabled
    let text = segments.map(s => s.trim()).filter(s => s).join(' ');

    for (const id of this.order) {
      if (this.disabled.has(id)) { continue; }
      const processor = this.processors.get(id);
      if (!processor) { continue; }

      text = processor.process(text, context);
    }

    return { text: text.trim(), context };
  }

  /** Get the ordered list of processor info for UI display */
  getProcessorInfo(): Array<{ id: string; name: string; description: string; enabled: boolean }> {
    return this.order.map(id => {
      const p = this.processors.get(id)!;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        enabled: !this.disabled.has(id),
      };
    });
  }

  /** Check if a specific processor is enabled */
  isEnabled(id: string): boolean {
    return this.processors.has(id) && !this.disabled.has(id);
  }
}
