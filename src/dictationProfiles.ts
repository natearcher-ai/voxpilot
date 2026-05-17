/**
 * Dictation profiles — switch between prose/code/command modes with different processing pipelines.
 *
 * Each profile defines which post-processors are enabled/disabled and overrides specific settings.
 * Users can switch profiles via command palette, status bar, or voice command ("switch to code mode").
 *
 * Built-in profiles:
 *   - prose: Natural language dictation (auto-punctuation, capitalization, filler removal)
 *   - code: Programming dictation (prefix commands, code vocabulary, smart insert)
 *   - command: Voice control mode (editor commands, voice commands, git commands)
 *
 * Users can also define custom profiles via settings.
 */

import * as vscode from 'vscode';
import { PostProcessingPipeline } from './postProcessingPipeline';

/** Configuration for a single dictation profile */
export interface DictationProfile {
  /** Unique identifier */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Short description shown in quick pick */
  description: string;
  /** Icon for status bar and quick pick */
  icon: string;
  /** Processors to explicitly enable (overrides pipeline disabled set) */
  enableProcessors: string[];
  /** Processors to explicitly disable */
  disableProcessors: string[];
  /** Whether this is a built-in profile (cannot be deleted) */
  builtin: boolean;
  /** Optional setting overrides applied when this profile is active */
  settingOverrides?: Record<string, unknown>;
}

/** Built-in prose profile — optimized for natural language dictation */
const PROSE_PROFILE: DictationProfile = {
  id: 'prose',
  name: 'Prose',
  description: 'Natural language — punctuation, capitalization, filler removal',
  icon: '$(book)',
  enableProcessors: [
    'stitchSegments',
    'trim',
    'normalizeWhitespace',
    'voiceCommands',
    'fixTypos',
    'fillerWordRemoval',
    'autoPunctuation',
    'autoCapitalize',
  ],
  disableProcessors: [
    'prefixCommands',
    'codeVocabulary',
    'smartInsert',
    'vocabularyBoost',
    'editorVoiceCommands',
  ],
  builtin: true,
};

/** Built-in code profile — optimized for programming dictation */
const CODE_PROFILE: DictationProfile = {
  id: 'code',
  name: 'Code',
  description: 'Programming — prefix commands, code vocabulary, smart insert',
  icon: '$(code)',
  enableProcessors: [
    'stitchSegments',
    'trim',
    'normalizeWhitespace',
    'voiceCommands',
    'prefixCommands',
    'codeVocabulary',
    'autoVocabulary',
    'vocabularyBoost',
    'smartInsert',
    'fixTypos',
    'fillerWordRemoval',
  ],
  disableProcessors: [
    'autoPunctuation',
    'autoCapitalize',
  ],
  builtin: true,
};

/** Built-in command profile — optimized for voice control */
const COMMAND_PROFILE: DictationProfile = {
  id: 'command',
  name: 'Command',
  description: 'Voice control — editor commands, git, navigation, refactoring',
  icon: '$(terminal)',
  enableProcessors: [
    'stitchSegments',
    'trim',
    'normalizeWhitespace',
    'voiceCommands',
    'editorVoiceCommands',
    'customVoiceCommands',
  ],
  disableProcessors: [
    'prefixCommands',
    'codeVocabulary',
    'autoVocabulary',
    'vocabularyBoost',
    'smartInsert',
    'autoPunctuation',
    'autoCapitalize',
    'fixTypos',
    'fillerWordRemoval',
  ],
  builtin: true,
};

/** All built-in profiles */
const BUILTIN_PROFILES: DictationProfile[] = [PROSE_PROFILE, CODE_PROFILE, COMMAND_PROFILE];

/**
 * Manages dictation profiles — loading, switching, and persisting the active profile.
 */
export class DictationProfileManager {
  private profiles: Map<string, DictationProfile> = new Map();
  private _activeProfileId: string = '';
  private _onDidChangeProfile = new vscode.EventEmitter<DictationProfile | undefined>();

  /** Fires when the active profile changes */
  readonly onDidChangeProfile = this._onDidChangeProfile.event;

  constructor() {
    this.loadProfiles();
  }

  /** Get the currently active profile, or undefined if none */
  get activeProfile(): DictationProfile | undefined {
    return this.profiles.get(this._activeProfileId);
  }

  /** Get the active profile ID */
  get activeProfileId(): string {
    return this._activeProfileId;
  }

  /** Get all available profiles (built-in + custom) */
  getAllProfiles(): DictationProfile[] {
    return Array.from(this.profiles.values());
  }

  /** Load profiles from settings */
  loadProfiles(): void {
    this.profiles.clear();

    // Register built-in profiles
    for (const p of BUILTIN_PROFILES) {
      this.profiles.set(p.id, p);
    }

    // Load custom profiles from settings
    const config = vscode.workspace.getConfiguration('voxpilot');
    const customProfiles = config.get<Array<{
      id: string;
      name: string;
      description?: string;
      icon?: string;
      enableProcessors?: string[];
      disableProcessors?: string[];
      settingOverrides?: Record<string, unknown>;
    }>>('dictationProfiles.custom', []);

    for (const cp of customProfiles) {
      if (!cp.id || !cp.name) { continue; }
      // Don't allow overriding built-in IDs
      if (BUILTIN_PROFILES.some(bp => bp.id === cp.id)) { continue; }
      this.profiles.set(cp.id, {
        id: cp.id,
        name: cp.name,
        description: cp.description || `Custom profile: ${cp.name}`,
        icon: cp.icon || '$(gear)',
        enableProcessors: cp.enableProcessors || [],
        disableProcessors: cp.disableProcessors || [],
        builtin: false,
        settingOverrides: cp.settingOverrides,
      });
    }

    // Restore active profile
    const savedActive = config.get<string>('dictationProfiles.active', '');
    if (savedActive && this.profiles.has(savedActive)) {
      this._activeProfileId = savedActive;
    } else {
      this._activeProfileId = '';
    }
  }

