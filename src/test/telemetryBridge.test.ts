import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryBridge, sanitizeProperties, isTelemetryAllowed } from '../telemetryBridge';

describe('sanitizeProperties', () => {
  it('passes through safe primitives', () => {
    const result = sanitizeProperties({ count: 5, enabled: true, model: 'moonshine' });
    expect(result.count).toBe(5);
    expect(result.enabled).toBe(true);
    expect(result.model).toBe('moonshine');
  });

  it('blocks PII-related keys', () => {
    const result = sanitizeProperties({
      username: 'alice',
      email: 'alice@example.com',
      filePath: '/home/user/secret.ts',
      transcript: 'hello world',
      content: 'some code',
      token: 'abc123',
      password: 'secret',
    });
    expect(result.username).toBeUndefined();
    expect(result.email).toBeUndefined();
    expect(result.filePath).toBeUndefined();
    expect(result.transcript).toBeUndefined();
    expect(result.content).toBeUndefined();
    expect(result.token).toBeUndefined();
    expect(result.password).toBeUndefined();
  });

  it('truncates long strings', () => {
    const longString = 'a'.repeat(100);
    const result = sanitizeProperties({ model: longString });
    expect((result.model as string).length).toBe(50);
  });

  it('skips non-primitive values', () => {
    const result = sanitizeProperties({
      count: 5,
      nested: { a: 1 },
      arr: [1, 2, 3],
      fn: () => {},
    });
    expect(result.count).toBe(5);
    expect(result.nested).toBeUndefined();
    expect(result.arr).toBeUndefined();
    expect(result.fn).toBeUndefined();
  });

  it('returns empty object for empty input', () => {
    expect(sanitizeProperties({})).toEqual({});
  });
});

describe('TelemetryBridge', () => {
  let bridge: TelemetryBridge;

  beforeEach(() => {
    bridge = new TelemetryBridge();
  });

  it('starts disabled', () => {
    expect(bridge.isEnabled()).toBe(false);
    expect(bridge.bufferSize).toBe(0);
  });

  it('record does nothing when disabled', () => {
    bridge.record('transcription.count', { model: 'moonshine', wordCount: 10 });
    expect(bridge.bufferSize).toBe(0);
  });

  it('recordTranscription does nothing when disabled', () => {
    bridge.recordTranscription('moonshine-base', 5000, 20);
    expect(bridge.bufferSize).toBe(0);
  });

  it('recordCommand does nothing when disabled', () => {
    bridge.recordCommand('undo');
    expect(bridge.bufferSize).toBe(0);
  });

  it('recordModelSelection does nothing when disabled', () => {
    bridge.recordModelSelection('whisper-small');
    expect(bridge.bufferSize).toBe(0);
  });

  it('recordFeatureActivation does nothing when disabled', () => {
    bridge.recordFeatureActivation('voiceTemplates');
    expect(bridge.bufferSize).toBe(0);
  });

  it('recordError does nothing when disabled', () => {
    bridge.recordError('model_load_failed');
    expect(bridge.bufferSize).toBe(0);
  });

  it('flush does nothing when disabled', () => {
    // Should not throw
    bridge.flush();
    expect(bridge.bufferSize).toBe(0);
  });

  it('getBufferSummary returns empty when disabled', () => {
    expect(bridge.getBufferSummary()).toEqual({});
  });

  it('disable clears buffer', () => {
    bridge.disable();
    expect(bridge.isEnabled()).toBe(false);
    expect(bridge.bufferSize).toBe(0);
  });

  it('dispose does not throw', () => {
    expect(() => bridge.dispose()).not.toThrow();
  });
});

describe('isTelemetryAllowed', () => {
  it('returns false by default (bridge not enabled)', () => {
    // In test environment, settings default to disabled
    expect(isTelemetryAllowed()).toBe(false);
  });
});
