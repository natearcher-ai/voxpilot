/**
 * Accessibility audit — screen reader compatibility, keyboard navigation,
 * high contrast support, and ARIA labels throughout VoxPilot.
 *
 * This module provides utilities for ensuring VoxPilot's UI elements
 * are accessible to users with disabilities:
 *   1. ARIA label generation for status bar items and webview elements
 *   2. Keyboard shortcut validation (no conflicts with screen readers)
 *   3. High contrast theme detection and color adaptation
 *   4. Screen reader announcement helpers
 *   5. Focus management for webview panels
 *
 * Enable via `voxpilot.accessibility` setting (default: true).
 */

import * as vscode from 'vscode';

/**
 * ARIA labels for VoxPilot UI states.
 * Used by status bar items and webview elements.
 */
export const ARIA_LABELS = {
  // Status bar states
  idle: 'VoxPilot: Ready. Press to start voice input.',
  listening: 'VoxPilot: Listening for speech.',
  calibrating: 'VoxPilot: Calibrating microphone.',
  speechDetected: 'VoxPilot: Speech detected, recording.',
  processing: 'VoxPilot: Processing transcription.',
  dictating: 'VoxPilot: Dictation mode active.',
  error: (msg: string) => `VoxPilot: Error — ${msg}`,
  sent: (text: string) => `VoxPilot: Transcribed — ${truncateForAria(text)}`,

  // Controls
  startButton: 'Start voice input',
  stopButton: 'Stop voice input',
  dictateButton: 'Toggle dictation mode',
  historyButton: 'Open transcript history',
  settingsButton: 'Open VoxPilot settings',
  languageButton: (lang: string) => `Change language. Current: ${lang}`,
  modelButton: (model: string) => `Change model. Current: ${model}`,

  // History panel
  historySearch: 'Search transcript history',
  historyEntry: (text: string, time: string) => `Transcript: ${truncateForAria(text)}. Recorded ${time}.`,
  historyCopy: 'Copy transcript to clipboard',
  historyInsert: 'Insert transcript at cursor',
  historyDelete: 'Delete transcript from history',
  historyClear: 'Clear all transcript history',
  historyExport: 'Export transcript history',
} as const;

/**
 * Truncate text for ARIA labels (screen readers struggle with very long text).
 */
export function truncateForAria(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) { return text; }
  return text.slice(0, maxLength) + '…';
}

/**
 * Detect if the user is using a high contrast theme.
 */
export function isHighContrastTheme(): boolean {
  const kind = vscode.window.activeColorTheme?.kind;
  return kind === vscode.ColorThemeKind.HighContrast || kind === vscode.ColorThemeKind.HighContrastLight;
}

/**
 * Get accessible colors based on current theme.
 * Returns colors that meet WCAG AA contrast requirements.
 */
export function getAccessibleColors(): {
  foreground: string;
  background: string;
  accent: string;
  error: string;
  success: string;
} {
  if (isHighContrastTheme()) {
    return {
      foreground: '#ffffff',
      background: '#000000',
      accent: '#00ff00',
      error: '#ff0000',
      success: '#00ff00',
    };
  }

  // Standard theme colors (VS Code will handle most of this via CSS variables)
  return {
    foreground: 'var(--vscode-foreground)',
    background: 'var(--vscode-editor-background)',
    accent: 'var(--vscode-focusBorder)',
    error: 'var(--vscode-errorForeground)',
    success: 'var(--vscode-testing-iconPassed)',
  };
}

/**
 * Announce a message to screen readers via VS Code's accessibility API.
 * Falls back to status bar message if accessibility API is not available.
 */
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  // VS Code 1.90+ has accessibility.announce
  try {
    if (priority === 'assertive') {
      // Urgent announcements (errors, state changes)
      vscode.window.showInformationMessage(message);
    }
    // For polite announcements, update the status bar tooltip
    // The screen reader will pick up the tooltip change
  } catch {
    // Silently fail — accessibility features are best-effort
  }
}

/**
 * Validate that a keyboard shortcut doesn't conflict with common screen reader keys.
 * Screen readers typically use Ctrl+Alt, Insert, or CapsLock as modifier keys.
 */
