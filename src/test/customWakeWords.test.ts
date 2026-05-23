import { describe, it, expect, beforeEach } from 'vitest';
import { CustomWakeWordManager, extractFeatures, dtwDistance } from '../customWakeWords';

describe('extractFeatures', () => {
  it('extracts features from audio data', () => {
    const sampleRate = 16000;
    const audioData = new Float32Array(sampleRate); // 1 second of audio
    // Fill with a simple sine wave
    for (let i = 0; i < audioData.length; i++) {
      audioData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate);
    }

    const features = extractFeatures(audioData, sampleRate);
    expect(features.length).toBeGreaterThan(0);
    // Features should be pairs (energy, zero-crossing)
    expect(features.length % 2).toBe(0);
  });

  it('returns empty for very short audio', () => {
    const features = extractFeatures(new Float32Array(10), 16000);
    expect(features.length).toBe(0);
  });

  it('produces different features for different audio', () => {
    const sampleRate = 16000;
    const silence = new Float32Array(sampleRate);
    const noise = new Float32Array(sampleRate);
    for (let i = 0; i < noise.length; i++) {
      noise[i] = Math.random() * 2 - 1;
    }

    const silenceFeatures = extractFeatures(silence, sampleRate);
    const noiseFeatures = extractFeatures(noise, sampleRate);

    // Noise should have higher energy than silence
    if (silenceFeatures.length > 0 && noiseFeatures.length > 0) {
      expect(noiseFeatures[0]).toBeGreaterThan(silenceFeatures[0]);
    }
  });
});

describe('dtwDistance', () => {
  it('returns 0 for identical sequences', () => {
    const seq = [1, 2, 3, 4, 5];
    expect(dtwDistance(seq, seq)).toBe(0);
  });

  it('returns small distance for similar sequences', () => {
    const seq1 = [1, 2, 3, 4, 5];
    const seq2 = [1.1, 2.1, 3.1, 4.1, 5.1];
    const dist = dtwDistance(seq1, seq2);
    expect(dist).toBeLessThan(1);
  });

  it('returns larger distance for different sequences', () => {
    const seq1 = [1, 2, 3, 4, 5];
    const seq2 = [10, 20, 30, 40, 50];
    const dist = dtwDistance(seq1, seq2);
    expect(dist).toBeGreaterThan(1);
  });

  it('handles different length sequences', () => {
    const seq1 = [1, 2, 3];
    const seq2 = [1, 2, 3, 4, 5];
    const dist = dtwDistance(seq1, seq2);
    expect(dist).toBeGreaterThanOrEqual(0);
  });

  it('returns Infinity for empty sequences', () => {
    expect(dtwDistance([], [1, 2, 3])).toBe(Infinity);
    expect(dtwDistance([1, 2, 3], [])).toBe(Infinity);
  });
});

describe('CustomWakeWordManager', () => {
  let manager: CustomWakeWordManager;

  beforeEach(() => {
    manager = new CustomWakeWordManager();
  });

  it('starts with built-in wake words', () => {
    const wakeWords = manager.getWakeWords();
    expect(wakeWords.length).toBe(4);
    expect(wakeWords[0].phrase).toBe('hey voxpilot');
    expect(wakeWords[0].builtIn).toBe(true);
  });

  it('getEnabledWakeWords returns only enabled', () => {
    const enabled = manager.getEnabledWakeWords();
    expect(enabled.length).toBe(1); // Only "hey voxpilot" is enabled by default
    expect(enabled[0].phrase).toBe('hey voxpilot');
  });

  it('enableWakeWord enables a wake word', () => {
    manager.enableWakeWord('hey vox');
    const enabled = manager.getEnabledWakeWords();
    expect(enabled.length).toBe(2);
  });

  it('disableWakeWord disables a wake word', () => {
    manager.disableWakeWord('hey voxpilot');
    const enabled = manager.getEnabledWakeWords();
    expect(enabled.length).toBe(0);
  });

  it('enableWakeWord returns false for unknown phrase', () => {
    expect(manager.enableWakeWord('nonexistent')).toBe(false);
  });

  it('setSensitivity updates sensitivity', () => {
    manager.setSensitivity('hey voxpilot', 0.8);
    const ww = manager.getWakeWords().find(w => w.phrase === 'hey voxpilot');
    expect(ww!.sensitivity).toBe(0.8);
  });

  it('setSensitivity clamps to 0-1 range', () => {
    manager.setSensitivity('hey voxpilot', 1.5);
    const ww = manager.getWakeWords().find(w => w.phrase === 'hey voxpilot');
    expect(ww!.sensitivity).toBe(1);

    manager.setSensitivity('hey voxpilot', -0.5);
    const ww2 = manager.getWakeWords().find(w => w.phrase === 'hey voxpilot');
    expect(ww2!.sensitivity).toBe(0);
  });

  it('startTraining creates a training session', () => {
    const session = manager.startTraining('hey assistant');
    expect(session.phrase).toBe('hey assistant');
    expect(session.active).toBe(true);
    expect(session.samplesCollected).toBe(0);
    expect(session.targetSamples).toBe(5);
  });

  it('addTrainingSample increments sample count', () => {
    manager.startTraining('hey assistant', 3);
    const audio = new Float32Array(16000); // 1s of silence
    for (let i = 0; i < audio.length; i++) audio[i] = Math.sin(i * 0.1);

    const session = manager.addTrainingSample(audio, 16000);
    expect(session!.samplesCollected).toBe(1);
  });

  it('training completes after target samples', () => {
    manager.startTraining('hey assistant', 2);
    const audio = new Float32Array(16000);
    for (let i = 0; i < audio.length; i++) audio[i] = Math.sin(i * 0.1);

    manager.addTrainingSample(audio, 16000);
    const session = manager.addTrainingSample(audio, 16000);
    expect(session!.active).toBe(false);

    // Should now be in the wake words list
    const ww = manager.getWakeWords().find(w => w.phrase === 'hey assistant');
    expect(ww).toBeDefined();
    expect(ww!.enabled).toBe(true);
    expect(ww!.sampleCount).toBe(2);
  });

  it('cancelTraining clears session', () => {
    manager.startTraining('hey assistant');
    manager.cancelTraining();
    expect(manager.getTrainingSession()).toBeNull();
  });

  it('deleteWakeWord removes custom wake words', () => {
    manager.startTraining('custom word', 1);
    const audio = new Float32Array(16000);
    for (let i = 0; i < audio.length; i++) audio[i] = Math.sin(i * 0.1);
    manager.addTrainingSample(audio, 16000);

    expect(manager.deleteWakeWord('custom word')).toBe(true);
    expect(manager.getWakeWords().find(w => w.phrase === 'custom word')).toBeUndefined();
  });

  it('deleteWakeWord cannot delete built-in wake words', () => {
    expect(manager.deleteWakeWord('hey voxpilot')).toBe(false);
  });

  it('onDetection registers callback', () => {
    let detected = false;
    const disposable = manager.onDetection(() => { detected = true; });
    expect(detected).toBe(false);
    disposable.dispose();
  });

  it('detect returns not detected for silence against untrained words', () => {
    const audio = new Float32Array(16000); // silence
    const result = manager.detect(audio, 16000);
    expect(result.detected).toBe(false);
  });
});
