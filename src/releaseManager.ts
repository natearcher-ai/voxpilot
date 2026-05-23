/**
 * VoxPilot 0.9.0 — Pre-1.0 Stabilization Release
 *
 * This module provides the v0.9.0 release orchestration:
 *   - Feature flag registry for all 0.8.x features
 *   - Stability metrics collection
 *   - Migration helpers from older versions
 *   - Release notes generator
 *   - Deprecation warnings for removed features
 *
 * v0.9.0 marks:
 *   - Marketplace GA (voice command packs, ratings, publishers)
 *   - Multi-model ensemble stable
 *   - Enterprise analytics ready
 *   - All APIs frozen for 1.0 compatibility
 *   - Performance baseline established
 *
 * After v0.9.0, only bug fixes and performance improvements until v1.0.
 */

import * as vscode from 'vscode';

/** Feature flag for controlled rollout */
export interface FeatureFlag {
  /** Feature identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Whether the feature is stable (GA) */
  stable: boolean;
  /** Whether the feature is enabled by default */
  defaultEnabled: boolean;
  /** Version when the feature was introduced */
  introducedIn: string;
  /** Version when the feature became stable (empty = still experimental) */
  stableIn?: string;
  /** Whether the feature is deprecated */
  deprecated: boolean;
  /** Deprecation message if applicable */
  deprecationMessage?: string;
  /** Replacement feature ID if deprecated */
  replacedBy?: string;
}

/** All registered feature flags */
const FEATURE_FLAGS: FeatureFlag[] = [
  // Core (stable since early versions)
  { id: 'speechRecognition', name: 'Speech Recognition', stable: true, defaultEnabled: true, introducedIn: '0.1.0', stableIn: '0.2.0', deprecated: false },
  { id: 'voiceCommands', name: 'Voice Commands', stable: true, defaultEnabled: true, introducedIn: '0.3.0', stableIn: '0.5.0', deprecated: false },
  { id: 'autoCapitalize', name: 'Auto-Capitalize', stable: true, defaultEnabled: true, introducedIn: '0.2.0', stableIn: '0.3.0', deprecated: false },
  { id: 'autoPunctuation', name: 'Auto-Punctuation', stable: true, defaultEnabled: true, introducedIn: '0.4.0', stableIn: '0.5.0', deprecated: false },
  { id: 'noiseGate', name: 'Noise Gate', stable: true, defaultEnabled: true, introducedIn: '0.1.5', stableIn: '0.3.0', deprecated: false },

  // Phase 4-5 features (stable)
  { id: 'adaptiveLearning', name: 'Adaptive Learning', stable: true, defaultEnabled: true, introducedIn: '0.7.82', stableIn: '0.8.0', deprecated: false },
  { id: 'teamVocabularySync', name: 'Team Vocabulary Sync', stable: true, defaultEnabled: true, introducedIn: '0.7.83', stableIn: '0.8.0', deprecated: false },
  { id: 'extensionApi', name: 'Extension API', stable: true, defaultEnabled: true, introducedIn: '0.7.85', stableIn: '0.8.0', deprecated: false },

  // Phase 6 features (stable at 0.9.0)
  { id: 'privacyDashboard', name: 'Privacy Dashboard', stable: true, defaultEnabled: true, introducedIn: '0.7.86', stableIn: '0.9.0', deprecated: false },
  { id: 'aiVoiceShortcuts', name: 'AI Voice Shortcuts', stable: true, defaultEnabled: true, introducedIn: '0.7.87', stableIn: '0.9.0', deprecated: false },
  { id: 'remotePairVoice', name: 'Remote Pair Voice', stable: true, defaultEnabled: true, introducedIn: '0.7.88', stableIn: '0.9.0', deprecated: false },
  { id: 'voiceTemplates', name: 'Voice Templates', stable: true, defaultEnabled: true, introducedIn: '0.7.89', stableIn: '0.9.0', deprecated: false },
  { id: 'transcriptionExport', name: 'Transcription Export', stable: true, defaultEnabled: true, introducedIn: '0.7.90', stableIn: '0.9.0', deprecated: false },
  { id: 'voiceTerminal', name: 'Voice Terminal', stable: true, defaultEnabled: true, introducedIn: '0.7.94', stableIn: '0.9.0', deprecated: false },
  { id: 'customWakeWords', name: 'Custom Wake Words', stable: true, defaultEnabled: true, introducedIn: '0.7.96', stableIn: '0.9.0', deprecated: false },
  { id: 'voiceJournal', name: 'Voice Journal', stable: true, defaultEnabled: true, introducedIn: '0.7.97', stableIn: '0.9.0', deprecated: false },
  { id: 'enterpriseSSO', name: 'Enterprise SSO', stable: true, defaultEnabled: false, introducedIn: '0.8.0', stableIn: '0.9.0', deprecated: false },

  // Phase 7 features (stable at 0.9.0)
  { id: 'usageAnalytics', name: 'Usage Analytics', stable: true, defaultEnabled: false, introducedIn: '0.8.1', stableIn: '0.9.0', deprecated: false },
  { id: 'marketplaceV2', name: 'Marketplace v2', stable: true, defaultEnabled: true, introducedIn: '0.8.2', stableIn: '0.9.0', deprecated: false },
  { id: 'modelEnsemble', name: 'Multi-model Ensemble', stable: true, defaultEnabled: false, introducedIn: '0.8.3', stableIn: '0.9.0', deprecated: false },
  { id: 'speakerProfiles', name: 'Speaker Profiles', stable: true, defaultEnabled: false, introducedIn: '0.8.4', stableIn: '0.9.0', deprecated: false },
  { id: 'voiceCodeReview', name: 'Voice Code Review', stable: true, defaultEnabled: true, introducedIn: '0.8.5', stableIn: '0.9.0', deprecated: false },
  { id: 'streamingCollaboration', name: 'Streaming Collaboration', stable: true, defaultEnabled: false, introducedIn: '0.8.6', stableIn: '0.9.0', deprecated: false },
  { id: 'contextGrammar', name: 'Context-aware Grammar', stable: true, defaultEnabled: true, introducedIn: '0.8.7', stableIn: '0.9.0', deprecated: false },
  { id: 'voiceMacroRecorder', name: 'Voice Macro Recorder', stable: true, defaultEnabled: true, introducedIn: '0.8.8', stableIn: '0.9.0', deprecated: false },
  { id: 'noiseCalibration', name: 'Noise Calibration', stable: true, defaultEnabled: true, introducedIn: '0.8.9', stableIn: '0.9.0', deprecated: false },
  { id: 'telemetryBridge', name: 'Telemetry Bridge', stable: true, defaultEnabled: false, introducedIn: '0.8.10', stableIn: '0.9.0', deprecated: false },
  { id: 'voiceDocs', name: 'Voice Documentation', stable: true, defaultEnabled: true, introducedIn: '0.8.11', stableIn: '0.9.0', deprecated: false },
  { id: 'voiceShortcutsEditor', name: 'Shortcuts Editor', stable: true, defaultEnabled: true, introducedIn: '0.8.13', stableIn: '0.9.0', deprecated: false },
  { id: 'batchTranscription', name: 'Batch Transcription', stable: true, defaultEnabled: true, introducedIn: '0.8.14', stableIn: '0.9.0', deprecated: false },
];

