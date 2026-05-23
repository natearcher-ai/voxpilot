/**
 * Speaker Profiles — different voice models and settings per user for shared workstations.
 *
 * Allows multiple users to share a VoxPilot installation with personalized settings:
 *   - Per-user ASR model selection (optimized for their voice)
 *   - Per-user vocabulary and custom commands
 *   - Per-user noise profile and VAD sensitivity
 *   - Per-user dictation profile (prose/code/command mode defaults)
 *   - Quick profile switching via voice ("switch to Alice's profile")
 *   - Optional voice-based auto-detection (speaker identification)
 *
 * Profiles are stored in workspace state and can be exported/imported.
 * Enable via `voxpilot.speakerProfiles.enabled` setting (default: false).
 */

import * as vscode from 'vscode';

/** Speaker profile configuration */
export interface SpeakerProfile {
  /** Unique profile ID */
  id: string;
  /** Display name */
  name: string;
  /** Preferred ASR model */
  preferredModel: string;
  /** Preferred language */
  language: string;
  /** VAD sensitivity (0-1) */
  vadSensitivity: number;
  /** Noise gate threshold */
  noiseGateThreshold: number;
  /** Custom vocabulary words */
  vocabulary: string[];
  /** Default dictation mode */
  defaultMode: 'prose' | 'code' | 'command';
  /** Whether auto-punctuation is enabled */
  autoPunctuation: boolean;
  /** Whether auto-capitalize is enabled */
  autoCapitalize: boolean;
  /** Custom voice commands specific to this profile */
  customCommands: Array<{ phrase: string; action: string; text?: string }>;
  /** Created timestamp */
  createdAt: number;
  /** Last used timestamp */
  lastUsedAt: number;
  /** Usage count */
  usageCount: number;
  /** Voice fingerprint for auto-detection (optional) */
  voiceFingerprint?: number[];
}

/** Profile switch event */
export interface ProfileSwitchEvent {
  from: string | null;
  to: string;
  timestamp: number;
  method: 'manual' | 'voice' | 'auto';
}

/**
 * Create a new profile with defaults.
 */
