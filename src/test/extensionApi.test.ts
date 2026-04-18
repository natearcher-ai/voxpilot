import { describe, it, expect, vi } from 'vitest';
import { VoxPilotEventEmitter, createAPI } from '../extensionApi';

describe('VoxPilotEventEmitter', () => {
  it('starts with no listeners', () => {
    const emitter = new VoxPilotEventEmitter();
    expect(emitter.listenerCount('recording-start')).toBe(0);
    expect(emitter.registeredTypes).toEqual([]);
  });

  it('registers and fires event listeners', () => {
    const emitter = new VoxPilotEventEmitter();
    let fired = false;
    emitter.on('recording-start', () => { fired = true; });
    emitter.emit({ type: 'recording-start', timestamp: Date.now() });
    expect(fired).toBe(true);
  });

  it('dispose removes listener', () => {
    const emitter = new VoxPilotEventEmitter();
    let count = 0;
    const disposable = emitter.on('recording-start', () => { count++; });
    emitter.emit({ type: 'recording-start', timestamp: Date.now() });
    expect(count).toBe(1);

    disposable.dispose();
    emitter.emit({ type: 'recording-start', timestamp: Date.now() });
    expect(count).toBe(1); // Not incremented
  });

  it('fires transcript-specific listeners on transcript-complete', () => {
    const emitter = new VoxPilotEventEmitter();
    let received = '';
    emitter.onTranscript((text) => { received = text; });
    emitter.emit({
      type: 'transcript-complete',
      timestamp: Date.now(),
      data: { text: 'hello world', language: 'en' },
    });
    expect(received).toBe('hello world');
  });

  it('does not fire transcript listeners on other events', () => {
    const emitter = new VoxPilotEventEmitter();
    let received = '';
    emitter.onTranscript((text) => { received = text; });
    emitter.emit({ type: 'recording-start', timestamp: Date.now() });
    expect(received).toBe('');
  });

  it('counts listeners correctly', () => {
    const emitter = new VoxPilotEventEmitter();
    emitter.on('recording-start', () => {});
    emitter.on('recording-start', () => {});
    emitter.on('recording-stop', () => {});
    expect(emitter.listenerCount('recording-start')).toBe(2);
    expect(emitter.listenerCount('recording-stop')).toBe(1);
  });

  it('removeAll clears everything', () => {
    const emitter = new VoxPilotEventEmitter();
    emitter.on('recording-start', () => {});
    emitter.onTranscript(() => {});
    emitter.removeAll();
    expect(emitter.listenerCount('recording-start')).toBe(0);
    expect(emitter.registeredTypes).toEqual([]);
  });

  it('swallows listener errors', () => {
    const emitter = new VoxPilotEventEmitter();
    emitter.on('recording-start', () => { throw new Error('boom'); });
    // Should not throw
    expect(() => emitter.emit({ type: 'recording-start', timestamp: Date.now() })).not.toThrow();
  });
});

describe('createAPI', () => {
  it('exposes version and state', () => {
    const emitter = new VoxPilotEventEmitter();
    const api = createAPI(
      emitter,
      () => ({ isRecording: true, model: 'moonshine-base', language: 'en', lastTranscript: 'hello' }),
      { start: async () => {}, stop: async () => {} },
      '0.7.59',
    );

    expect(api.version).toBe('0.7.59');
    expect(api.isRecording).toBe(true);
    expect(api.currentModel).toBe('moonshine-base');
    expect(api.currentLanguage).toBe('en');
    expect(api.getLastTranscript()).toBe('hello');
  });

  it('onTranscript wires to emitter', () => {
    const emitter = new VoxPilotEventEmitter();
    const api = createAPI(
      emitter,
      () => ({ isRecording: false, model: 'moonshine-base', language: 'en' }),
      { start: async () => {}, stop: async () => {} },
      '0.7.59',
    );

    let received = '';
    api.onTranscript((text) => { received = text; });
    emitter.emit({
      type: 'transcript-complete',
      timestamp: Date.now(),
      data: { text: 'test transcript' },
    });
    expect(received).toBe('test transcript');
  });

  it('startRecording calls control', async () => {
    const emitter = new VoxPilotEventEmitter();
    let started = false;
    const api = createAPI(
      emitter,
      () => ({ isRecording: false, model: 'moonshine-base', language: 'en' }),
      { start: async () => { started = true; }, stop: async () => {} },
      '0.7.59',
    );

    await api.startRecording();
    expect(started).toBe(true);
  });
});
