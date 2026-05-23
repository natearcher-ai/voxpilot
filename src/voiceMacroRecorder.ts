/**
 * Voice Macros Recorder — record a sequence of actions and replay them with a single phrase.
 *
 * Allows users to:
 *   - Start recording a macro: "start recording macro <name>"
 *   - Perform a sequence of voice commands and edits
 *   - Stop recording: "stop recording"
 *   - Replay later: say the macro name to execute all recorded steps
 *   - Edit macros (reorder, delete steps, add pauses)
 *   - Export/import macros as JSON
 *   - Share macros via the marketplace
 *
 * Macro steps can include:
 *   - Voice commands (undo, save, format, etc.)
 *   - Text insertions
 *   - VS Code command executions
 *   - Pauses (for timing-sensitive sequences)
 *   - Conditional steps (only run if file type matches)
 *
 * Enable via `voxpilot.macroRecorder.enabled` setting (default: true).
 */

import * as vscode from 'vscode';

/** Types of macro steps */
export type MacroStepType = 'text' | 'command' | 'voice-command' | 'pause' | 'conditional';

/** A single step in a macro */
export interface MacroStep {
  /** Step type */
  type: MacroStepType;
  /** Text to insert (for 'text' type) */
  text?: string;
  /** VS Code command ID (for 'command' type) */
  commandId?: string;
  /** Command arguments */
  commandArgs?: unknown;
  /** Voice command phrase (for 'voice-command' type) */
  voicePhrase?: string;
  /** Pause duration in ms (for 'pause' type) */
  pauseMs?: number;
  /** Condition for conditional steps */
  condition?: { languageId?: string; hasSelection?: boolean };
  /** Steps to execute if condition is met */
  thenSteps?: MacroStep[];
  /** Delay before this step in ms */
  delayMs?: number;
}

/** A recorded macro */
export interface VoiceMacro {
  /** Unique macro ID */
  id: string;
  /** Trigger phrase to activate the macro */
  triggerPhrase: string;
  /** Human-readable description */
  description: string;
  /** Sequence of steps */
  steps: MacroStep[];
  /** Created timestamp */
  createdAt: number;
  /** Last executed timestamp */
  lastExecutedAt: number;
  /** Execution count */
  executionCount: number;
  /** Whether the macro is enabled */
  enabled: boolean;
  /** Language filter (empty = all languages) */
  languages: string[];
  /** Tags for organization */
  tags: string[];
}

/** Recording session state */
export interface RecordingSession {
  /** Macro name being recorded */
  name: string;
  /** Steps recorded so far */
  steps: MacroStep[];
  /** Whether recording is active */
  active: boolean;
  /** Recording start time */
  startedAt: number;
}

/**
 * Voice Macros Recorder — records, stores, and replays macro sequences.
 */
export class VoiceMacroRecorder {
  private macros: Map<string, VoiceMacro> = new Map();
  private recording: RecordingSession | null = null;
  private context: vscode.ExtensionContext | undefined;

  /** Initialize with extension context */
  init(extensionContext: vscode.ExtensionContext): void {
    this.context = extensionContext;
    this.loadMacros();
  }

  /** Get all macros */
  getMacros(): VoiceMacro[] {
    return [...this.macros.values()];
  }

  /** Get enabled macros */
  getEnabledMacros(): VoiceMacro[] {
    return [...this.macros.values()].filter(m => m.enabled);
  }

  /** Get a macro by ID */
  getMacro(id: string): VoiceMacro | undefined {
    return this.macros.get(id);
  }

  /** Find a macro by trigger phrase */
  findByPhrase(phrase: string): VoiceMacro | undefined {
    const lower = phrase.toLowerCase().trim();
    return [...this.macros.values()].find(
      m => m.enabled && m.triggerPhrase.toLowerCase() === lower,
    );
  }

  /** Get macro count */
  get count(): number {
    return this.macros.size;
  }

  /** Start recording a new macro */
  startRecording(name: string): RecordingSession {
    this.recording = {
      name,
      steps: [],
      active: true,
      startedAt: Date.now(),
    };
    return this.recording;
  }

  /** Add a step to the current recording */
  addStep(step: MacroStep): boolean {
    if (!this.recording || !this.recording.active) return false;
    this.recording.steps.push(step);
    return true;
  }

