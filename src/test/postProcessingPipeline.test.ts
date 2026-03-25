import { describe, it, expect, beforeEach } from 'vitest';
import { __setConfig, __clearConfig } from './__mocks__/vscode';

import {
  PostProcessingPipeline,
  PostProcessor,
  ProcessorContext,
  VoiceCommandsProcessor,
  StitchSegmentsProcessor,
  AutoPunctuationProcessor,
  AutoCapitalizeProcessor,
} from '../postProcessingPipeline';

beforeEach(() => {
  __clearConfig();
});

describe('PostProcessingPipeline', () => {
  it('runs all built-in processors in default order', () => {
    const pipeline = new PostProcessingPipeline();
    const { text } = pipeline.run(['hello world']);
    // stitchSegments → voiceCommands (no-op) → autoPunctuation (adds .) → autoCapitalize (H)
    expect(text).toBe('Hello world.');
  });

  it('handles multiple segments with stitching', () => {
    const pipeline = new PostProcessingPipeline();
    const { text } = pipeline.run(['hello', 'world']);
    expect(text).toBe('Hello world.');
  });

  it('processes voice commands across segments', () => {
    const pipeline = new PostProcessingPipeline();
    const { text, context } = pipeline.run(['hello period world']);
    expect(text).toBe('Hello. world.');
    expect(context.voiceCommandsApplied).toBeGreaterThan(0);
  });

  it('skips auto-punctuation when already punctuated', () => {
    const pipeline = new PostProcessingPipeline();
    const { text, context } = pipeline.run(['hello world!']);
    expect(text).toBe('Hello world!');
    expect(context.punctuationAdded).toBe(false);
  });

  it('skips auto-capitalize when already capitalized', () => {
    const pipeline = new PostProcessingPipeline();
    const { text, context } = pipeline.run(['Hello world']);
    expect(text).toBe('Hello world.');
    expect(context.capitalized).toBe(false);
  });

  it('handles empty segments', () => {
    const pipeline = new PostProcessingPipeline();
    const { text } = pipeline.run([]);
    expect(text).toBe('');
  });

  it('handles whitespace-only segments', () => {
    const pipeline = new PostProcessingPipeline();
    const { text } = pipeline.run(['  ', '  ']);
    expect(text).toBe('');
  });

  it('respects disabled processors via postProcessors.disabled', () => {
    __setConfig('postProcessors', { disabled: ['autoPunctuation'] });
    const pipeline = new PostProcessingPipeline();
    const { text, context } = pipeline.run(['hello world']);
    expect(text).toBe('Hello world');
    expect(context.punctuationAdded).toBe(false);
  });

  it('respects legacy autoPunctuation=false toggle', () => {
    __setConfig('autoPunctuation', false);
    const pipeline = new PostProcessingPipeline();
    const { text } = pipeline.run(['hello world']);
    expect(text).toBe('Hello world');
  });

  it('respects legacy autoCapitalize=false toggle', () => {
    __setConfig('autoCapitalize', false);
    const pipeline = new PostProcessingPipeline();
    const { text } = pipeline.run(['hello world']);
    expect(text).toBe('hello world.');
  });

  it('respects custom processor order', () => {
    // Reverse: capitalize before punctuation — result should be the same
    // since they operate on different parts of the text
    __setConfig('postProcessors', {
      order: ['stitchSegments', 'voiceCommands', 'autoCapitalize', 'autoPunctuation'],
    });
    const pipeline = new PostProcessingPipeline();
    const { text } = pipeline.run(['hello world']);
    expect(text).toBe('Hello world.');
  });

  it('falls back to simple join when stitchSegments is disabled', () => {
    __setConfig('postProcessors', { disabled: ['stitchSegments'] });
    const pipeline = new PostProcessingPipeline();
    const { text } = pipeline.run(['hello', 'world']);
    // Segments not consumed by stitcher → fallback join at end
    // voiceCommands runs on empty text (segments still in context)
    // After fallback join: "hello world" → capitalize + punctuate
    expect(text).toBe('Hello world.');
  });

  it('reloadConfig picks up new settings', () => {
    const pipeline = new PostProcessingPipeline();
    // Initially all enabled
    expect(pipeline.isEnabled('autoPunctuation')).toBe(true);

    __setConfig('postProcessors', { disabled: ['autoPunctuation'] });
    pipeline.reloadConfig();
    expect(pipeline.isEnabled('autoPunctuation')).toBe(false);
  });

  it('getProcessorInfo returns all processors with status', () => {
    const pipeline = new PostProcessingPipeline();
    const info = pipeline.getProcessorInfo();
    expect(info.length).toBe(4);
    expect(info.map(i => i.id)).toEqual([
      'stitchSegments',
      'voiceCommands',
      'autoPunctuation',
      'autoCapitalize',
    ]);
    expect(info.every(i => i.enabled)).toBe(true);
  });

  it('getProcessorInfo reflects disabled state', () => {
    __setConfig('postProcessors', { disabled: ['autoCapitalize'] });
    const pipeline = new PostProcessingPipeline();
    const info = pipeline.getProcessorInfo();
    const capInfo = info.find(i => i.id === 'autoCapitalize');
    expect(capInfo?.enabled).toBe(false);
  });
});

