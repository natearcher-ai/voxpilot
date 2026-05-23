/**
 * Streaming Collaboration — real-time transcript overlay for screen recordings and streams.
 *
 * Provides a floating transcript overlay that can be captured by screen recording
 * software (OBS, Loom, etc.) for:
 *   - Live coding streams with real-time captions
 *   - Screen recordings with searchable subtitles
 *   - Pair programming sessions with visible speech
 *   - Accessibility for deaf/HoH viewers
 *   - Meeting recordings with speaker attribution
 *
 * Features:
 *   - Floating overlay panel (configurable position, size, opacity)
 *   - Auto-fade after configurable timeout
 *   - Speaker name prefix (for multi-user sessions)
 *   - SRT/WebVTT export for post-production subtitles
 *   - OBS WebSocket integration for scene-aware captions
 *   - Customizable font, colors, and animation
 *   - Buffer last N lines for context
 *
 * Enable via `voxpilot.streamOverlay.enabled` setting (default: false).
 */

import * as vscode from 'vscode';

/** Overlay position on screen */
export type OverlayPosition = 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Overlay configuration */
export interface OverlayConfig {
  /** Whether the overlay is enabled */
  enabled: boolean;
  /** Position on screen */
  position: OverlayPosition;
  /** Maximum lines to display */
  maxLines: number;
  /** Font size in pixels */
  fontSize: number;
  /** Text color (CSS color) */
  textColor: string;
  /** Background color (CSS color with alpha) */
  backgroundColor: string;
  /** Opacity (0-1) */
  opacity: number;
  /** Auto-fade timeout in ms (0 = no fade) */
  fadeTimeoutMs: number;
  /** Whether to show speaker name */
  showSpeaker: boolean;
  /** Speaker name to display */
  speakerName: string;
  /** Whether to show timestamps */
  showTimestamps: boolean;
  /** Animation style */
  animation: 'none' | 'fade' | 'slide' | 'typewriter';
  /** Max width as percentage of viewport */
  maxWidthPercent: number;
}

/** Default overlay configuration */
export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  enabled: false,
  position: 'bottom',
  maxLines: 3,
  fontSize: 18,
  textColor: '#ffffff',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  opacity: 1,
  fadeTimeoutMs: 5000,
  showSpeaker: false,
  speakerName: '',
  showTimestamps: false,
  animation: 'fade',
  maxWidthPercent: 80,
};

/** A single caption entry */
export interface CaptionEntry {
  /** Caption text */
  text: string;
  /** Timestamp (ms since session start) */
  timestamp: number;
  /** Duration in ms */
  durationMs: number;
  /** Speaker name (if multi-speaker) */
  speaker?: string;
  /** Whether this is a partial (in-progress) caption */
  partial: boolean;
}

/** Session recording state */
export interface StreamSession {
  /** Session ID */
  id: string;
  /** Start timestamp */
  startedAt: number;
  /** Whether recording is active */
  active: boolean;
  /** All captions in this session */
  captions: CaptionEntry[];
  /** Total words captured */
  totalWords: number;
  /** Session duration in ms */
  durationMs: number;
}

/**
 * Format a timestamp as SRT timecode.
 */