  /** Stop recording and save the macro */
  stopRecording(triggerPhrase?: string, description?: string): VoiceMacro | null {
    if (!this.recording || !this.recording.active) return null;

    const macro: VoiceMacro = {
      id: `macro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      triggerPhrase: triggerPhrase || this.recording.name,
      description: description || `Macro: ${this.recording.name}`,
      steps: this.recording.steps,
      createdAt: Date.now(),
      lastExecutedAt: 0,
      executionCount: 0,
      enabled: true,
      languages: [],
      tags: [],
    };

    this.macros.set(macro.id, macro);
    this.recording = null;
    this.saveMacros();
    return macro;
  }

  /** Cancel the current recording */
  cancelRecording(): void {
    this.recording = null;
  }

  /** Get current recording session */
  getRecording(): RecordingSession | null {
    return this.recording;
  }

  /** Whether currently recording */
  isRecording(): boolean {
    return this.recording?.active ?? false;
  }

  /** Execute a macro by ID */
  async execute(id: string): Promise<boolean> {
    const macro = this.macros.get(id);
    if (!macro || !macro.enabled) return false;

    try {
      for (const step of macro.steps) {
        await this.executeStep(step);
      }

      macro.lastExecutedAt = Date.now();
      macro.executionCount++;
      this.saveMacros();
      return true;
    } catch {
      return false;
    }
  }

  /** Execute a macro by trigger phrase */
  async executeByPhrase(phrase: string): Promise<boolean> {
    const macro = this.findByPhrase(phrase);
    if (!macro) return false;
    return this.execute(macro.id);
  }

  /** Delete a macro */
  deleteMacro(id: string): boolean {
    if (!this.macros.has(id)) return false;
    this.macros.delete(id);
    this.saveMacros();
    return true;
  }

  /** Enable/disable a macro */
  setEnabled(id: string, enabled: boolean): boolean {
    const macro = this.macros.get(id);
    if (!macro) return false;
    macro.enabled = enabled;
    this.saveMacros();
    return true;
  }

  /** Update macro trigger phrase */
  setTriggerPhrase(id: string, phrase: string): boolean {
    const macro = this.macros.get(id);
    if (!macro) return false;
    macro.triggerPhrase = phrase;
    this.saveMacros();
    return true;
  }

  /** Add a step to an existing macro */
  addStepToMacro(id: string, step: MacroStep, index?: number): boolean {
    const macro = this.macros.get(id);
    if (!macro) return false;

    if (index !== undefined && index >= 0 && index <= macro.steps.length) {
      macro.steps.splice(index, 0, step);
    } else {
      macro.steps.push(step);
    }

    this.saveMacros();
    return true;
  }

  /** Remove a step from a macro */
  removeStep(id: string, stepIndex: number): boolean {
    const macro = this.macros.get(id);
    if (!macro || stepIndex < 0 || stepIndex >= macro.steps.length) return false;

    macro.steps.splice(stepIndex, 1);
    this.saveMacros();
    return true;
  }

  /** Export a macro as JSON */
  exportMacro(id: string): string | null {
    const macro = this.macros.get(id);
    if (!macro) return null;
    return JSON.stringify(macro, null, 2);
  }

  /** Import a macro from JSON */
  importMacro(json: string): VoiceMacro | null {
    try {
      const data = JSON.parse(json) as VoiceMacro;
      if (!data.triggerPhrase || !data.steps) return null;

      // Generate new ID
      data.id = `macro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      data.createdAt = Date.now();
      data.lastExecutedAt = 0;
      data.executionCount = 0;

      this.macros.set(data.id, data);
      this.saveMacros();
      return data;
    } catch {
      return null;
    }
  }

  /** Get most-used macros */
  getTopMacros(limit: number = 10): VoiceMacro[] {
    return [...this.macros.values()]
      .sort((a, b) => b.executionCount - a.executionCount)
      .slice(0, limit);
  }

  private async executeStep(step: MacroStep): Promise<void> {
    // Apply delay if specified
    if (step.delayMs && step.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, step.delayMs));
    }

    switch (step.type) {
      case 'text': {
        const editor = vscode.window.activeTextEditor;
        if (editor && step.text) {
          await editor.edit(eb => eb.insert(editor.selection.active, step.text!));
        }
        break;
      }
      case 'command': {
        if (step.commandId) {
          await vscode.commands.executeCommand(step.commandId, step.commandArgs);
        }
        break;
      }
      case 'pause': {
        if (step.pauseMs && step.pauseMs > 0) {
          await new Promise(resolve => setTimeout(resolve, step.pauseMs));
        }
        break;
      }
      case 'conditional': {
        if (step.condition && step.thenSteps) {
          const editor = vscode.window.activeTextEditor;
          let conditionMet = true;

          if (step.condition.languageId && editor) {
            conditionMet = editor.document.languageId === step.condition.languageId;
          }
          if (step.condition.hasSelection && editor) {
            conditionMet = conditionMet && !editor.selection.isEmpty;
          }

          if (conditionMet) {
            for (const subStep of step.thenSteps) {
              await this.executeStep(subStep);
            }
          }
        }
        break;
      }
    }
  }

  private loadMacros(): void {
    if (!this.context) return;
    const saved = this.context.globalState.get<Record<string, VoiceMacro>>('voiceMacros');
    if (saved) {
      this.macros = new Map(Object.entries(saved));
    }
  }

  private saveMacros(): void {
    if (!this.context) return;
    this.context.globalState.update('voiceMacros', Object.fromEntries(this.macros));
  }
}

/** Singleton instance */
export const voiceMacroRecorder = new VoiceMacroRecorder();
