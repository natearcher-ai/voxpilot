/**
 * Transcription Export — export session transcripts as markdown, JSON, or SRT subtitles.
 *
 * Allows users to export their transcription history in multiple formats:
 *   - Markdown: formatted with timestamps and speaker labels
 *   - JSON: structured data for programmatic use
 *   - SRT: subtitle format for video/screen recording sync
 *   - Plain text: simple text dump
 *
 * Export options:
 *   - Full session or date range
 *   - Include/exclude timestamps
 *   - Include/exclude confidence scores
 *   - Group by file or chronological
 *   - Filter by language
 *
 * Commands:
 *   "export transcript"           → Export current session
 *   "export transcript as srt"    → Export as SRT subtitles
 *   "export all transcripts"      → Export full history
 *
 * Enable via `voxpilot.transcriptionExport` setting (default: true).
 */

import * as vscode from 'vscode';

/** Supported export formats */
export type ExportFormat = 'markdown' | 'json' | 'srt' | 'text';

/** A single transcript entry for export */
export interface TranscriptEntry {
  /** Transcript text */
  text: string;
  /** Timestamp (ms since epoch) */
  timestamp: number;
  /** Duration of the audio segment in ms */
  durationMs?: number;
  /** Language code */
  language?: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** File that was active during transcription */
  activeFile?: string;
  /** Model used for transcription */
  model?: string;
}

/** Export configuration */
export interface ExportConfig {
  /** Output format */
  format: ExportFormat;
  /** Include timestamps */
  includeTimestamps: boolean;
  /** Include confidence scores */
  includeConfidence: boolean;
  /** Include active file info */
  includeFileInfo: boolean;
  /** Group entries by file */
  groupByFile: boolean;
  /** Date range start (ms since epoch, 0 = no filter) */
  fromDate: number;
  /** Date range end (ms since epoch, 0 = no filter) */
  toDate: number;
  /** Filter by language (empty = all) */
  languageFilter: string;
}

/** Default export configuration */
export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  format: 'markdown',
  includeTimestamps: true,
  includeConfidence: false,
  includeFileInfo: true,
  groupByFile: false,
  fromDate: 0,
  toDate: 0,
  languageFilter: '',
};

/**
 * Format a timestamp as HH:MM:SS
 */