export function createProfile(name: string, id?: string): SpeakerProfile {
  return {
    id: id || `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    preferredModel: 'moonshine-base',
    language: 'en',
    vadSensitivity: 0.5,
    noiseGateThreshold: 0.01,
    vocabulary: [],
    defaultMode: 'code',
    autoPunctuation: true,
    autoCapitalize: true,
    customCommands: [],
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    usageCount: 0,
  };
}

/**
 * Speaker Profile manager — handles profile CRUD, switching, and persistence.
 */
export class SpeakerProfileManager {
  private profiles: Map<string, SpeakerProfile> = new Map();
  private activeProfileId: string | null = null;
  private context: vscode.ExtensionContext | undefined;
  private switchCallbacks: ((event: ProfileSwitchEvent) => void)[] = [];

  constructor() {
    // Create a default profile
    const defaultProfile = createProfile('Default', 'default');
    this.profiles.set('default', defaultProfile);
    this.activeProfileId = 'default';
  }

  /** Initialize with extension context */
  init(extensionContext: vscode.ExtensionContext): void {
    this.context = extensionContext;
    this.loadProfiles();
  }

  /** Get all profiles */
  getProfiles(): SpeakerProfile[] {
    return [...this.profiles.values()];
  }

  /** Get a profile by ID */
  getProfile(id: string): SpeakerProfile | undefined {
    return this.profiles.get(id);
  }

  /** Get the active profile */
  getActiveProfile(): SpeakerProfile | undefined {
    return this.activeProfileId ? this.profiles.get(this.activeProfileId) : undefined;
  }

  /** Get active profile ID */
  getActiveProfileId(): string | null {
    return this.activeProfileId;
  }

  /** Get profile count */
  get count(): number {
    return this.profiles.size;
  }

  /** Create a new profile */
  createProfile(name: string): SpeakerProfile {
    const profile = createProfile(name);
    this.profiles.set(profile.id, profile);
    this.saveProfiles();
    return profile;
  }

  /** Update a profile */
  updateProfile(id: string, updates: Partial<Omit<SpeakerProfile, 'id' | 'createdAt'>>): boolean {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    Object.assign(profile, updates);
    this.saveProfiles();
    return true;
  }

  /** Delete a profile */
  deleteProfile(id: string): boolean {
    if (id === 'default') return false; // Can't delete default
    if (!this.profiles.has(id)) return false;

    this.profiles.delete(id);

    // Switch to default if active profile was deleted
    if (this.activeProfileId === id) {
      this.switchTo('default', 'manual');
    }

    this.saveProfiles();
    return true;
  }

  /** Switch to a profile by ID */
  switchTo(id: string, method: 'manual' | 'voice' | 'auto' = 'manual'): boolean {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    const previousId = this.activeProfileId;
    this.activeProfileId = id;
    profile.lastUsedAt = Date.now();
    profile.usageCount++;

    const event: ProfileSwitchEvent = {
      from: previousId,
      to: id,
      timestamp: Date.now(),
      method,
    };

    this.notifySwitchCallbacks(event);
    this.saveProfiles();
    return true;
  }

  /** Switch to a profile by name (case-insensitive) */
  switchToByName(name: string, method: 'manual' | 'voice' | 'auto' = 'voice'): boolean {
    const profile = [...this.profiles.values()].find(
      p => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (!profile) return false;
    return this.switchTo(profile.id, method);
  }

  /** Register a callback for profile switches */
  onSwitch(callback: (event: ProfileSwitchEvent) => void): vscode.Disposable {
    this.switchCallbacks.push(callback);
    return {
      dispose: () => {
        const idx = this.switchCallbacks.indexOf(callback);
        if (idx >= 0) this.switchCallbacks.splice(idx, 1);
      },
    };
  }

  /** Add vocabulary to the active profile */
  addVocabulary(words: string[]): boolean {
    const profile = this.getActiveProfile();
    if (!profile) return false;

    const existing = new Set(profile.vocabulary);
    for (const word of words) {
      existing.add(word);
    }
    profile.vocabulary = [...existing];
    this.saveProfiles();
    return true;
  }

  /** Add a custom command to the active profile */
  addCommand(phrase: string, action: string, text?: string): boolean {
    const profile = this.getActiveProfile();
    if (!profile) return false;

    // Don't add duplicates
    if (profile.customCommands.some(c => c.phrase.toLowerCase() === phrase.toLowerCase())) {
      return false;
    }

    profile.customCommands.push({ phrase, action, text });
    this.saveProfiles();
    return true;
  }

  /** Export a profile as JSON */
  exportProfile(id: string): string | null {
    const profile = this.profiles.get(id);
    if (!profile) return null;
    return JSON.stringify(profile, null, 2);
  }

  /** Import a profile from JSON */
  importProfile(json: string): SpeakerProfile | null {
    try {
      const data = JSON.parse(json) as SpeakerProfile;
      if (!data.name || !data.id) return null;

      // Generate new ID to avoid conflicts
      data.id = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      data.createdAt = Date.now();
      data.lastUsedAt = Date.now();
      data.usageCount = 0;

      this.profiles.set(data.id, data);
      this.saveProfiles();
      return data;
    } catch {
      return null;
    }
  }

  /** Get profile usage statistics */
  getStats(): Array<{ id: string; name: string; usageCount: number; lastUsed: number }> {
    return [...this.profiles.values()]
      .map(p => ({ id: p.id, name: p.name, usageCount: p.usageCount, lastUsed: p.lastUsedAt }))
      .sort((a, b) => b.usageCount - a.usageCount);
  }

  private notifySwitchCallbacks(event: ProfileSwitchEvent): void {
    for (const cb of this.switchCallbacks) {
      try { cb(event); } catch { /* swallow */ }
    }
  }

  private loadProfiles(): void {
    if (!this.context) return;
    const saved = this.context.globalState.get<{ profiles: Record<string, SpeakerProfile>; activeId: string | null }>('speakerProfiles');
    if (saved) {
      this.profiles = new Map(Object.entries(saved.profiles));
      this.activeProfileId = saved.activeId;
    }
  }

  private saveProfiles(): void {
    if (!this.context) return;
    this.context.globalState.update('speakerProfiles', {
      profiles: Object.fromEntries(this.profiles),
      activeId: this.activeProfileId,
    });
  }
}

/** Singleton instance */
export const speakerProfileManager = new SpeakerProfileManager();