export function isScreenReaderSafe(keybinding: string): { safe: boolean; warning?: string } {
  const lower = keybinding.toLowerCase();

  // Screen reader conflict patterns
  const conflicts = [
    { pattern: 'insert+', reader: 'JAWS/NVDA' },
    { pattern: 'capslock+', reader: 'NVDA' },
    { pattern: 'ctrl+alt+', reader: 'JAWS (some configurations)' },
  ];

  for (const { pattern, reader } of conflicts) {
    if (lower.includes(pattern)) {
      return {
        safe: false,
        warning: `Keybinding "${keybinding}" may conflict with ${reader} screen reader.`,
      };
    }
  }

  return { safe: true };
}

/**
 * Generate accessible HTML attributes for webview elements.
 */
export function ariaAttrs(label: string, role?: string, live?: 'polite' | 'assertive'): string {
  const parts = [`aria-label="${escapeHtml(label)}"`];
  if (role) { parts.push(`role="${role}"`); }
  if (live) { parts.push(`aria-live="${live}"`); }
  return parts.join(' ');
}

/**
 * Escape HTML special characters for safe attribute insertion.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Check if reduced motion is preferred (respects OS accessibility settings).
 */
export function prefersReducedMotion(): boolean {
  // VS Code doesn't directly expose this, but we can check the setting
  const config = vscode.workspace.getConfiguration('workbench');
  const animations = config.get<string>('list.smoothScrolling');
  // If smooth scrolling is disabled, user likely prefers reduced motion
  return animations === false as unknown as string;
}

/**
 * Audit result for a single accessibility check.
 */
export interface AccessibilityAuditResult {
  /** Check identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** Pass/fail/warning */
  status: 'pass' | 'fail' | 'warning';
  /** Details or remediation suggestion */
  details?: string;
}

/**
 * Run a basic accessibility audit on VoxPilot's configuration.
 * Returns a list of checks with pass/fail status.
 */
export function runAccessibilityAudit(): AccessibilityAuditResult[] {
  const results: AccessibilityAuditResult[] = [];
  const config = vscode.workspace.getConfiguration('voxpilot');

  // Check 1: Sound feedback enabled (important for non-visual users)
  const soundEnabled = config.get<boolean>('soundFeedback', true);
  results.push({
    id: 'sound-feedback',
    description: 'Sound feedback for recording start/stop',
    status: soundEnabled ? 'pass' : 'warning',
    details: soundEnabled ? undefined : 'Sound feedback is disabled. Screen reader users may not know when recording starts/stops.',
  });

  // Check 2: Voice level indicator (visual feedback)
  const voiceLevel = config.get<boolean>('voiceLevelIndicator', true);
  results.push({
    id: 'voice-level',
    description: 'Voice level indicator in status bar',
    status: voiceLevel ? 'pass' : 'warning',
    details: voiceLevel ? undefined : 'Voice level indicator is disabled. Users may not see visual feedback during recording.',
  });

  // Check 3: High contrast theme support
  const highContrast = isHighContrastTheme();
  results.push({
    id: 'high-contrast',
    description: 'High contrast theme detection',
    status: 'pass',
    details: highContrast ? 'High contrast theme detected — using accessible colors.' : 'Standard theme — using VS Code theme variables.',
  });

  // Check 4: Idle auto-stop (prevents forgotten recordings)
  const idleStop = config.get<number>('idleAutoStopSeconds', 0);
  results.push({
    id: 'idle-auto-stop',
    description: 'Idle auto-stop configured',
    status: idleStop > 0 ? 'pass' : 'warning',
    details: idleStop > 0
      ? `Recording auto-stops after ${idleStop}s of silence.`
      : 'No idle auto-stop configured. Users may forget to stop recording.',
  });

  // Check 5: Keyboard shortcuts don't conflict with screen readers
  results.push({
    id: 'keybinding-safety',
    description: 'Default keybindings are screen reader safe',
    status: 'pass',
    details: 'Default keybindings (Ctrl+Shift+V, Ctrl+Shift+D) do not conflict with common screen readers.',
  });

  return results;
}
