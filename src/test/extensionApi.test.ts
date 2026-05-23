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

  it('registerProcessor adds external processor and returns disposable', () => {
    const emitter = new VoxPilotEventEmitter();
    const registered: Array<{ id: string }> = [];
    const mockPipeline = {
      register: (p: { id: string }) => { registered.push(p); },
      unregister: (id: string) => { registered.splice(registered.findIndex(r => r.id === id), 1); },
      getProcessorInfo: () => registered.map(r => ({ id: r.id, name: r.id, enabled: true })),
    };
    const api = createAPI(
      emitter,
      () => ({ isRecording: false, model: 'moonshine-base', language: 'en' }),
      { start: async () => {}, stop: async () => {} },
      '0.7.85',
      mockPipeline,
    );

    const disposable = api.registerProcessor({
      id: 'ext-upper',
      name: 'Uppercase',
      process: (text) => text.toUpperCase(),
    });

    expect(registered.length).toBe(1);
    expect(registered[0].id).toBe('ext-upper');

    disposable.dispose();
    expect(registered.length).toBe(0);
  });

  it('registerProcessor throws on duplicate id', () => {
    const emitter = new VoxPilotEventEmitter();
    const api = createAPI(
      emitter,
      () => ({ isRecording: false, model: 'moonshine-base', language: 'en' }),
      { start: async () => {}, stop: async () => {} },
      '0.7.85',
    );

    api.registerProcessor({ id: 'ext-test', name: 'Test', process: (t) => t });
    expect(() => api.registerProcessor({ id: 'ext-test', name: 'Test2', process: (t) => t }))
      .toThrow('already registered');
  });

  it('registerCommand adds command and unregisterCommand removes it', () => {
    const emitter = new VoxPilotEventEmitter();
    const api = createAPI(
      emitter,
      () => ({ isRecording: false, model: 'moonshine-base', language: 'en' }),
      { start: async () => {}, stop: async () => {} },
      '0.7.85',
    );

    const disposable = api.registerCommand({
      phrase: 'deploy app',
      action: 'command',
      command: 'myext.deploy',
      description: 'Deploy the application',
    });

    expect(api.getMetrics().externalCommandCount).toBe(1);

    disposable.dispose();
    expect(api.getMetrics().externalCommandCount).toBe(0);
  });

  it('registerCommand throws on duplicate phrase', () => {
    const emitter = new VoxPilotEventEmitter();
    const api = createAPI(
      emitter,
      () => ({ isRecording: false, model: 'moonshine-base', language: 'en' }),
      { start: async () => {}, stop: async () => {} },
      '0.7.85',
    );

    api.registerCommand({ phrase: 'hello', action: 'insert', text: 'hi' });
    expect(() => api.registerCommand({ phrase: 'Hello', action: 'insert', text: 'hey' }))
      .toThrow('already registered');
  });

  it('getMetrics returns correct counts', () => {
    const emitter = new VoxPilotEventEmitter();
    const mockPipeline = {
      register: () => {},
      unregister: () => {},
      getProcessorInfo: () => [
        { id: 'builtin1', name: 'Built-in 1', enabled: true },
        { id: 'builtin2', name: 'Built-in 2', enabled: true },
      ],
    };
    const api = createAPI(
      emitter,
      () => ({ isRecording: false, model: 'moonshine-base', language: 'en' }),
      { start: async () => {}, stop: async () => {} },
      '0.7.85',
      mockPipeline,
    );

    api.registerProcessor({ id: 'ext-1', name: 'Ext 1', process: (t) => t });
    api.registerCommand({ phrase: 'test cmd', action: 'insert', text: 'x' });

    const metrics = api.getMetrics();
    expect(metrics.externalProcessorCount).toBe(1);
    expect(metrics.externalCommandCount).toBe(1);
    expect(metrics.processorCount).toBe(3); // 2 built-in + 1 external
  });

  it('listProcessors includes both built-in and external', () => {
    const emitter = new VoxPilotEventEmitter();
    const mockPipeline = {
      register: () => {},
      unregister: () => {},
      getProcessorInfo: () => [
        { id: 'builtin1', name: 'Built-in 1', enabled: true },
      ],
    };
    const api = createAPI(
      emitter,
      () => ({ isRecording: false, model: 'moonshine-base', language: 'en' }),
      { start: async () => {}, stop: async () => {} },
      '0.7.85',
      mockPipeline,
    );

    api.registerProcessor({ id: 'ext-fmt', name: 'Formatter', process: (t) => t });

    const list = api.listProcessors();
    expect(list.length).toBe(2);
    expect(list.find(p => p.id === 'builtin1')?.external).toBe(false);
    expect(list.find(p => p.id === 'ext-fmt')?.external).toBe(true);
    expect(list.find(p => p.id === 'ext-fmt')?.name).toBe('Formatter');
  });

  it('unregisterProcessor removes by id', () => {
    const emitter = new VoxPilotEventEmitter();
    const api = createAPI(
      emitter,
      () => ({ isRecording: false, model: 'moonshine-base', language: 'en' }),
      { start: async () => {}, stop: async () => {} },
      '0.7.85',
    );

    api.registerProcessor({ id: 'ext-rm', name: 'Removable', process: (t) => t });
    expect(api.getMetrics().externalProcessorCount).toBe(1);

    api.unregisterProcessor('ext-rm');
    expect(api.getMetrics().externalProcessorCount).toBe(0);
  });
});