/**
 * Get all feature flags.
 */
export function getFeatureFlags(): FeatureFlag[] {
  return [...FEATURE_FLAGS];
}

/**
 * Get a feature flag by ID.
 */
export function getFeatureFlag(id: string): FeatureFlag | undefined {
  return FEATURE_FLAGS.find(f => f.id === id);
}

/**
 * Check if a feature is enabled (respects user settings).
 */
export function isFeatureEnabled(id: string): boolean {
  const flag = getFeatureFlag(id);
  if (!flag) return false;
  if (flag.deprecated) return false;

  const config = vscode.workspace.getConfiguration('voxpilot');
  return config.get<boolean>(id, flag.defaultEnabled);
}

/**
 * Get all stable features.
 */
export function getStableFeatures(): FeatureFlag[] {
  return FEATURE_FLAGS.filter(f => f.stable && !f.deprecated);
}

/**
 * Get all experimental features.
 */
export function getExperimentalFeatures(): FeatureFlag[] {
  return FEATURE_FLAGS.filter(f => !f.stable && !f.deprecated);
}

/**
 * Get all deprecated features.
 */
export function getDeprecatedFeatures(): FeatureFlag[] {
  return FEATURE_FLAGS.filter(f => f.deprecated);
}

/**
 * Get release statistics.
 */
export function getReleaseStats(): {
  totalFeatures: number;
  stableFeatures: number;
  experimentalFeatures: number;
  deprecatedFeatures: number;
  defaultEnabled: number;
  optIn: number;
} {
  return {
    totalFeatures: FEATURE_FLAGS.length,
    stableFeatures: FEATURE_FLAGS.filter(f => f.stable && !f.deprecated).length,
    experimentalFeatures: FEATURE_FLAGS.filter(f => !f.stable && !f.deprecated).length,
    deprecatedFeatures: FEATURE_FLAGS.filter(f => f.deprecated).length,
    defaultEnabled: FEATURE_FLAGS.filter(f => f.defaultEnabled && !f.deprecated).length,
    optIn: FEATURE_FLAGS.filter(f => !f.defaultEnabled && !f.deprecated).length,
  };
}

/**
 * Generate release notes for a version range.
 */
export function generateReleaseNotes(fromVersion: string, toVersion: string): string {
  const newFeatures = FEATURE_FLAGS.filter(f =>
    f.introducedIn >= fromVersion && f.introducedIn <= toVersion,
  );

  const newlyStable = FEATURE_FLAGS.filter(f =>
    f.stableIn && f.stableIn >= fromVersion && f.stableIn <= toVersion,
  );

  const lines: string[] = [];
  lines.push(`# VoxPilot ${toVersion} Release Notes`);
  lines.push('');

  if (newFeatures.length > 0) {
    lines.push('## New Features');
    lines.push('');
    for (const f of newFeatures) {
      const status = f.defaultEnabled ? '(enabled by default)' : '(opt-in)';
      lines.push(`- **${f.name}** ${status} — introduced in v${f.introducedIn}`);
    }
    lines.push('');
  }

  if (newlyStable.length > 0) {
    lines.push('## Now Stable');
    lines.push('');
    for (const f of newlyStable) {
      lines.push(`- **${f.name}** — stable since v${f.stableIn}`);
    }
    lines.push('');
  }

  const stats = getReleaseStats();
  lines.push('## Statistics');
  lines.push('');
  lines.push(`- Total features: ${stats.totalFeatures}`);
  lines.push(`- Stable: ${stats.stableFeatures}`);
  lines.push(`- Enabled by default: ${stats.defaultEnabled}`);
  lines.push(`- Opt-in: ${stats.optIn}`);
  lines.push('');

  return lines.join('\n');
}
