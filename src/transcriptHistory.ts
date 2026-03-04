import * as vscode from 'vscode';

export interface TranscriptEntry {
  text: string;
  timestamp: number;
}

const MAX_ENTRIES = 10;

export class TranscriptHistory {
  private entries: TranscriptEntry[] = [];
  private storageKey = 'voxpilot.transcriptHistory';

  constructor(private context: vscode.ExtensionContext) {
    this.entries = context.globalState.get<TranscriptEntry[]>(this.storageKey, []);
  }

  add(text: string): void {
    this.entries.unshift({ text, timestamp: Date.now() });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES);
    }
    this.context.globalState.update(this.storageKey, this.entries);
  }

  getAll(): TranscriptEntry[] {
    return this.entries;
  }

  async showQuickPick(): Promise<string | undefined> {
    if (this.entries.length === 0) {
      vscode.window.showInformationMessage('VoxPilot: No transcript history yet.');
      return undefined;
    }

    const items = this.entries.map((entry, i) => {
      const time = new Date(entry.timestamp);
      const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = time.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const truncated = entry.text.length > 80 ? entry.text.slice(0, 80) + '…' : entry.text;
      return {
        label: `$(comment) ${truncated}`,
        description: `${dateStr} ${timeStr}`,
        index: i,
      };
    });

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a transcript to re-send',
    });

    return pick ? this.entries[pick.index].text : undefined;
  }
}
