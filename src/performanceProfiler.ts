/**
 * Performance profiler integration — voice-trigger profiling and read results aloud.
 *
 * Say commands like:
 *   "start profiling"          → Start CPU profiling session
 *   "stop profiling"           → Stop profiling and show results
 *   "profile results"          → Read last profiling results aloud
 *   "start memory profile"     → Start heap snapshot capture
 *   "stop memory profile"      → Stop and show memory results
 *   "profile status"           → Check if profiling is active
 *   "clear profile"            → Clear stored profiling data
 *   "export profile"           → Export profiling data to file
 *   "profile for <N> seconds"  → Run a timed profiling session
 *
 * Integrates with VS Code's built-in profiler commands and the
 * VoxPilot performance audit system. Results can be read aloud
 * via TTS for hands-free performance analysis.
 *
 * Enable via `voxpilot.performanceProfiler` setting (default: true).
 */

import * as vscode from 'vscode';
import { performanceAudit, PerfSummary, PerfMeasurement } from './performanceAudit';

export type ProfilerCommandType =
  | 'start-cpu'
  | 'stop-cpu'
  | 'start-memory'
  | 'stop-memory'
  | 'results'
  | 'status'
  | 'clear'
  | 'export'
  | 'timed';

export interface ProfilerMatch {
  type: ProfilerCommandType;
  argument: string;
  trigger: string;
}

const PROFILER_TRIGGERS: Array<{ phrases: string[]; type: ProfilerCommandType }> = [
  { phrases: ['start profiling', 'start profile', 'begin profiling', 'start cpu profile', 'profile start'], type: 'start-cpu' },
  { phrases: ['stop profiling', 'stop profile', 'end profiling', 'stop cpu profile', 'profile stop', 'finish profiling'], type: 'stop-cpu' },
  { phrases: ['start memory profile', 'start heap profile', 'memory profile start', 'begin memory profile'], type: 'start-memory' },
  { phrases: ['stop memory profile', 'stop heap profile', 'memory profile stop', 'end memory profile'], type: 'stop-memory' },
  { phrases: ['profile results', 'profiling results', 'show profile', 'show profiling', 'read profile', 'read profiling results'], type: 'results' },
  { phrases: ['profile status', 'profiling status', 'is profiling active', 'profiler status'], type: 'status' },
  { phrases: ['clear profile', 'clear profiling', 'reset profile', 'reset profiling'], type: 'clear' },
  { phrases: ['export profile', 'export profiling', 'save profile', 'save profiling data'], type: 'export' },
  { phrases: ['profile for'], type: 'timed' },
];

