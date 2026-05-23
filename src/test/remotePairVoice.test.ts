import { describe, it, expect, beforeEach } from 'vitest';
import { RemotePairVoice } from '../remotePairVoice';

describe('RemotePairVoice', () => {
  let pairVoice: RemotePairVoice;

  beforeEach(() => {
    pairVoice = new RemotePairVoice();
  });

  it('starts inactive', () => {
    expect(pairVoice.isActive()).toBe(false);
    expect(pairVoice.isBroadcasting()).toBe(false);
  });

  it('activate requires Live Share connection', () => {
    // Without Live Share connected, activate should not work
    pairVoice.activate();
    expect(pairVoice.isActive()).toBe(false);
  });

  it('activate works when Live Share is connected', () => {
    pairVoice.setLiveShareConnected(true);
    pairVoice.activate();
    expect(pairVoice.isActive()).toBe(true);
    expect(pairVoice.isBroadcasting()).toBe(true);
  });

  it('deactivate stops pair voice', () => {
    pairVoice.setLiveShareConnected(true);
    pairVoice.activate();
    pairVoice.deactivate();
    expect(pairVoice.isActive()).toBe(false);
    expect(pairVoice.isBroadcasting()).toBe(false);
  });

  it('toggle activates then deactivates', () => {
    pairVoice.setLiveShareConnected(true);
    pairVoice.toggle();
    expect(pairVoice.isActive()).toBe(true);
    pairVoice.toggle();
    expect(pairVoice.isActive()).toBe(false);
  });

  it('mute stops broadcasting but stays active', () => {
    pairVoice.setLiveShareConnected(true);
    pairVoice.activate();
    pairVoice.mute();
    expect(pairVoice.isActive()).toBe(true);
    expect(pairVoice.isBroadcasting()).toBe(false);
  });

  it('unmute resumes broadcasting', () => {
    pairVoice.setLiveShareConnected(true);
    pairVoice.activate();
    pairVoice.mute();
    pairVoice.unmute();
    expect(pairVoice.isBroadcasting()).toBe(true);
  });

  it('shareTranscript does nothing when inactive', () => {
    // Should not throw
    pairVoice.shareTranscript('hello world', true, 'en');
    expect(pairVoice.getParticipants()).toHaveLength(0);
  });

  it('shareCommand does nothing when inactive', () => {
    pairVoice.shareCommand('editor.action.formatDocument', 'Format Document');
    expect(pairVoice.getParticipants()).toHaveLength(0);
  });

  it('handleMessage adds participant on transcript', () => {
    pairVoice.setLiveShareConnected(true);
    pairVoice.activate();

    pairVoice.handleMessage({
      type: 'transcript',
      sender: 'Alice',
      timestamp: Date.now(),
      data: { text: 'hello world', isFinal: true },
    });

    const participants = pairVoice.getParticipants();
    expect(participants).toHaveLength(1);
    expect(participants[0].name).toBe('Alice');
    expect(participants[0].lastTranscript).toBe('hello world');
  });

  it('handleMessage tracks speaking state', () => {
    pairVoice.setLiveShareConnected(true);
    pairVoice.activate();

    pairVoice.handleMessage({
      type: 'transcript',
      sender: 'Bob',
      timestamp: Date.now(),
      data: { text: 'partial...', isFinal: false },
    });

    const participants = pairVoice.getParticipants();
    expect(participants[0].isSpeaking).toBe(true);

    pairVoice.handleMessage({
      type: 'transcript',
      sender: 'Bob',
      timestamp: Date.now(),
      data: { text: 'complete sentence', isFinal: true },
    });

    const updated = pairVoice.getParticipants();
    expect(updated[0].isSpeaking).toBe(false);
  });

  it('handleMessage handles mute/unmute', () => {
    pairVoice.handleMessage({
      type: 'mute',
      sender: 'Charlie',
      timestamp: Date.now(),
      data: {},
    });

    const participants = pairVoice.getParticipants();
    expect(participants[0].isMuted).toBe(true);

    pairVoice.handleMessage({
      type: 'unmute',
      sender: 'Charlie',
      timestamp: Date.now(),
      data: {},
    });

    const updated = pairVoice.getParticipants();
    expect(updated[0].isMuted).toBe(false);
  });

  it('handleMessage handles status-change', () => {
    pairVoice.handleMessage({
      type: 'status-change',
      sender: 'Dave',
      timestamp: Date.now(),
      data: { status: 'active' },
    });

    const participants = pairVoice.getParticipants();
    expect(participants[0].voxpilotActive).toBe(true);
  });

  it('onMessage registers handler and fires on matching type', () => {
    let received = false;
    const disposable = pairVoice.onMessage('command', () => { received = true; });

    pairVoice.handleMessage({
      type: 'command',
      sender: 'Eve',
      timestamp: Date.now(),
      data: { commandId: 'test', commandName: 'Test', source: 'voice' },
    });

    expect(received).toBe(true);
    disposable.dispose();
  });

  it('onMessage dispose removes handler', () => {
    let count = 0;
    const disposable = pairVoice.onMessage('transcript', () => { count++; });

    pairVoice.handleMessage({
      type: 'transcript',
      sender: 'Frank',
      timestamp: Date.now(),
      data: { text: 'first', isFinal: true },
    });
    expect(count).toBe(1);

    disposable.dispose();

    pairVoice.handleMessage({
      type: 'transcript',
      sender: 'Frank',
      timestamp: Date.now(),
      data: { text: 'second', isFinal: true },
    });
    expect(count).toBe(1); // Not incremented
  });

  it('setLiveShareConnected false deactivates pair voice', () => {
    pairVoice.setLiveShareConnected(true);
    pairVoice.activate();
    expect(pairVoice.isActive()).toBe(true);

    pairVoice.setLiveShareConnected(false);
    expect(pairVoice.isActive()).toBe(false);
  });

  it('syncVocabulary does nothing when inactive', () => {
    // Should not throw
    pairVoice.syncVocabulary(['react', 'useState', 'useEffect']);
  });

  it('getState returns copy of state', () => {
    pairVoice.setLiveShareConnected(true);
    const state = pairVoice.getState();
    expect(state.liveShareConnected).toBe(true);
    expect(state.active).toBe(false);
  });
});
