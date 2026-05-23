import { describe, it, expect, beforeEach } from 'vitest';
import { StreamingCollaboration } from '../streamingCollaboration';

describe('StreamingCollaboration', () => {
  let streaming: StreamingCollaboration;

  beforeEach(() => {
    streaming = new StreamingCollaboration();
  });

  it('starts inactive with no session', () => {
    expect(streaming.isActive()).toBe(false);
    expect(streaming.getSession()).toBeNull();
  });

  it('startSession creates active session', () => {
    const session = streaming.startSession();
    expect(session.active).toBe(true);
    expect(session.captions).toHaveLength(0);
    expect(session.totalWords).toBe(0);
    expect(streaming.isActive()).toBe(true);
  });

  it('startSession with speaker name configures speaker', () => {
    streaming.startSession('Alice');
    const config = streaming.getConfig();
    expect(config.showSpeaker).toBe(true);
    expect(config.speakerName).toBe('Alice');
  });

  it('endSession stops session and returns it', () => {
    streaming.startSession();
    streaming.addCaption('hello world');
    const session = streaming.endSession();
    expect(session).not.toBeNull();
    expect(session!.active).toBe(false);
    expect(session!.durationMs).toBeGreaterThanOrEqual(0);
    expect(streaming.isActive()).toBe(false);
  });

  it('endSession returns null when no session', () => {
    expect(streaming.endSession()).toBeNull();
  });

  it('addCaption adds to session', () => {
    streaming.startSession();
    streaming.addCaption('hello world', 2000);
    streaming.addCaption('second line', 1500);

    const session = streaming.getSession();
    expect(session!.captions).toHaveLength(2);
    expect(session!.captions[0].text).toBe('hello world');
    expect(session!.captions[1].text).toBe('second line');
    expect(session!.totalWords).toBe(4);
  });

  it('addCaption does nothing when no session', () => {
    streaming.addCaption('orphan text');
    expect(streaming.getSession()).toBeNull();
  });

  it('addCaption includes speaker when configured', () => {
    streaming.startSession('Bob');
    streaming.addCaption('test caption');

    const session = streaming.getSession();
    expect(session!.captions[0].speaker).toBe('Bob');
  });

  it('updatePartial adds partial entry to display', () => {
    streaming.startSession();
    streaming.updatePartial('typing...');

    const buffer = streaming.getDisplayBuffer();
    expect(buffer).toHaveLength(1);
    expect(buffer[0].partial).toBe(true);
    expect(buffer[0].text).toBe('typing...');
  });

  it('updatePartial replaces previous partial', () => {
    streaming.startSession();
    streaming.updatePartial('hel');
    streaming.updatePartial('hello');
    streaming.updatePartial('hello world');

    const buffer = streaming.getDisplayBuffer();
    expect(buffer).toHaveLength(1);
    expect(buffer[0].text).toBe('hello world');
  });

  it('addCaption clears partial from display', () => {
    streaming.startSession();
    streaming.updatePartial('hello wor');
    streaming.addCaption('hello world', 2000);

    const buffer = streaming.getDisplayBuffer();
    expect(buffer.every(e => !e.partial)).toBe(true);
    expect(buffer[buffer.length - 1].text).toBe('hello world');
  });

  it('display buffer respects maxLines', () => {
    streaming.setConfig({ maxLines: 2 });
    streaming.startSession();
    streaming.addCaption('line 1', 1000);
    streaming.addCaption('line 2', 1000);
    streaming.addCaption('line 3', 1000);

    const buffer = streaming.getDisplayBuffer();
    expect(buffer).toHaveLength(2);
    expect(buffer[0].text).toBe('line 2');
    expect(buffer[1].text).toBe('line 3');
  });

  it('clearDisplay empties buffer', () => {
    streaming.startSession();
    streaming.addCaption('test', 1000);
    streaming.clearDisplay();
    expect(streaming.getDisplayBuffer()).toHaveLength(0);
  });

  it('exportSRT produces valid SRT format', () => {
    streaming.startSession();
    streaming.addCaption('first caption', 2000);
    streaming.addCaption('second caption', 1500);

    const srt = streaming.exportSRT();
    expect(srt).toContain('1\n');
    expect(srt).toContain('-->');
    expect(srt).toContain('first caption');
    expect(srt).toContain('2\n');
    expect(srt).toContain('second caption');
  });

  it('exportSRT includes speaker when present', () => {
    streaming.startSession('Alice');
    streaming.addCaption('hello', 1000);

    const srt = streaming.exportSRT();
    expect(srt).toContain('<Alice>');
  });

  it('exportSRT returns empty for no session', () => {
    expect(streaming.exportSRT()).toBe('');
  });

  it('exportWebVTT produces valid WebVTT format', () => {
    streaming.startSession();
    streaming.addCaption('test caption', 2000);

    const vtt = streaming.exportWebVTT();
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('-->');
    expect(vtt).toContain('test caption');
  });

  it('exportWebVTT returns header for no captions', () => {
    const vtt = streaming.exportWebVTT();
    expect(vtt).toBe('WEBVTT\n\n');
  });

  it('exportText produces timestamped text', () => {
    streaming.startSession();
    streaming.addCaption('hello world', 1000);

    const text = streaming.exportText();
    expect(text).toContain('hello world');
    expect(text).toContain('00:00:0');
  });

  it('getStats returns session statistics', () => {
    streaming.startSession();
    streaming.addCaption('one two three', 3000);
    streaming.addCaption('four five', 2000);

    const stats = streaming.getStats();
    expect(stats).not.toBeNull();
    expect(stats!.captions).toBe(2);
    expect(stats!.words).toBe(5);
    expect(stats!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('getStats returns null when no session', () => {
    expect(streaming.getStats()).toBeNull();
  });

  it('getConfig returns current config', () => {
    const config = streaming.getConfig();
    expect(config.position).toBe('bottom');
    expect(config.maxLines).toBe(3);
    expect(config.fontSize).toBe(18);
  });

  it('setConfig updates config', () => {
    streaming.setConfig({ position: 'top', fontSize: 24, maxLines: 5 });
    const config = streaming.getConfig();
    expect(config.position).toBe('top');
    expect(config.fontSize).toBe(24);
    expect(config.maxLines).toBe(5);
  });
});
