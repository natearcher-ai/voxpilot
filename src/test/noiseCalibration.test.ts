import { describe, it, expect, beforeEach } from 'vitest';
import { NoiseCalibrationManager, analyzeNoiseSample, classifyEnvironment, generateRecommendations } from '../noiseCalibration';

describe('analyzeNoiseSample', () => {
  it('returns zeros for empty audio', () => {
    const result = analyzeNoiseSample(new Float32Array(0), 16000);
    expect(result.rmsLevel).toBe(0);
    expect(result.peakLevel).toBe(0);
    expect(result.hasPeriodicity).toBe(false);
  });

  it('detects silence correctly', () => {
    const silence = new Float32Array(16000); // 1 second of silence
    const result = analyzeNoiseSample(silence, 16000);
    expect(result.rmsLevel).toBe(0);
    expect(result.peakLevel).toBe(0);
    expect(result.estimatedSnr).toBe(60);
  });

  it('detects noise level from random signal', () => {
    const noise = new Float32Array(16000);
    for (let i = 0; i < noise.length; i++) {
      noise[i] = (Math.random() - 0.5) * 0.1; // Low-level noise
    }
    const result = analyzeNoiseSample(noise, 16000);
    expect(result.rmsLevel).toBeGreaterThan(0);
    expect(result.rmsLevel).toBeLessThan(0.1);
    expect(result.peakLevel).toBeGreaterThan(0);
  });

  it('detects periodic signal', () => {
    const sampleRate = 16000;
    const audio = new Float32Array(sampleRate * 2); // 2 seconds
    // Generate 100 Hz sine wave (common fan hum)
    for (let i = 0; i < audio.length; i++) {
      audio[i] = 0.05 * Math.sin(2 * Math.PI * 100 * i / sampleRate);
    }
    const result = analyzeNoiseSample(audio, sampleRate);
    expect(result.hasPeriodicity).toBe(true);
    if (result.dominantFrequency) {
      expect(result.dominantFrequency).toBeGreaterThan(80);
      expect(result.dominantFrequency).toBeLessThan(120);
    }
  });

  it('computes zero-crossing rate', () => {
    const sampleRate = 16000;
    const audio = new Float32Array(sampleRate);
    // High-frequency signal has more zero crossings
    for (let i = 0; i < audio.length; i++) {
      audio[i] = 0.1 * Math.sin(2 * Math.PI * 4000 * i / sampleRate);
    }
    const result = analyzeNoiseSample(audio, sampleRate);
    expect(result.zeroCrossingRate).toBeGreaterThan(0.3);
  });
});

describe('classifyEnvironment', () => {
  it('classifies quiet environment', () => {
    expect(classifyEnvironment(0.001)).toBe('quiet');
    expect(classifyEnvironment(0.004)).toBe('quiet');
  });

  it('classifies moderate environment', () => {
    expect(classifyEnvironment(0.01)).toBe('moderate');
    expect(classifyEnvironment(0.015)).toBe('moderate');
  });

  it('classifies noisy environment', () => {
    expect(classifyEnvironment(0.03)).toBe('noisy');
    expect(classifyEnvironment(0.04)).toBe('noisy');
  });

  it('classifies very noisy environment', () => {
    expect(classifyEnvironment(0.06)).toBe('very-noisy');
    expect(classifyEnvironment(0.1)).toBe('very-noisy');
  });
});

describe('generateRecommendations', () => {
  it('recommends low sensitivity for quiet environments', () => {
    const recs = generateRecommendations({
      rmsLevel: 0.003,
      peakLevel: 0.01,
      zeroCrossingRate: 0.1,
      spectralCentroid: 500,
      hasPeriodicity: false,
      estimatedSnr: 50,
    });
    expect(recs.vadSensitivity).toBeLessThan(0.5);
    expect(recs.neuralDenoise).toBe(false);
    expect(recs.model).toBe('moonshine-base');
  });

  it('recommends neural denoise for moderate noise', () => {
    const recs = generateRecommendations({
      rmsLevel: 0.025,
      peakLevel: 0.1,
      zeroCrossingRate: 0.2,
      spectralCentroid: 1000,
      hasPeriodicity: false,
      estimatedSnr: 30,
    });
    expect(recs.neuralDenoise).toBe(true);
    expect(recs.vadSensitivity).toBeGreaterThanOrEqual(0.5);
  });

  it('recommends whisper for noisy environments', () => {
    const recs = generateRecommendations({
      rmsLevel: 0.04,
      peakLevel: 0.3,
      zeroCrossingRate: 0.3,
      spectralCentroid: 2000,
      hasPeriodicity: false,
      estimatedSnr: 20,
    });
    expect(recs.model).toBe('whisper-small');
    expect(recs.tips.length).toBeGreaterThan(0);
  });

  it('adds tip for periodic noise', () => {
    const recs = generateRecommendations({
      rmsLevel: 0.02,
      peakLevel: 0.05,
      zeroCrossingRate: 0.15,
      spectralCentroid: 800,
      hasPeriodicity: true,
      dominantFrequency: 120,
      estimatedSnr: 35,
    });
    expect(recs.tips.some(t => t.includes('Periodic'))).toBe(true);
  });

  it('adds tip for high-frequency noise', () => {
    const recs = generateRecommendations({
      rmsLevel: 0.01,
      peakLevel: 0.05,
      zeroCrossingRate: 0.5,
      spectralCentroid: 4000,
      hasPeriodicity: false,
      estimatedSnr: 40,
    });
    expect(recs.tips.some(t => t.includes('High-frequency'))).toBe(true);
  });

  it('gate threshold scales with ambient level', () => {
    const quiet = generateRecommendations({ rmsLevel: 0.005, peakLevel: 0.01, zeroCrossingRate: 0.1, spectralCentroid: 500, hasPeriodicity: false, estimatedSnr: 45 });
    const noisy = generateRecommendations({ rmsLevel: 0.03, peakLevel: 0.1, zeroCrossingRate: 0.2, spectralCentroid: 1000, hasPeriodicity: false, estimatedSnr: 30 });
    expect(noisy.gateThreshold).toBeGreaterThan(quiet.gateThreshold);
  });
});