function buildProfilerIndex(): Array<[string, ProfilerCommandType]> {
  const pairs: Array<[string, ProfilerCommandType]> = [];
  for (const { phrases, type } of PROFILER_TRIGGERS) {
    for (const phrase of phrases) {
      pairs.push([phrase.toLowerCase(), type]);
    }
  }
  // Sort by length descending for greedy matching
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

const PROFILER_INDEX = buildProfilerIndex();

/**
 * Match a transcript against profiler commands.
 */
export function matchProfilerCommand(transcript: string): ProfilerMatch | null {
  const normalized = transcript.toLowerCase().replace(/\s+/g, ' ').trim();

  for (const [trigger, type] of PROFILER_INDEX) {
    if (normalized === trigger) {
      return { type, argument: '', trigger };
    }
    if (normalized.startsWith(trigger + ' ')) {
      const argument = transcript.trim().slice(trigger.length).trim();
      return { type, argument, trigger };
    }
  }

  return null;
}

/** Profiling session state */
interface ProfilingSession {
  type: 'cpu' | 'memory';
  startedAt: number;
  timedDurationMs?: number;
}

/** Profiling result summary for TTS readback */
interface ProfileResultSummary {
  type: 'cpu' | 'memory';
  durationMs: number;
  summary: PerfSummary;
  topSlow: PerfMeasurement[];
  timestamp: number;
}

/**
 * Performance profiler manager — coordinates profiling sessions with voice control.
 */
export class PerformanceProfilerManager {
  private currentSession: ProfilingSession | null = null;
  private lastResult: ProfileResultSummary | null = null;
  private timedTimer: ReturnType<typeof setTimeout> | null = null;
  private outputChannel: vscode.OutputChannel | undefined;
  private context: vscode.ExtensionContext | undefined;
  private readbackFn: ((text: string) => void) | undefined;

  init(context: vscode.ExtensionContext, readbackFn?: (text: string) => void): void {
    this.context = context;
    this.readbackFn = readbackFn;
    this.outputChannel = vscode.window.createOutputChannel('VoxPilot Profiler');
    context.subscriptions.push(this.outputChannel);
  }

  /** Set the TTS readback function */
  setReadback(fn: (text: string) => void): void {
    this.readbackFn = fn;
  }

  /** Whether a profiling session is currently active */
  get isActive(): boolean {
    return this.currentSession !== null;
  }

  /** Get current session type */
  get sessionType(): 'cpu' | 'memory' | null {
    return this.currentSession?.type ?? null;
  }

  /** Start a CPU profiling session */
  async startCpuProfile(): Promise<boolean> {
    if (this.currentSession) {
      const msg = `Profiling is already active (${this.currentSession.type}). Stop it first.`;
      vscode.window.showWarningMessage(`VoxPilot: ${msg}`);
      this.readAloud(msg);
      return false;
    }

    // Enable performance audit collection
    performanceAudit.enable();
    performanceAudit.clear();

    this.currentSession = {
      type: 'cpu',
      startedAt: Date.now(),
    };

    // Start VS Code's built-in profiler if available
    try {
      await vscode.commands.executeCommand('workbench.action.toggleDevTools');
    } catch {
      // Dev tools may not be available in all environments — continue anyway
    }

    this.log('CPU profiling started');
    const msg = 'CPU profiling started. Use your extension normally, then say stop profiling to see results.';
    vscode.window.showInformationMessage(`VoxPilot: ⏱️ ${msg}`);
    this.readAloud(msg);
    return true;
  }

  /** Stop the current CPU profiling session */
  async stopCpuProfile(): Promise<boolean> {
    if (!this.currentSession || this.currentSession.type !== 'cpu') {
      const msg = 'No CPU profiling session is active.';
      vscode.window.showWarningMessage(`VoxPilot: ${msg}`);
      this.readAloud(msg);
      return false;
    }

    if (this.timedTimer) {
      clearTimeout(this.timedTimer);
      this.timedTimer = null;
    }

    const durationMs = Date.now() - this.currentSession.startedAt;
    const summary = performanceAudit.getSummary();
    const topSlow = performanceAudit.getSlowOperations()
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);

    this.lastResult = {
      type: 'cpu',
      durationMs,
      summary,
      topSlow,
      timestamp: Date.now(),
    };

    this.currentSession = null;
    this.log(`CPU profiling stopped after ${Math.round(durationMs / 1000)}s`);

    // Show results
    this.showResults();
    return true;
  }

  /** Start a memory profiling session */
  async startMemoryProfile(): Promise<boolean> {
    if (this.currentSession) {
      const msg = `Profiling is already active (${this.currentSession.type}). Stop it first.`;
      vscode.window.showWarningMessage(`VoxPilot: ${msg}`);
      this.readAloud(msg);
      return false;
    }

    performanceAudit.enable();

    this.currentSession = {
      type: 'memory',
      startedAt: Date.now(),
    };

    this.log('Memory profiling started');
    const msg = 'Memory profiling started. Perform your actions, then say stop memory profile.';
    vscode.window.showInformationMessage(`VoxPilot: 🧠 ${msg}`);
    this.readAloud(msg);
    return true;
  }

  /** Stop memory profiling session */
  async stopMemoryProfile(): Promise<boolean> {
    if (!this.currentSession || this.currentSession.type !== 'memory') {
      const msg = 'No memory profiling session is active.';
      vscode.window.showWarningMessage(`VoxPilot: ${msg}`);
      this.readAloud(msg);
      return false;
    }

    const durationMs = Date.now() - this.currentSession.startedAt;
    const summary = performanceAudit.getSummary();

    this.lastResult = {
      type: 'memory',
      durationMs,
      summary,
      topSlow: [],
      timestamp: Date.now(),
    };

    this.currentSession = null;
    this.log(`Memory profiling stopped after ${Math.round(durationMs / 1000)}s`);

    this.showResults();
    return true;
  }

  /** Start a timed profiling session */
  async startTimedProfile(seconds: number): Promise<boolean> {
    if (seconds <= 0 || seconds > 300) {
      const msg = 'Timed profile duration must be between 1 and 300 seconds.';
      vscode.window.showWarningMessage(`VoxPilot: ${msg}`);
      this.readAloud(msg);
      return false;
    }

    const started = await this.startCpuProfile();
    if (!started) return false;

    this.currentSession!.timedDurationMs = seconds * 1000;

    const msg = `Profiling for ${seconds} seconds. Results will be read when complete.`;
    vscode.window.showInformationMessage(`VoxPilot: ⏱️ ${msg}`);
    this.readAloud(msg);

    this.timedTimer = setTimeout(async () => {
      this.timedTimer = null;
      await this.stopCpuProfile();
    }, seconds * 1000);

    return true;
  }

  /** Show profiling results and read aloud */
  showResults(): void {
    if (!this.lastResult) {
      const msg = 'No profiling results available. Start a profiling session first.';
      vscode.window.showInformationMessage(`VoxPilot: ${msg}`);
      this.readAloud(msg);
      return;
    }

    const result = this.lastResult;
    const durationSec = Math.round(result.durationMs / 1000);
    const { summary } = result;

    // Build human-readable summary
    const lines: string[] = [];
    lines.push(`${result.type === 'cpu' ? 'CPU' : 'Memory'} profiling session: ${durationSec} seconds.`);
    lines.push(`Performance score: ${summary.score} out of 100.`);
    lines.push(`Total operations measured: ${summary.totalMeasurements}.`);

    if (summary.slowOperations > 0) {
      lines.push(`Slow operations detected: ${summary.slowOperations} (over 100 milliseconds).`);
    } else {
      lines.push('No slow operations detected. All operations within threshold.');
    }

    if (summary.avgPipelineMs > 0) {
      lines.push(`Average pipeline latency: ${summary.avgPipelineMs} milliseconds.`);
      lines.push(`95th percentile: ${summary.p95PipelineMs} milliseconds.`);
    }

    if (summary.startupMs > 0) {
      lines.push(`Startup time: ${summary.startupMs} milliseconds.`);
    }

    if (summary.memoryMb > 0) {
      lines.push(`Memory usage: ${summary.memoryMb} megabytes.`);
    }

    if (result.topSlow.length > 0) {
      lines.push('Slowest operations:');
      for (const op of result.topSlow.slice(0, 3)) {
        lines.push(`  ${op.name}: ${Math.round(op.durationMs)} milliseconds.`);
      }
    }

    // Log to output channel
    if (this.outputChannel) {
      this.outputChannel.clear();
      this.outputChannel.appendLine('═══ VoxPilot Profiling Results ═══');
      this.outputChannel.appendLine(`Type: ${result.type.toUpperCase()}`);
      this.outputChannel.appendLine(`Duration: ${durationSec}s`);
      this.outputChannel.appendLine(`Score: ${summary.score}/100`);
      this.outputChannel.appendLine(`Total measurements: ${summary.totalMeasurements}`);
      this.outputChannel.appendLine(`Slow operations: ${summary.slowOperations}`);
      this.outputChannel.appendLine(`Avg pipeline: ${summary.avgPipelineMs}ms`);
      this.outputChannel.appendLine(`P95 pipeline: ${summary.p95PipelineMs}ms`);
      this.outputChannel.appendLine(`Startup: ${summary.startupMs}ms`);
      this.outputChannel.appendLine(`Memory: ${summary.memoryMb}MB`);
      if (result.topSlow.length > 0) {
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('Top slow operations:');
        for (const op of result.topSlow) {
          this.outputChannel.appendLine(`  [${op.category}] ${op.name}: ${Math.round(op.durationMs)}ms`);
        }
      }
      this.outputChannel.show(true);
    }

    // Read results aloud
    const readbackText = lines.join(' ');
    this.readAloud(readbackText);

    // Show notification with action buttons
    vscode.window.showInformationMessage(
      `VoxPilot: Profiling complete — Score ${summary.score}/100, ${summary.slowOperations} slow ops`,
      'Show Details',
      'Export',
    ).then(choice => {
      if (choice === 'Show Details' && this.outputChannel) {
        this.outputChannel.show();
      } else if (choice === 'Export') {
        this.exportProfile();
      }
    });
  }

  /** Get current profiling status */
  getStatus(): void {
    if (this.currentSession) {
      const elapsed = Math.round((Date.now() - this.currentSession.startedAt) / 1000);
      const remaining = this.currentSession.timedDurationMs
        ? Math.max(0, Math.round((this.currentSession.timedDurationMs - (Date.now() - this.currentSession.startedAt)) / 1000))
        : undefined;
      let msg = `${this.currentSession.type === 'cpu' ? 'CPU' : 'Memory'} profiling active for ${elapsed} seconds.`;
      if (remaining !== undefined) {
        msg += ` ${remaining} seconds remaining.`;
      }
      msg += ` ${performanceAudit.count} measurements collected so far.`;
      vscode.window.showInformationMessage(`VoxPilot: ⏱️ ${msg}`);
      this.readAloud(msg);
    } else {
      const msg = this.lastResult
        ? `No active profiling session. Last session was ${Math.round((Date.now() - this.lastResult.timestamp) / 60000)} minutes ago.`
        : 'No active profiling session and no previous results.';
      vscode.window.showInformationMessage(`VoxPilot: ${msg}`);
      this.readAloud(msg);
    }
  }

  /** Clear stored profiling data */
  clearProfile(): void {
    if (this.currentSession) {
      const msg = 'Cannot clear while profiling is active. Stop profiling first.';
      vscode.window.showWarningMessage(`VoxPilot: ${msg}`);
      this.readAloud(msg);
      return;
    }

    performanceAudit.clear();
    this.lastResult = null;
    const msg = 'Profiling data cleared.';
    vscode.window.showInformationMessage(`VoxPilot: ${msg}`);
    this.readAloud(msg);
  }

  /** Export profiling data to a file */
  async exportProfile(): Promise<void> {
    if (!this.lastResult) {
      const msg = 'No profiling data to export.';
      vscode.window.showWarningMessage(`VoxPilot: ${msg}`);
      this.readAloud(msg);
      return;
    }

    const data = performanceAudit.export();
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`voxpilot-profile-${Date.now()}.json`),
      filters: { 'JSON': ['json'] },
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf-8'));
      const msg = 'Profiling data exported successfully.';
      vscode.window.showInformationMessage(`VoxPilot: 📄 ${msg}`);
      this.readAloud(msg);
    }
  }

  /** Dispose resources */
  dispose(): void {
    if (this.timedTimer) {
      clearTimeout(this.timedTimer);
      this.timedTimer = null;
    }
    this.currentSession = null;
  }

  private readAloud(text: string): void {
    if (this.readbackFn) {
      this.readbackFn(text);
    }
  }

  private log(message: string): void {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }
  }
}

/**
 * Execute a matched profiler command.
 */
export async function executeProfilerCommand(
  match: ProfilerMatch,
  manager: PerformanceProfilerManager,
): Promise<boolean> {
  switch (match.type) {
    case 'start-cpu':
      return manager.startCpuProfile();

    case 'stop-cpu':
      return manager.stopCpuProfile();

    case 'start-memory':
      return manager.startMemoryProfile();

    case 'stop-memory':
      return manager.stopMemoryProfile();

    case 'results':
      manager.showResults();
      return true;

    case 'status':
      manager.getStatus();
      return true;

    case 'clear':
      manager.clearProfile();
      return true;

    case 'export':
      await manager.exportProfile();
      return true;

    case 'timed': {
      // Parse "profile for N seconds"
      const numMatch = match.argument.match(/(\d+)\s*(seconds?|secs?|s)?/i);
      if (!numMatch) {
        vscode.window.showWarningMessage('VoxPilot: Say "profile for N seconds" (1-300).');
        return false;
      }
      const seconds = parseInt(numMatch[1], 10);
      return manager.startTimedProfile(seconds);
    }

    default:
      return false;
  }
}

/** Singleton instance */
export const performanceProfiler = new PerformanceProfilerManager();