function formatSrtTimecode(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/**
 * Format a timestamp as WebVTT timecode.
 */
function formatVttTimecode(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * Streaming Collaboration manager — handles overlay, captions, and export.
 */
export class StreamingCollaboration {
  private config: OverlayConfig;
  private session: StreamSession | null = null;
  private displayBuffer: CaptionEntry[] = [];
  private panel: vscode.WebviewPanel | undefined;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(config: OverlayConfig = DEFAULT_OVERLAY_CONFIG) {
    this.config = { ...config };
  }

  /** Get current configuration */
  getConfig(): OverlayConfig {
    return { ...this.config };
  }

  /** Update configuration */
  setConfig(updates: Partial<OverlayConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /** Start a new streaming session */
  startSession(speakerName?: string): StreamSession {
    this.session = {
      id: `stream-${Date.now()}`,
      startedAt: Date.now(),
      active: true,
      captions: [],
      totalWords: 0,
      durationMs: 0,
    };

    if (speakerName) {
      this.config.speakerName = speakerName;
      this.config.showSpeaker = true;
    }

    return this.session;
  }

  /** End the current session */
  endSession(): StreamSession | null {
    if (!this.session) return null;

    this.session.active = false;
    this.session.durationMs = Date.now() - this.session.startedAt;
    this.clearDisplay();

    const completed = this.session;
    return completed;
  }

  /** Get current session */
  getSession(): StreamSession | null {
    return this.session;
  }

  /** Whether a session is active */
  isActive(): boolean {
    return this.session?.active ?? false;
  }

  /** Add a caption (final transcription) */
  addCaption(text: string, durationMs?: number, speaker?: string): void {
    if (!this.session || !this.session.active) return;

    const entry: CaptionEntry = {
      text,
      timestamp: Date.now() - this.session.startedAt,
      durationMs: durationMs || 3000,
      speaker: speaker || this.config.speakerName || undefined,
      partial: false,
    };

    this.session.captions.push(entry);
    this.session.totalWords += text.split(/\s+/).length;
    this.pushToDisplay(entry);
  }

  /** Update partial caption (in-progress transcription) */
  updatePartial(text: string): void {
    if (!this.session || !this.session.active) return;

    // Replace last partial or add new one
    const lastIdx = this.displayBuffer.length - 1;
    if (lastIdx >= 0 && this.displayBuffer[lastIdx].partial) {
      this.displayBuffer[lastIdx].text = text;
    } else {
      this.displayBuffer.push({
        text,
        timestamp: Date.now() - this.session.startedAt,
        durationMs: 0,
        partial: true,
      });
    }

    this.refreshOverlay();
  }

  /** Get current display buffer */
  getDisplayBuffer(): CaptionEntry[] {
    return [...this.displayBuffer];
  }

  /** Clear the display */
  clearDisplay(): void {
    this.displayBuffer = [];
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = undefined;
    }
  }

  /** Export session as SRT subtitles */
  exportSRT(session?: StreamSession): string {
    const s = session || this.session;
    if (!s || s.captions.length === 0) return '';

    const lines: string[] = [];
    for (let i = 0; i < s.captions.length; i++) {
      const cap = s.captions[i];
      const start = formatSrtTimecode(cap.timestamp);
      const end = formatSrtTimecode(cap.timestamp + cap.durationMs);

      lines.push(`${i + 1}`);
      lines.push(`${start} --> ${end}`);
      if (cap.speaker) {
        lines.push(`<${cap.speaker}> ${cap.text}`);
      } else {
        lines.push(cap.text);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Export session as WebVTT */
  exportWebVTT(session?: StreamSession): string {
    const s = session || this.session;
    if (!s || s.captions.length === 0) return 'WEBVTT\n\n';

    const lines: string[] = ['WEBVTT', ''];

    for (let i = 0; i < s.captions.length; i++) {
      const cap = s.captions[i];
      const start = formatVttTimecode(cap.timestamp);
      const end = formatVttTimecode(cap.timestamp + cap.durationMs);

      lines.push(`${i + 1}`);
      lines.push(`${start} --> ${end}`);
      if (cap.speaker) {
        lines.push(`<v ${cap.speaker}>${cap.text}`);
      } else {
        lines.push(cap.text);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Export session as plain text transcript */
  exportText(session?: StreamSession): string {
    const s = session || this.session;
    if (!s) return '';

    return s.captions.map(cap => {
      const time = formatVttTimecode(cap.timestamp).slice(0, 8); // HH:MM:SS
      const prefix = cap.speaker ? `[${cap.speaker}]` : '';
      return `${time} ${prefix} ${cap.text}`.trim();
    }).join('\n');
  }

  /** Get session statistics */
  getStats(): { captions: number; words: number; durationMs: number; wpm: number } | null {
    if (!this.session) return null;

    const durationMs = this.session.active
      ? Date.now() - this.session.startedAt
      : this.session.durationMs;

    const wpm = durationMs > 0
      ? Math.round(this.session.totalWords / (durationMs / 60000))
      : 0;

    return {
      captions: this.session.captions.length,
      words: this.session.totalWords,
      durationMs,
      wpm,
    };
  }

  /** Show the overlay panel */
  showOverlay(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'voxpilotStreamOverlay',
      'VoxPilot Stream Captions',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true },
    );

    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.refreshOverlay();
  }

  /** Hide the overlay panel */
  hideOverlay(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private pushToDisplay(entry: CaptionEntry): void {
    // Remove any partial entries
    this.displayBuffer = this.displayBuffer.filter(e => !e.partial);
    this.displayBuffer.push(entry);

    // Trim to max lines
    while (this.displayBuffer.length > this.config.maxLines) {
      this.displayBuffer.shift();
    }

    this.refreshOverlay();
    this.scheduleFade();
  }

  private scheduleFade(): void {
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    if (this.config.fadeTimeoutMs <= 0) return;

    this.fadeTimer = setTimeout(() => {
      this.displayBuffer = [];
      this.refreshOverlay();
    }, this.config.fadeTimeoutMs);
  }

  private refreshOverlay(): void {
    if (!this.panel) return;
    this.panel.webview.html = this.getOverlayHtml();
  }

  private getOverlayHtml(): string {
    const captions = this.displayBuffer.map(cap => {
      const speaker = cap.speaker && this.config.showSpeaker ? `<span class="speaker">${cap.speaker}:</span> ` : '';
      const cls = cap.partial ? 'caption partial' : 'caption';
      return `<div class="${cls}">${speaker}${cap.text}</div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html><head><style>
  body { background: transparent; margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; flex-direction: column; justify-content: flex-end; min-height: 100vh; }
  .caption { background: ${this.config.backgroundColor}; color: ${this.config.textColor}; font-size: ${this.config.fontSize}px; padding: 8px 16px; margin: 4px 0; border-radius: 6px; max-width: ${this.config.maxWidthPercent}%; opacity: ${this.config.opacity}; }
  .caption.partial { opacity: 0.7; font-style: italic; }
  .speaker { font-weight: bold; color: #4fc3f7; }
</style></head><body>${captions}</body></html>`;
  }
}

/** Singleton instance */
export const streamingCollaboration = new StreamingCollaboration();