describe('NoiseCalibrationManager', () => {
  let manager: NoiseCalibrationManager;

  beforeEach(() => {
    manager = new NoiseCalibrationManager();
  });

  it('starts with no profiles', () => {
    expect(manager.count).toBe(0);
    expect(manager.getProfiles()).toHaveLength(0);
    expect(manager.getActiveProfile()).toBeUndefined();
  });

  it('calibrate creates a profile from audio', () => {
    const sampleRate = 16000;
    const audio = new Float32Array(sampleRate * 2); // 2 seconds
    for (let i = 0; i < audio.length; i++) {
      audio[i] = (Math.random() - 0.5) * 0.02; // Low noise
    }

    const result = manager.calibrate(audio, sampleRate, 'Home Office');
    expect(result.success).toBe(true);
    expect(result.profile).toBeDefined();
    expect(result.profile!.name).toBe('Home Office');
    expect(result.profile!.active).toBe(true);
    expect(manager.count).toBe(1);
  });

  it('calibrate fails for short audio', () => {
    const audio = new Float32Array(100); // Too short
    const result = manager.calibrate(audio, 16000, 'Test');
    expect(result.success).toBe(false);
    expect(result.error).toContain('too short');
  });

  it('calibrate deactivates previous profile', () => {
    const sampleRate = 16000;
    const audio = new Float32Array(sampleRate * 2);

    manager.calibrate(audio, sampleRate, 'First');
    manager.calibrate(audio, sampleRate, 'Second');

    const profiles = manager.getProfiles();
    const activeCount = profiles.filter(p => p.active).length;
    expect(activeCount).toBe(1);
    expect(manager.getActiveProfile()!.name).toBe('Second');
  });

  it('activateProfile switches active profile', () => {
    const sampleRate = 16000;
    const audio = new Float32Array(sampleRate * 2);

    const r1 = manager.calibrate(audio, sampleRate, 'First');
    manager.calibrate(audio, sampleRate, 'Second');

    manager.activateProfile(r1.profile!.id);
    expect(manager.getActiveProfile()!.name).toBe('First');
  });

  it('activateProfile returns false for unknown id', () => {
    expect(manager.activateProfile('nonexistent')).toBe(false);
  });

  it('deleteProfile removes profile', () => {
    const sampleRate = 16000;
    const audio = new Float32Array(sampleRate * 2);
    const result = manager.calibrate(audio, sampleRate, 'Test');

    expect(manager.deleteProfile(result.profile!.id)).toBe(true);
    expect(manager.count).toBe(0);
  });

  it('deleteProfile returns false for unknown id', () => {
    expect(manager.deleteProfile('nonexistent')).toBe(false);
  });

  it('renameProfile updates name', () => {
    const sampleRate = 16000;
    const audio = new Float32Array(sampleRate * 2);
    const result = manager.calibrate(audio, sampleRate, 'Old Name');

    expect(manager.renameProfile(result.profile!.id, 'New Name')).toBe(true);
    expect(manager.getActiveProfile()!.name).toBe('New Name');
  });

  it('renameProfile returns false for unknown id', () => {
    expect(manager.renameProfile('nonexistent', 'Name')).toBe(false);
  });

  it('calibration provides recommendations', () => {
    const sampleRate = 16000;
    const audio = new Float32Array(sampleRate * 2);
    // Generate noisy signal
    for (let i = 0; i < audio.length; i++) {
      audio[i] = (Math.random() - 0.5) * 0.08;
    }

    const result = manager.calibrate(audio, sampleRate, 'Noisy Room');
    expect(result.success).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.profile!.recommendNeuralDenoise).toBe(true);
  });
});