describe('Custom processor registration', () => {
  it('register adds a custom processor to the pipeline', () => {
    const pipeline = new PostProcessingPipeline();
    const custom: PostProcessor = {
      id: 'shout',
      name: 'Shout',
      description: 'UPPERCASE everything',
      process: (text: string) => text.toUpperCase(),
    };
    pipeline.register(custom);

    const { text } = pipeline.run(['hello world']);
    // Default processors run first, then custom appended at end
    expect(text).toBe('HELLO WORLD.');
  });

  it('custom processor appears in getProcessorInfo', () => {
    const pipeline = new PostProcessingPipeline();
    pipeline.register({
      id: 'custom1',
      name: 'Custom',
      description: 'Test',
      process: (t: string) => t,
    });
    const info = pipeline.getProcessorInfo();
    expect(info.find(i => i.id === 'custom1')).toBeDefined();
  });
});

describe('Individual processors', () => {
  const makeContext = (): ProcessorContext => ({
    segments: [],
    voiceCommandsApplied: 0,
    punctuationAdded: false,
    capitalized: false,
  });

  it('VoiceCommandsProcessor processes commands', () => {
    const p = new VoiceCommandsProcessor();
    const ctx = makeContext();
    const result = p.process('hello comma world', ctx);
    expect(result).toBe('hello, world');
    expect(ctx.voiceCommandsApplied).toBeGreaterThan(0);
  });

  it('StitchSegmentsProcessor stitches from context.segments', () => {
    const p = new StitchSegmentsProcessor();
    const ctx = makeContext();
    ctx.segments = ['hello', 'world'];
    const result = p.process('', ctx);
    expect(result).toBe('hello world');
    expect(ctx.segments).toEqual([]);
  });

  it('StitchSegmentsProcessor is no-op when segments empty', () => {
    const p = new StitchSegmentsProcessor();
    const ctx = makeContext();
    const result = p.process('existing text', ctx);
    expect(result).toBe('existing text');
  });

  it('AutoPunctuationProcessor adds period', () => {
    const p = new AutoPunctuationProcessor();
    const ctx = makeContext();
    const result = p.process('hello world', ctx);
    expect(result).toBe('hello world.');
    expect(ctx.punctuationAdded).toBe(true);
  });

  it('AutoPunctuationProcessor skips when punctuated', () => {
    const p = new AutoPunctuationProcessor();
    const ctx = makeContext();
    const result = p.process('hello world!', ctx);
    expect(result).toBe('hello world!');
    expect(ctx.punctuationAdded).toBe(false);
  });

  it('AutoCapitalizeProcessor capitalizes first letter', () => {
    const p = new AutoCapitalizeProcessor();
    const ctx = makeContext();
    const result = p.process('hello', ctx);
    expect(result).toBe('Hello');
    expect(ctx.capitalized).toBe(true);
  });

  it('AutoCapitalizeProcessor skips when already capitalized', () => {
    const p = new AutoCapitalizeProcessor();
    const ctx = makeContext();
    const result = p.process('Hello', ctx);
    expect(result).toBe('Hello');
    expect(ctx.capitalized).toBe(false);
  });
});
