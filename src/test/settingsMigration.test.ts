import { describe, it, expect, beforeEach } from 'vitest';
import { SettingsMigrationManager, compareVersions, getApplicableRules } from '../settingsMigration';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.9.5', '0.9.5')).toBe(0);
  });

  it('returns 1 when a > b', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.9.1', '0.9.0')).toBe(1);
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
  });

  it('returns -1 when a < b', () => {
    expect(compareVersions('0.8.0', '0.9.0')).toBe(-1);
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
    expect(compareVersions('0.9.9', '0.9.10')).toBe(-1);
  });

  it('handles different length versions', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
  });
});

describe('getApplicableRules', () => {
  it('returns rules for 0.7 to 0.8 upgrade', () => {
    const rules = getApplicableRules('0.7.0', '0.8.0');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some(r => r.id === 'mic-sensitivity-to-vad')).toBe(true);
  });

  it('returns rules for 0.8 to 0.9 upgrade', () => {
    const rules = getApplicableRules('0.8.0', '0.9.0');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some(r => r.id === 'model-to-preferredModel')).toBe(true);
  });

  it('returns all rules for 0.7 to 0.9 upgrade', () => {
    const rules = getApplicableRules('0.7.0', '0.9.0');
    expect(rules.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty for same version', () => {
    const rules = getApplicableRules('0.9.0', '0.9.0');
    expect(rules).toHaveLength(0);
  });

  it('returns empty for downgrade', () => {
    const rules = getApplicableRules('0.9.0', '0.8.0');
    expect(rules).toHaveLength(0);
  });
});

describe('SettingsMigrationManager', () => {
  let manager: SettingsMigrationManager;

  beforeEach(() => {
    manager = new SettingsMigrationManager();
  });

  it('starts with no history', () => {
    expect(manager.historyCount).toBe(0);
    expect(manager.getHistory()).toHaveLength(0);
    expect(manager.getLastMigration()).toBeUndefined();
  });

  it('ruleCount returns total rules', () => {
    expect(manager.ruleCount).toBeGreaterThan(4);
  });

  it('getRules returns all rules', () => {
    const rules = manager.getRules();
    expect(rules.length).toBe(manager.ruleCount);
    expect(rules.every(r => r.id && r.oldKey && r.description)).toBe(true);
  });

  it('migrate creates a summary', () => {
    const summary = manager.migrate('0.7.0', '0.8.0');
    expect(summary.fromVersion).toBe('0.7.0');
    expect(summary.toVersion).toBe('0.8.0');
    expect(summary.rulesEvaluated).toBeGreaterThan(0);
    expect(summary.timestamp).toBeGreaterThan(0);
    expect(summary.results).toBeInstanceOf(Array);
  });

  it('migrate adds to history', () => {
    manager.migrate('0.7.0', '0.8.0');
    expect(manager.historyCount).toBe(1);
    expect(manager.getLastMigration()?.fromVersion).toBe('0.7.0');
  });

  it('migrate handles no applicable rules', () => {
    const summary = manager.migrate('0.9.0', '0.9.0');
    expect(summary.rulesEvaluated).toBe(0);
    expect(summary.rulesApplied).toBe(0);
  });

  it('checkNeeded reports if migrations exist', () => {
    const { needed, rules } = manager.checkNeeded('0.7.0', '0.9.0');
    // In test env, no old settings exist, so needed should be false
    expect(typeof needed).toBe('boolean');
    expect(rules).toBeInstanceOf(Array);
  });

  it('clearHistory removes all history', () => {
    manager.migrate('0.7.0', '0.8.0');
    manager.migrate('0.8.0', '0.9.0');
    expect(manager.historyCount).toBe(2);

    manager.clearHistory();
    expect(manager.historyCount).toBe(0);
  });

  it('migration rules have valid version ranges', () => {
    const rules = manager.getRules();
    for (const rule of rules) {
      expect(compareVersions(rule.fromVersion, rule.toVersion)).toBeLessThan(0);
    }
  });

  it('migration rules have unique IDs', () => {
    const rules = manager.getRules();
    const ids = rules.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('transform functions work correctly', () => {
    const rules = manager.getRules();

    // Test silence timeout transform (seconds → ms)
    const silenceRule = rules.find(r => r.id === 'silence-timeout-ms');
    expect(silenceRule?.transform?.(5)).toBe(5000);
    expect(silenceRule?.transform?.(10)).toBe(10000);

    // Test autoSend transform
    const autoSendRule = rules.find(r => r.id === 'auto-send-to-delivery-target');
    expect(autoSendRule?.transform?.(true)).toBe('chat');
    expect(autoSendRule?.transform?.(false)).toBe('ask');
  });

  it('custom commands transform works', () => {
    const rules = manager.getRules();
    const cmdRule = rules.find(r => r.id === 'custom-commands-format');

    const oldFormat = [
      { trigger: 'deploy', command: 'myext.deploy', description: 'Deploy' },
      { phrase: 'hello', replacement: 'Hi there' },
    ];

    const result = cmdRule?.transform?.(oldFormat) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(2);
    expect(result[0].phrase).toBe('deploy');
    expect(result[0].action).toBe('command');
    expect(result[1].phrase).toBe('hello');
    expect(result[1].action).toBe('insert');
    expect(result[1].text).toBe('Hi there');
  });
});
