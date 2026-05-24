/**
 * Settings Migration — auto-migrate deprecated settings with backward compatibility.
 *
 * Handles version-to-version settings changes:
 *   - Detects outdated settings from previous versions
 *   - Auto-migrates to new setting names/formats
 *   - Preserves user intent during migration
 *   - Logs all migrations for transparency
 *   - Provides rollback capability
 *   - Shows migration summary to user on first run after update
 *
 * Migration rules are versioned and run in order.
 * Enable via `voxpilot.settingsMigration.enabled` setting (default: true).
 */

import * as vscode from 'vscode';

/** A single migration rule */
export interface MigrationRule {
  /** Rule ID (unique) */
  id: string;
  /** Version this migration applies from */
  fromVersion: string;
  /** Version this migration applies to */
  toVersion: string;
  /** Description of what changed */
  description: string;
  /** Old setting key */
  oldKey: string;
  /** New setting key (empty = setting removed) */
  newKey: string;
  /** Value transformer (null = direct copy) */
  transform?: (oldValue: unknown) => unknown;
  /** Whether this is a breaking change */
  breaking: boolean;
}

/** Migration result for a single rule */
export interface MigrationResult {
  /** Rule that was applied */
  ruleId: string;
  /** Whether migration was successful */
  success: boolean;
  /** Old value */
  oldValue: unknown;
  /** New value */
  newValue: unknown;
  /** Error if failed */
  error?: string;
  /** Timestamp */
  timestamp: number;
}

/** Migration session summary */
export interface MigrationSummary {
  /** Version migrated from */
  fromVersion: string;
  /** Version migrated to */
  toVersion: string;
  /** Total rules evaluated */
  rulesEvaluated: number;
  /** Rules that were applied */
  rulesApplied: number;
  /** Rules that failed */
  rulesFailed: number;
  /** Individual results */
  results: MigrationResult[];
  /** Timestamp */
  timestamp: number;
}

/** Built-in migration rules */
const MIGRATION_RULES: MigrationRule[] = [
  // 0.7.x → 0.8.x migrations
  {
    id: 'mic-sensitivity-to-vad',
    fromVersion: '0.7.0',
    toVersion: '0.8.0',
    description: 'Renamed micSensitivity to vadSensitivity',
    oldKey: 'voxpilot.micSensitivity',
    newKey: 'voxpilot.vadSensitivity',
    breaking: false,
  },
  {
    id: 'auto-send-to-delivery-target',
    fromVersion: '0.7.0',
    toVersion: '0.8.0',
    description: 'Renamed autoSend to deliveryTarget',
    oldKey: 'voxpilot.autoSend',
    newKey: 'voxpilot.deliveryTarget',
    transform: (old) => old === true ? 'chat' : old === false ? 'ask' : old,
    breaking: false,
  },
  {
    id: 'noise-threshold-to-gate',
    fromVersion: '0.7.0',
    toVersion: '0.8.0',
    description: 'Renamed noiseThreshold to noiseGate.threshold',
    oldKey: 'voxpilot.noiseThreshold',
    newKey: 'voxpilot.noiseGate.threshold',
    breaking: false,
  },
  // 0.8.x → 0.9.x migrations
  {
    id: 'model-to-preferredModel',
    fromVersion: '0.8.0',
    toVersion: '0.9.0',
    description: 'Renamed model to preferredModel for clarity',
    oldKey: 'voxpilot.model',
    newKey: 'voxpilot.preferredModel',
    breaking: false,
  },
  {
    id: 'silence-timeout-ms',
    fromVersion: '0.8.0',
    toVersion: '0.9.0',
    description: 'Changed silenceTimeout from seconds to milliseconds',
    oldKey: 'voxpilot.silenceTimeout',
    newKey: 'voxpilot.silenceTimeoutMs',
    transform: (old) => typeof old === 'number' ? old * 1000 : old,
    breaking: true,
  },
  {
    id: 'custom-commands-format',
    fromVersion: '0.8.0',
    toVersion: '0.9.0',
    description: 'Custom voice commands moved to new format with action types',
    oldKey: 'voxpilot.customCommands',
    newKey: 'voxpilot.customVoiceCommands',
    transform: (old) => {
      if (!Array.isArray(old)) return old;
      return old.map((cmd: Record<string, unknown>) => ({
        phrase: cmd.phrase || cmd.trigger,
        action: cmd.command ? 'command' : 'insert',
        text: cmd.text || cmd.replacement,
        command: cmd.command,
        description: cmd.description || '',
      }));
    },
    breaking: true,
  },
];

