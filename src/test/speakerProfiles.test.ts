import { describe, it, expect, beforeEach } from 'vitest';
import { SpeakerProfileManager, createProfile } from '../speakerProfiles';

describe('createProfile', () => {
  it('creates profile with name and defaults', () => {
    const profile = createProfile('Alice');
    expect(profile.name).toBe('Alice');
    expect(profile.preferredModel).toBe('moonshine-base');
    expect(profile.language).toBe('en');
    expect(profile.defaultMode).toBe('code');
    expect(profile.vocabulary).toHaveLength(0);
    expect(profile.customCommands).toHaveLength(0);
    expect(profile.createdAt).toBeGreaterThan(0);
  });

  it('uses provided id', () => {
    const profile = createProfile('Bob', 'custom-id');
    expect(profile.id).toBe('custom-id');
  });

  it('generates unique id when not provided', () => {
    const p1 = createProfile('A');
    const p2 = createProfile('B');
    expect(p1.id).not.toBe(p2.id);
  });
});

describe('SpeakerProfileManager', () => {
  let manager: SpeakerProfileManager;

  beforeEach(() => {
    manager = new SpeakerProfileManager();
  });

  it('starts with default profile', () => {
    expect(manager.count).toBe(1);
    expect(manager.getActiveProfileId()).toBe('default');
    expect(manager.getActiveProfile()?.name).toBe('Default');
  });

  it('createProfile adds a new profile', () => {
    const profile = manager.createProfile('Alice');
    expect(profile.name).toBe('Alice');
    expect(manager.count).toBe(2);
  });

  it('getProfile returns profile by id', () => {
    const created = manager.createProfile('Bob');
    const fetched = manager.getProfile(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.name).toBe('Bob');
  });

  it('getProfile returns undefined for unknown id', () => {
    expect(manager.getProfile('nonexistent')).toBeUndefined();
  });

  it('getProfiles returns all profiles', () => {
    manager.createProfile('Alice');
    manager.createProfile('Bob');
    expect(manager.getProfiles()).toHaveLength(3); // default + 2
  });

  it('updateProfile modifies profile fields', () => {
    manager.updateProfile('default', { preferredModel: 'whisper-small', language: 'fr' });
    const profile = manager.getProfile('default');
    expect(profile!.preferredModel).toBe('whisper-small');
    expect(profile!.language).toBe('fr');
  });

  it('updateProfile returns false for unknown id', () => {
    expect(manager.updateProfile('nonexistent', { name: 'X' })).toBe(false);
  });

  it('deleteProfile removes profile', () => {
    const profile = manager.createProfile('Temp');
    expect(manager.count).toBe(2);
    expect(manager.deleteProfile(profile.id)).toBe(true);
    expect(manager.count).toBe(1);
  });

  it('deleteProfile cannot remove default', () => {
    expect(manager.deleteProfile('default')).toBe(false);
    expect(manager.count).toBe(1);
  });

  it('deleteProfile returns false for unknown id', () => {
    expect(manager.deleteProfile('nonexistent')).toBe(false);
  });

  it('deleteProfile switches to default if active was deleted', () => {
    const profile = manager.createProfile('Temp');
    manager.switchTo(profile.id);
    expect(manager.getActiveProfileId()).toBe(profile.id);

    manager.deleteProfile(profile.id);
    expect(manager.getActiveProfileId()).toBe('default');
  });

  it('switchTo changes active profile', () => {
    const profile = manager.createProfile('Alice');
    expect(manager.switchTo(profile.id)).toBe(true);
    expect(manager.getActiveProfileId()).toBe(profile.id);
  });

  it('switchTo returns false for unknown id', () => {
    expect(manager.switchTo('nonexistent')).toBe(false);
  });

  it('switchTo increments usage count', () => {
    const profile = manager.createProfile('Alice');
    manager.switchTo(profile.id);
    manager.switchTo(profile.id);
    expect(manager.getProfile(profile.id)!.usageCount).toBe(2);
  });

  it('switchToByName finds profile case-insensitively', () => {
    manager.createProfile('Alice');
    expect(manager.switchToByName('alice')).toBe(true);
    expect(manager.getActiveProfile()?.name).toBe('Alice');
  });

  it('switchToByName returns false for unknown name', () => {
    expect(manager.switchToByName('Unknown Person')).toBe(false);
  });

  it('onSwitch fires callback', () => {
    let switchEvent: any = null;
    manager.onSwitch((event) => { switchEvent = event; });

    const profile = manager.createProfile('Bob');
    manager.switchTo(profile.id);

    expect(switchEvent).not.toBeNull();
    expect(switchEvent.from).toBe('default');
    expect(switchEvent.to).toBe(profile.id);
    expect(switchEvent.method).toBe('manual');
  });

  it('onSwitch dispose removes callback', () => {
    let count = 0;
    const disposable = manager.onSwitch(() => { count++; });

    const profile = manager.createProfile('Bob');
    manager.switchTo(profile.id);
    expect(count).toBe(1);

    disposable.dispose();
    manager.switchTo('default');
    expect(count).toBe(1); // Not incremented
  });

  it('addVocabulary adds words to active profile', () => {
    manager.addVocabulary(['useState', 'useEffect', 'React']);
    const profile = manager.getActiveProfile();
    expect(profile!.vocabulary).toContain('useState');
    expect(profile!.vocabulary).toContain('useEffect');
    expect(profile!.vocabulary).toHaveLength(3);
  });

  it('addVocabulary deduplicates', () => {
    manager.addVocabulary(['React', 'Vue']);
    manager.addVocabulary(['React', 'Angular']);
    const profile = manager.getActiveProfile();
    expect(profile!.vocabulary).toHaveLength(3); // React, Vue, Angular
  });

  it('addCommand adds to active profile', () => {
    expect(manager.addCommand('deploy', 'command', 'workbench.action.tasks.runTask')).toBe(true);
    const profile = manager.getActiveProfile();
    expect(profile!.customCommands).toHaveLength(1);
    expect(profile!.customCommands[0].phrase).toBe('deploy');
  });

  it('addCommand rejects duplicates', () => {
    manager.addCommand('deploy', 'command');
    expect(manager.addCommand('Deploy', 'command')).toBe(false); // case-insensitive
  });

  it('exportProfile returns JSON', () => {
    const json = manager.exportProfile('default');
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json!);
    expect(parsed.name).toBe('Default');
    expect(parsed.id).toBe('default');
  });

  it('exportProfile returns null for unknown id', () => {
    expect(manager.exportProfile('nonexistent')).toBeNull();
  });

  it('importProfile creates new profile from JSON', () => {
    const original = manager.createProfile('Exported');
    original.vocabulary = ['test', 'word'];
    const json = manager.exportProfile(original.id)!;

    const imported = manager.importProfile(json);
    expect(imported).not.toBeNull();
    expect(imported!.name).toBe('Exported');
    expect(imported!.id).not.toBe(original.id); // New ID
    expect(imported!.vocabulary).toContain('test');
  });

  it('importProfile returns null for invalid JSON', () => {
    expect(manager.importProfile('not json')).toBeNull();
    expect(manager.importProfile('{}')).toBeNull(); // Missing name/id
  });

  it('getStats returns usage sorted by count', () => {
    const alice = manager.createProfile('Alice');
    manager.switchTo(alice.id);
    manager.switchTo(alice.id);
    manager.switchTo(alice.id);

    const stats = manager.getStats();
    expect(stats[0].name).toBe('Alice');
    expect(stats[0].usageCount).toBe(3);
  });
});