function formatTime(ms: number): string {
  const date = new Date(ms);
  return date.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Format a timestamp as SRT timecode: HH:MM:SS,mmm
 */
function formatSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/**
 * Format a relative timestamp for SRT (relative to session start)
 */
function toRelativeMs(timestamp: number, sessionStart: number): number {
  return Math.max(0, timestamp - sessionStart);
}

/**
 * Transcription exporter — converts transcript entries to various formats.
 */
export class TranscriptionExporter {
  /**
   * Export transcripts in the specified format.
   */
  export(entries: TranscriptEntry[], config: ExportConfig = DEFAULT_EXPORT_CONFIG): string {
    const filtered = this.filterEntries(entries, config);

    switch (config.format) {
      case 'markdown':
        return this.toMarkdown(filtered, config);
      case 'json':
        return this.toJSON(filtered, config);
      case 'srt':
        return this.toSRT(filtered);
      case 'text':
        return this.toText(filtered, config);
      default:
        return this.toMarkdown(filtered, config);
    }
  }

  /**
   * Export and save to a file (shows save dialog).
   */
  async exportToFile(entries: TranscriptEntry[], config: ExportConfig): Promise<string | undefined> {
    const content = this.export(entries, config);
    const ext = this.getFileExtension(config.format);
    const defaultName = `voxpilot-transcript-${new Date().toISOString().slice(0, 10)}${ext}`;

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultName),
      filters: this.getFileFilters(config.format),
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
      vscode.window.showInformationMessage(`Transcript exported to ${uri.fsPath}`);
      return uri.fsPath;
    }

    return undefined;
  }

  /**
   * Export to clipboard.
   */
  async exportToClipboard(entries: TranscriptEntry[], config: ExportConfig): Promise<void> {
    const content = this.export(entries, config);
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage(
      `Transcript copied to clipboard (${entries.length} entries, ${config.format} format)`,
    );
  }

  /**
   * Get available export formats with descriptions.
   */
  getFormats(): Array<{ format: ExportFormat; label: string; description: string }> {
    return [
      { format: 'markdown', label: 'Markdown', description: 'Formatted with timestamps and headers' },
      { format: 'json', label: 'JSON', description: 'Structured data for programmatic use' },
      { format: 'srt', label: 'SRT Subtitles', description: 'For video/screen recording sync' },
      { format: 'text', label: 'Plain Text', description: 'Simple text, one entry per line' },
    ];
  }

  private filterEntries(entries: TranscriptEntry[], config: ExportConfig): TranscriptEntry[] {
    let filtered = [...entries];

    if (config.fromDate > 0) {
      filtered = filtered.filter(e => e.timestamp >= config.fromDate);
    }
    if (config.toDate > 0) {
      filtered = filtered.filter(e => e.timestamp <= config.toDate);
    }
    if (config.languageFilter) {
      filtered = filtered.filter(e => e.language === config.languageFilter);
    }

    return filtered.sort((a, b) => a.timestamp - b.timestamp);
  }

  private toMarkdown(entries: TranscriptEntry[], config: ExportConfig): string {
    const lines: string[] = [];
    const date = entries.length > 0 ? new Date(entries[0].timestamp).toLocaleDateString() : 'N/A';

    lines.push(`# VoxPilot Transcript`);
    lines.push(`**Date:** ${date}  `);
    lines.push(`**Entries:** ${entries.length}  `);
    lines.push('');

    if (config.groupByFile) {
      const grouped = this.groupByFile(entries);
      for (const [file, fileEntries] of grouped) {
        lines.push(`## ${file || 'No file'}`);
        lines.push('');
        for (const entry of fileEntries) {
          lines.push(this.formatMarkdownEntry(entry, config));
        }
        lines.push('');
      }
    } else {
      lines.push('## Transcripts');
      lines.push('');
      for (const entry of entries) {
        lines.push(this.formatMarkdownEntry(entry, config));
      }
    }

    return lines.join('\n');
  }

  private formatMarkdownEntry(entry: TranscriptEntry, config: ExportConfig): string {
    const parts: string[] = [];

    if (config.includeTimestamps) {
      parts.push(`**[${formatTime(entry.timestamp)}]**`);
    }

    parts.push(entry.text);

    if (config.includeConfidence && entry.confidence !== undefined) {
      parts.push(`_(${Math.round(entry.confidence * 100)}%)_`);
    }

    if (config.includeFileInfo && entry.activeFile) {
      const fileName = entry.activeFile.split('/').pop() || entry.activeFile;
      parts.push(`\`${fileName}\``);
    }

    return `- ${parts.join(' ')}`;
  }

  private toJSON(entries: TranscriptEntry[], config: ExportConfig): string {
    const output = {
      exportedAt: new Date().toISOString(),
      format: 'voxpilot-transcript-v1',
      entryCount: entries.length,
      config: {
        includeTimestamps: config.includeTimestamps,
        includeConfidence: config.includeConfidence,
        includeFileInfo: config.includeFileInfo,
      },
      entries: entries.map(e => {
        const obj: Record<string, unknown> = { text: e.text };
        if (config.includeTimestamps) {
          obj.timestamp = e.timestamp;
          obj.time = new Date(e.timestamp).toISOString();
        }
        if (e.durationMs !== undefined) obj.durationMs = e.durationMs;
        if (config.includeConfidence && e.confidence !== undefined) obj.confidence = e.confidence;
        if (config.includeFileInfo && e.activeFile) obj.activeFile = e.activeFile;
        if (e.language) obj.language = e.language;
        if (e.model) obj.model = e.model;
        return obj;
      }),
    };

    return JSON.stringify(output, null, 2);
  }

  private toSRT(entries: TranscriptEntry[]): string {
    if (entries.length === 0) return '';

    const sessionStart = entries[0].timestamp;
    const lines: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const startMs = toRelativeMs(entry.timestamp, sessionStart);
      const endMs = entry.durationMs
        ? startMs + entry.durationMs
        : (i + 1 < entries.length
          ? toRelativeMs(entries[i + 1].timestamp, sessionStart)
          : startMs + 3000); // Default 3s duration for last entry

      lines.push(`${i + 1}`);
      lines.push(`${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}`);
      lines.push(entry.text);
      lines.push('');
    }

    return lines.join('\n');
  }

  private toText(entries: TranscriptEntry[], config: ExportConfig): string {
    return entries.map(e => {
      if (config.includeTimestamps) {
        return `[${formatTime(e.timestamp)}] ${e.text}`;
      }
      return e.text;
    }).join('\n');
  }

  private groupByFile(entries: TranscriptEntry[]): Map<string, TranscriptEntry[]> {
    const grouped = new Map<string, TranscriptEntry[]>();
    for (const entry of entries) {
      const key = entry.activeFile || '';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(entry);
    }
    return grouped;
  }

  private getFileExtension(format: ExportFormat): string {
    switch (format) {
      case 'markdown': return '.md';
      case 'json': return '.json';
      case 'srt': return '.srt';
      case 'text': return '.txt';
    }
  }

  private getFileFilters(format: ExportFormat): Record<string, string[]> {
    switch (format) {
      case 'markdown': return { 'Markdown': ['md'] };
      case 'json': return { 'JSON': ['json'] };
      case 'srt': return { 'SRT Subtitles': ['srt'] };
      case 'text': return { 'Text': ['txt'] };
    }
  }
}

/** Singleton instance */
export const transcriptionExporter = new TranscriptionExporter();