/**
 * Compare semantic versions (simplified).
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Get applicable migration rules for a version upgrade.
 */
export function getApplicableRules(fromVersion: string, toVersion: string): MigrationRule[] {
  return MIGRATION_RULES.filter(rule =>
    compareVersions(rule.fromVersion, fromVersion) <= 0 &&
    compareVersions(rule.toVersion, toVersion) <= 0 &&
    compareVersions(rule.toVersion, fromVersion) > 0,
  );
}

/**
 * Settings Migration manager.
 */
export class SettingsMigrationManager {
  private history: MigrationSummary[] = [];
  private context: vscode.ExtensionContext | undefined;

  /** Initialize with extension context */
  init(extensionContext: vscode.ExtensionContext): void {
    this.context = extensionContext;
    this.loadHistory();
  }

  /**
   * Run migrations for a version upgrade.
   */
  migrate(fromVersion: string, toVersion: string): MigrationSummary {
    const rules = getApplicableRules(fromVersion, toVersion);
    const results: MigrationResult[] = [];
    const config = vscode.workspace.getConfiguration();

    for (const rule of rules) {
      const result = this.applyRule(rule, config);
      results.push(result);
    }

    const summary: MigrationSummary = {
      fromVersion,
      toVersion,
      rulesEvaluated: rules.length,
      rulesApplied: results.filter(r => r.success && r.oldValue !== undefined).length,
      rulesFailed: results.filter(r => !r.success).length,
      results,
      timestamp: Date.now(),
    };

    this.history.push(summary);
    this.saveHistory();
    return summary;
  }

  /**
   * Check if migrations are needed (without applying them).
   */
  checkNeeded(fromVersion: string, toVersion: string): { needed: boolean; rules: MigrationRule[] } {
    const rules = getApplicableRules(fromVersion, toVersion);
    const config = vscode.workspace.getConfiguration();

    const needed = rules.filter(rule => {
      const oldValue = config.get(rule.oldKey.replace('voxpilot.', ''));
      return oldValue !== undefined;
    });

    return { needed: needed.length > 0, rules: needed };
  }

  /** Get migration history */
  getHistory(): MigrationSummary[] {
    return [...this.history];
  }

  /** Get last migration summary */
  getLastMigration(): MigrationSummary | undefined {
    return this.history[this.history.length - 1];
  }

  /** Clear migration history */
  clearHistory(): void {
    this.history = [];
    this.saveHistory();
  }

  /** Get all registered migration rules */
  getRules(): MigrationRule[] {
    return [...MIGRATION_RULES];
  }

  /** Get rule count */
  get ruleCount(): number {
    return MIGRATION_RULES.length;
  }

  /** Get history count */
  get historyCount(): number {
    return this.history.length;
  }

  private applyRule(rule: MigrationRule, config: vscode.WorkspaceConfiguration): MigrationResult {
    try {
      const oldKey = rule.oldKey.replace('voxpilot.', '');
      const oldValue = config.get(oldKey);

      // If old setting doesn't exist, nothing to migrate
      if (oldValue === undefined) {
        return {
          ruleId: rule.id,
          success: true,
          oldValue: undefined,
          newValue: undefined,
          timestamp: Date.now(),
        };
      }

      // Transform value if needed
      const newValue = rule.transform ? rule.transform(oldValue) : oldValue;

      // Apply new setting
      if (rule.newKey) {
        const newKey = rule.newKey.replace('voxpilot.', '');
        config.update(newKey, newValue, vscode.ConfigurationTarget.Global);
      }

      // Remove old setting
      config.update(oldKey, undefined, vscode.ConfigurationTarget.Global);

      return {
        ruleId: rule.id,
        success: true,
        oldValue,
        newValue,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        ruleId: rule.id,
        success: false,
        oldValue: undefined,
        newValue: undefined,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
    }
  }

  private loadHistory(): void {
    if (!this.context) return;
    const saved = this.context.globalState.get<MigrationSummary[]>('settingsMigrations');
    if (saved) this.history = saved;
  }

  private saveHistory(): void {
    if (!this.context) return;
    this.context.globalState.update('settingsMigrations', this.history);
  }
}

/** Singleton instance */
export const settingsMigration = new SettingsMigrationManager();
