/**
 * Multi-language support — enhanced language management for multilingual transcription.
 *
 * Builds on the existing language selector and Whisper model support to provide:
 *   1. Language profiles — save preferred language+model combos for quick switching
 *   2. Auto-suggest Whisper — when a non-English language is selected with an English-only model
 *   3. Language detection history — track detected languages across sessions
 *   4. Quick language toggle — switch between two recent languages with one command
 *
 * Enable via `voxpilot.multiLanguage` setting (default: true).
 */

import * as vscode from 'vscode';
import { isMultilingualModel, getLanguageName } from './languageSelector';

export interface LanguageProfile {
  /** Profile name (e.g. "Spanish dictation") */
  name: string;
  /** ISO 639-1 language code */
  language: string;
  /** Model ID to use with this language */
  model: string;
}

/**
 * Track recently used languages for quick toggle.
 * Stores the last N languages used, most recent first.
 */
export class LanguageHistory {
  private history: string[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 5) {
    this.maxSize = maxSize;
  }

  /** Record a language use (push to front, dedup) */
  push(langCode: string): void {
    this.history = [langCode, ...this.history.filter(l => l !== langCode)].slice(0, this.maxSize);
  }

  /** Get the most recently used language */
  get current(): string | undefined {
    return this.history[0];
  }

  /** Get the previous language (for quick toggle) */
  get previous(): string | undefined {
    return this.history[1];
  }

  /** Get full history */
  get all(): string[] {
    return [...this.history];
  }

  /** Clear history */
  clear(): void {
    this.history = [];
  }

  /** Load from persisted state */
  load(data: string[]): void {
    this.history = data.slice(0, this.maxSize);
  }

  /** Export for persistence */
  toJSON(): string[] {
    return [...this.history];
  }
}

/**
 * Check if the current model supports the selected language.
 * Returns a suggestion message if there's a mismatch, or null if OK.
 */
export function checkLanguageModelCompat(
  language: string,
  modelId: string,
): { compatible: boolean; suggestion?: string } {
  // Auto-detect works with any model
  if (language === 'auto' || language === 'en') {
    return { compatible: true };
  }

  // Non-English language with English-only model
  if (!isMultilingualModel(modelId)) {
    return {
      compatible: false,
      suggestion: `${getLanguageName(language)} requires a Whisper model. Current model "${modelId}" is English-only. Switch to whisper-base or larger for multilingual support.`,
    };
  }

  // Whisper model with non-English — compatible
  return { compatible: true };
}

/**
 * Suggest the best Whisper model based on the selected language.
 * Some languages work better with larger models.
 */
export function suggestModelForLanguage(language: string): string {
  // Languages that need larger models for good accuracy
  const needsLargerModel = new Set([
    'zh', 'ja', 'ko', 'ar', 'he', 'hi', 'th', 'ta', 'te', 'ml',
    'bn', 'ur', 'fa', 'am', 'gu', 'kn', 'my', 'ka', 'km', 'lo',
    'si', 'ne', 'bo', 'mn', 'yi',
  ]);

  // CJK and complex scripts benefit from medium+
  if (needsLargerModel.has(language)) {
    return 'whisper-medium';
  }

  // European languages work well with base/small
  return 'whisper-base';
}

/**
 * Format a language detection result for display.
 * Shows flag emoji + language name when available.
 */
export function formatLanguageDisplay(langCode: string): string {
  const flags: Record<string, string> = {
    en: '🇬🇧', zh: '🇨🇳', de: '🇩🇪', es: '🇪🇸', fr: '🇫🇷',
    ja: '🇯🇵', ko: '🇰🇷', pt: '🇧🇷', ru: '🇷🇺', it: '🇮🇹',
    nl: '🇳🇱', pl: '🇵🇱', tr: '🇹🇷', ar: '🇸🇦', hi: '🇮🇳',
    sv: '🇸🇪', da: '🇩🇰', fi: '🇫🇮', no: '🇳🇴', uk: '🇺🇦',
    el: '🇬🇷', cs: '🇨🇿', ro: '🇷🇴', hu: '🇭🇺', th: '🇹🇭',
    vi: '🇻🇳', id: '🇮🇩', ms: '🇲🇾', he: '🇮🇱', fa: '🇮🇷',
  };

  const flag = flags[langCode] || '🌐';
  const name = getLanguageName(langCode);
  return `${flag} ${name}`;
}

/**
 * Manage language profiles stored in workspace settings.
 */
export class LanguageProfileManager {
  private profiles: LanguageProfile[] = [];

  constructor() {
    this.reload();
  }

  reload(): void {
    const config = vscode.workspace.getConfiguration('voxpilot');
    this.profiles = config.get<LanguageProfile[]>('languageProfiles', []);
  }

  getAll(): LanguageProfile[] {
    return [...this.profiles];
  }

  getByName(name: string): LanguageProfile | undefined {
    return this.profiles.find(p => p.name === name);
  }

  async add(profile: LanguageProfile): Promise<void> {
    // Remove existing with same name
    this.profiles = this.profiles.filter(p => p.name !== profile.name);
    this.profiles.push(profile);
    await this.save();
  }

  async remove(name: string): Promise<void> {
    this.profiles = this.profiles.filter(p => p.name !== name);
    await this.save();
  }

  private async save(): Promise<void> {
    const config = vscode.workspace.getConfiguration('voxpilot');
    await config.update('languageProfiles', this.profiles, true);
  }
}
