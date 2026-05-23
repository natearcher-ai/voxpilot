import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceMacroRecorder } from '../voiceMacroRecorder';

describe('VoiceMacroRecorder', () => {
  let recorder: VoiceMacroRecorder;

  beforeEach(() => {
    recorder = new VoiceMacroRecorder();
  });

  it('starts with no macros', () => {
    expect(recorder.count).toBe(0);
    expect(recorder.getMacros()).toHaveLength(0);
  });

  it('isRecording returns false initially', () => {
    expect(recorder.isRecording()).toBe(false);
    expect(recorder.getRecording()).toBeNull();
  });

  it('startRecording creates active session', () => {
    const session = recorder.startRecording('test macro');
    expect(session.active).toBe(true);
    expect(session.name).toBe('test macro');
    expect(session.steps).toHaveLength(0);
    expect(recorder.isRecording()).toBe(true);
  });

  it('addStep adds to recording', () => {
    recorder.startRecording('test');
    expect(recorder.addStep({ type: 'text', text: 'hello' })).toBe(true);
    expect(recorder.addStep({ type: 'command', commandId: 'editor.action.formatDocument' })).toBe(true);

    const session = recorder.getRecording();
    expect(session!.steps).toHaveLength(2);
  });

  it('addStep returns false when not recording', () => {
    expect(recorder.addStep({ type: 'text', text: 'hello' })).toBe(false);
  });

  it('stopRecording saves macro', () => {
    recorder.startRecording('format and save');
    recorder.addStep({ type: 'command', commandId: 'editor.action.formatDocument' });
    recorder.addStep({ type: 'command', commandId: 'workbench.action.files.save' });

    const macro = recorder.stopRecording('format save', 'Format then save');
    expect(macro).not.toBeNull();
    expect(macro!.triggerPhrase).toBe('format save');
    expect(macro!.description).toBe('Format then save');
    expect(macro!.steps).toHaveLength(2);
    expect(macro!.enabled).toBe(true);
    expect(recorder.count).toBe(1);
    expect(recorder.isRecording()).toBe(false);
  });

  it('stopRecording uses name as default trigger', () => {
    recorder.startRecording('my macro');
    recorder.addStep({ type: 'text', text: 'test' });
    const macro = recorder.stopRecording();
    expect(macro!.triggerPhrase).toBe('my macro');
  });

  it('stopRecording returns null when not recording', () => {
    expect(recorder.stopRecording()).toBeNull();
  });

  it('cancelRecording clears session', () => {
    recorder.startRecording('test');
    recorder.addStep({ type: 'text', text: 'hello' });
    recorder.cancelRecording();
    expect(recorder.isRecording()).toBe(false);
    expect(recorder.getRecording()).toBeNull();
    expect(recorder.count).toBe(0);
  });

  it('findByPhrase finds macro case-insensitively', () => {
    recorder.startRecording('test');
    recorder.addStep({ type: 'text', text: 'hi' });
    recorder.stopRecording('Deploy App');

    expect(recorder.findByPhrase('deploy app')).toBeDefined();
    expect(recorder.findByPhrase('DEPLOY APP')).toBeDefined();
    expect(recorder.findByPhrase('unknown')).toBeUndefined();
  });

  it('findByPhrase skips disabled macros', () => {
    recorder.startRecording('test');
    recorder.addStep({ type: 'text', text: 'hi' });
    const macro = recorder.stopRecording('deploy');

    recorder.setEnabled(macro!.id, false);
    expect(recorder.findByPhrase('deploy')).toBeUndefined();
  });

  it('deleteMacro removes macro', () => {
    recorder.startRecording('test');
    recorder.addStep({ type: 'text', text: 'hi' });
    const macro = recorder.stopRecording('test');

    expect(recorder.deleteMacro(macro!.id)).toBe(true);
    expect(recorder.count).toBe(0);
  });

  it('deleteMacro returns false for unknown id', () => {
    expect(recorder.deleteMacro('nonexistent')).toBe(false);
  });

  it('setEnabled toggles macro state', () => {
    recorder.startRecording('test');
    recorder.addStep({ type: 'text', text: 'hi' });
    const macro = recorder.stopRecording('test');

    recorder.setEnabled(macro!.id, false);
    expect(recorder.getMacro(macro!.id)!.enabled).toBe(false);

    recorder.setEnabled(macro!.id, true);
    expect(recorder.getMacro(macro!.id)!.enabled).toBe(true);
  });

  it('setTriggerPhrase updates phrase', () => {
    recorder.startRecording('test');
    recorder.addStep({ type: 'text', text: 'hi' });
    const macro = recorder.stopRecording('old phrase');

    recorder.setTriggerPhrase(macro!.id, 'new phrase');
    expect(recorder.getMacro(macro!.id)!.triggerPhrase).toBe('new phrase');
  });

  it('addStepToMacro appends step', () => {
    recorder.startRecording('test');
    recorder.addStep({ type: 'text', text: 'first' });
    const macro = recorder.stopRecording('test');

    recorder.addStepToMacro(macro!.id, { type: 'text', text: 'second' });
    expect(recorder.getMacro(macro!.id)!.steps).toHaveLength(2);
  });

  it('addStepToMacro inserts at index', () => {
    recorder.startRecording('test');
    recorder.addStep({ type: 'text', text: 'first' });
    recorder.addStep({ type: 'text', text: 'third' });
    const macro = recorder.stopRecording('test');

    recorder.addStepToMacro(macro!.id, { type: 'text', text: 'second' }, 1);
    const steps = recorder.getMacro(macro!.id)!.steps;
    expect(steps[1].text).toBe('second');
  });

  it('removeStep removes by index', () => {
    recorder.startRecording('test');
    recorder.addStep({ type: 'text', text: 'a' });
    recorder.addStep({ type: 'text', text: 'b' });
    recorder.addStep({ type: 'text', text: 'c' });
    const macro = recorder.stopRecording('test');

    recorder.removeStep(macro!.id, 1);
    const steps = recorder.getMacro(macro!.id)!.steps;
    expect(steps).toHaveLength(2);
    expect(steps[0].text).toBe('a');
    expect(steps[1].text).toBe('c');
  });

  it('removeStep returns false for invalid index', () => {
    recorder.startRecording('test');
    recorder.addStep({ type: 'text', text: 'a' });
    const macro = recorder.stopRecording('test');

    expect(recorder.removeStep(macro!.id, -1)).toBe(false);
    expect(recorder.removeStep(macro!.id, 5)).toBe(false);
  });

  it('exportMacro returns JSON', () => {
    recorder.startRecording('test');
    recorder.addStep({ type: 'command', commandId: 'editor.action.formatDocument' });
    const macro = recorder.stopRecording('format');

    const json = recorder.exportMacro(macro!.id);
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json!);
    expect(parsed.triggerPhrase).toBe('format');
    expect(parsed.steps).toHaveLength(1);
  });

  it('exportMacro returns null for unknown id', () => {
    expect(recorder.exportMacro('nonexistent')).toBeNull();
  });

  it('importMacro creates new macro from JSON', () => {
    recorder.startRecording('test');
    recorder.addStep({ type: 'text', text: 'imported' });
    const original = recorder.stopRecording('original');
    const json = recorder.exportMacro(original!.id)!;

    const imported = recorder.importMacro(json);
    expect(imported).not.toBeNull();
    expect(imported!.id).not.toBe(original!.id);
    expect(imported!.triggerPhrase).toBe('original');
    expect(imported!.executionCount).toBe(0);
    expect(recorder.count).toBe(2);
  });

  it('importMacro returns null for invalid JSON', () => {
    expect(recorder.importMacro('not json')).toBeNull();
    expect(recorder.importMacro('{}')).toBeNull();
  });

  it('getTopMacros sorts by execution count', () => {
    recorder.startRecording('a');
    recorder.addStep({ type: 'text', text: 'a' });
    const macroA = recorder.stopRecording('alpha');

    recorder.startRecording('b');
    recorder.addStep({ type: 'text', text: 'b' });
    recorder.stopRecording('beta');

    // Simulate executions by updating count directly
    const m = recorder.getMacro(macroA!.id)!;
    m.executionCount = 10;

    const top = recorder.getTopMacros(5);
    expect(top[0].triggerPhrase).toBe('alpha');
  });

  it('getEnabledMacros filters disabled', () => {
    recorder.startRecording('a');
    recorder.addStep({ type: 'text', text: 'a' });
    const macro = recorder.stopRecording('alpha');

    recorder.startRecording('b');
    recorder.addStep({ type: 'text', text: 'b' });
    recorder.stopRecording('beta');

    recorder.setEnabled(macro!.id, false);
    expect(recorder.getEnabledMacros()).toHaveLength(1);
  });
});
