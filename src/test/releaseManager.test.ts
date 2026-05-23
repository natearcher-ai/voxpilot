import { describe, it, expect } from 'vitest';
import { getFeatureFlags, getFeatureFlag, getStableFeatures, getDeprecatedFeatures, getReleaseStats, generateReleaseNotes } from '../releaseManager';

describe('releaseManager', () => {
  it('getFeatureFlags returns all flags', () => {
    const flags = getFeatureFlags();
    expect(flags.length).toBeGreaterThan(25);
  });

  it('getFeatureFlag finds by id', () => {
    const flag = getFeatureFlag('speechRecognition');
    expect(flag).toBeDefined();
    expect(flag!.name).toBe('Speech Recognition');
    expect(flag!.stable).toBe(true);
  });

  it('getFeatureFlag returns undefined for unknown', () => {
    expect(getFeatureFlag('nonexistent')).toBeUndefined();
  });

  it('getStableFeatures returns only stable non-deprecated', () => {
    const stable = getStableFeatures();
    expect(stable.length).toBeGreaterThan(20);
    expect(stable.every(f => f.stable && !f.deprecated)).toBe(true);
  });

  it('getDeprecatedFeatures returns empty (none deprecated yet)', () => {
    const deprecated = getDeprecatedFeatures();
    expect(deprecated).toHaveLength(0);
  });

  it('getReleaseStats returns correct counts', () => {
    const stats = getReleaseStats();
    expect(stats.totalFeatures).toBeGreaterThan(25);
    expect(stats.stableFeatures).toBeGreaterThan(20);
    expect(stats.deprecatedFeatures).toBe(0);
    expect(stats.defaultEnabled + stats.optIn).toBe(stats.totalFeatures);
  });

  it('generateReleaseNotes produces markdown', () => {
    const notes = generateReleaseNotes('0.8.0', '0.9.0');
    expect(notes).toContain('# VoxPilot 0.9.0 Release Notes');
    expect(notes).toContain('## New Features');
    expect(notes).toContain('## Statistics');
  });

  it('generateReleaseNotes includes features in range', () => {
    const notes = generateReleaseNotes('0.8.0', '0.8.14');
    expect(notes).toContain('Usage Analytics');
    expect(notes).toContain('Batch Transcription');
  });

  it('all flags have required fields', () => {
    const flags = getFeatureFlags();
    for (const flag of flags) {
      expect(flag.id).toBeTruthy();
      expect(flag.name).toBeTruthy();
      expect(flag.introducedIn).toBeTruthy();
      expect(typeof flag.stable).toBe('boolean');
      expect(typeof flag.defaultEnabled).toBe('boolean');
      expect(typeof flag.deprecated).toBe('boolean');
    }
  });

  it('opt-in features are not enabled by default', () => {
    const flags = getFeatureFlags();
    const optIn = flags.filter(f => !f.defaultEnabled && !f.deprecated);
    // Enterprise SSO, analytics, ensemble, speaker profiles, streaming, telemetry should be opt-in
    expect(optIn.some(f => f.id === 'enterpriseSSO')).toBe(true);
    expect(optIn.some(f => f.id === 'usageAnalytics')).toBe(true);
    expect(optIn.some(f => f.id === 'telemetryBridge')).toBe(true);
  });
});
