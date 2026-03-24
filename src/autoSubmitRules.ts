/**
 * Auto-submit target rules — resolves whether to auto-submit (press Enter)
 * after delivering a transcript to a given output target.
 *
 * Defaults: chat=true, cursor=false, clipboard=false
 * Users can override per-target via voxpilot.autoSubmitRules in settings.
 */

import * as vscode from 'vscode';

export type OutputTarget = 'chat' | 'cursor' | 'clipboard';

export interface AutoSubmitRules {
  chat: boolean;
  cursor: boolean;
  clipboard: boolean;
}

const DEFAULTS: AutoSubmitRules = {
  chat: true,
  cursor: false,
  clipboard: false,
};

/**
 * Read the resolved auto-submit rules from configuration.
 * Merges user overrides on top of defaults.
 * Falls back to legacy `autoSubmitChat` for the chat target if
 * `autoSubmitRules` is not explicitly set.
 */
export function getAutoSubmitRules(): AutoSubmitRules {
  const config = vscode.workspace.getConfiguration('voxpilot');
  const rules = config.get<Partial<AutoSubmitRules>>('autoSubmitRules');

  // If the new setting exists, merge with defaults
  if (rules && typeof rules === 'object') {
    return {
      chat: typeof rules.chat === 'boolean' ? rules.chat : DEFAULTS.chat,
      cursor: typeof rules.cursor === 'boolean' ? rules.cursor : DEFAULTS.cursor,
      clipboard: typeof rules.clipboard === 'boolean' ? rules.clipboard : DEFAULTS.clipboard,
    };
  }

  // Legacy fallback: respect old autoSubmitChat boolean for chat target
  const legacyAutoSubmit = config.get<boolean>('autoSubmitChat');
  return {
    ...DEFAULTS,
    chat: typeof legacyAutoSubmit === 'boolean' ? legacyAutoSubmit : DEFAULTS.chat,
  };
}

/**
 * Should we auto-submit for the given output target?
 */
export function shouldAutoSubmit(target: OutputTarget): boolean {
  return getAutoSubmitRules()[target];
}