  /**
   * Switch to a profile by ID. Pass empty string to deactivate (use default pipeline).
   * Returns true if the switch was successful.
   */
  async switchProfile(profileId: string): Promise<boolean> {
    if (profileId && !this.profiles.has(profileId)) {
      return false;
    }

    this._activeProfileId = profileId;

    // Persist the choice
    const config = vscode.workspace.getConfiguration('voxpilot');
    await config.update('dictationProfiles.active', profileId || undefined, vscode.ConfigurationTarget.Global);

    this._onDidChangeProfile.fire(this.activeProfile);
    return true;
  }

  /**
   * Apply the active profile's processor overrides to the pipeline.
   * Call this after pipeline.reloadConfig() to layer profile settings on top.
   */
  applyToPipeline(pipeline: PostProcessingPipeline): void {
    const profile = this.activeProfile;
    if (!profile) { return; }

    // The pipeline exposes isEnabled and we need to manipulate its internal state.
    // We do this by calling reloadConfig first (done externally), then applying overrides.
    // Since PostProcessingPipeline doesn't expose direct enable/disable methods,
    // we use the applyProfileOverrides method we'll add to the pipeline.
    applyProfileToPipeline(profile, pipeline);
  }

  /** Show quick pick to select a profile */
  async showProfilePicker(): Promise<string | undefined> {
    const items: Array<vscode.QuickPickItem & { profileId: string }> = [];

    // "None" option to deactivate
    items.push({
      label: '$(circle-slash) Default',
      description: this._activeProfileId === '' ? '(active)' : '',
      detail: 'Use default pipeline settings without profile overrides',
      profileId: '',
    });

    for (const profile of this.profiles.values()) {
      const isActive = profile.id === this._activeProfileId;
      items.push({
        label: `${profile.icon} ${profile.name}`,
        description: isActive ? '(active)' : '',
        detail: profile.description,
        profileId: profile.id,
      });
    }

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select dictation profile',
      title: 'VoxPilot: Switch Dictation Profile',
    });

    if (picked) {
      await this.switchProfile(picked.profileId);
      return picked.profileId;
    }
    return undefined;
  }

  /** Try to match a voice command for profile switching */
  matchVoiceSwitch(text: string): string | undefined {
    const lower = text.toLowerCase().trim();

    // Patterns: "switch to X mode", "X mode", "switch to X", "use X profile"
    const patterns = [
      /^(?:switch to|change to|use)\s+(\w+)\s+(?:mode|profile)$/,
      /^(\w+)\s+mode$/,
      /^(?:switch to|change to|use)\s+(\w+)$/,
    ];

    for (const pattern of patterns) {
      const match = lower.match(pattern);
      if (match) {
        const name = match[1];
        // Find profile by name (case-insensitive)
        for (const profile of this.profiles.values()) {
          if (profile.name.toLowerCase() === name || profile.id.toLowerCase() === name) {
            return profile.id;
          }
        }
      }
    }

    // Direct "prose", "code", "command" as standalone
    for (const profile of this.profiles.values()) {
      if (lower === profile.id || lower === profile.name.toLowerCase()) {
        // Only match standalone if it's clearly a mode switch context
        // (handled by the engine when in command mode)
        return undefined;
      }
    }

    return undefined;
  }

  dispose(): void {
    this._onDidChangeProfile.dispose();
  }
}

/**
 * Apply a profile's processor overrides to the pipeline.
 * This manipulates the pipeline's disabled set to match the profile configuration.
 */
function applyProfileToPipeline(profile: DictationProfile, pipeline: PostProcessingPipeline): void {
  // Get current processor info to know what's registered
  const processors = pipeline.getProcessorInfo();
  const registeredIds = new Set(processors.map(p => p.id));

  // Disable processors listed in disableProcessors
  for (const id of profile.disableProcessors) {
    if (registeredIds.has(id)) {
      pipeline.setProcessorEnabled(id, false);
    }
  }

  // Enable processors listed in enableProcessors
  for (const id of profile.enableProcessors) {
    if (registeredIds.has(id)) {
      pipeline.setProcessorEnabled(id, true);
    }
  }
}

/**
 * Status bar item that shows the current dictation profile.
 */
export class DictationProfileStatusBar {
  private item: vscode.StatusBarItem;
  private manager: DictationProfileManager;

  constructor(manager: DictationProfileManager) {
    this.manager = manager;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    this.item.command = 'voxpilot.switchDictationProfile';
    this.item.tooltip = 'VoxPilot: Switch Dictation Profile';
    this.update();

    manager.onDidChangeProfile(() => this.update());
  }

  private update(): void {
    const profile = this.manager.activeProfile;
    if (profile) {
      this.item.text = `${profile.icon} ${profile.name}`;
      this.item.show();
    } else {
      this.item.text = '$(list-unordered) Default';
      this.item.show();
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
