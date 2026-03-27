/**
 * Pipeline settings UI — interactive QuickPick to reorder and toggle post-processors.
 *
 * Provides a command that shows the current pipeline order with enabled/disabled status,
 * and lets users move processors up/down or toggle them on/off. Changes are persisted
 * to voxpilot.postProcessors settings.
 */

import * as vscode from 'vscode';
import { PostProcessingPipeline } from './postProcessingPipeline';

interface ProcessorQuickPickItem extends vscode.QuickPickItem {
  processorId: string;
  index: number;
  enabled: boolean;
}

/**
 * Show the pipeline configuration QuickPick.
 * Returns when the user dismisses the picker.
 */
export async function showPipelineSettings(pipeline: PostProcessingPipeline): Promise<void> {
  // Loop: re-show the list after each action until the user dismisses
  while (true) {
    const processors = pipeline.getProcessorInfo();
    const items: ProcessorQuickPickItem[] = processors.map((p, i) => ({
      label: `${p.enabled ? '$(check)' : '$(circle-slash)'} ${i + 1}. ${p.name}`,
      description: p.enabled ? 'enabled' : 'disabled',
      detail: p.description,
      processorId: p.id,
      index: i,
      enabled: p.enabled,
    }));

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a processor to configure (Esc to close)',
      title: 'VoxPilot: Post-Processing Pipeline',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!pick) { break; } // User dismissed

    // Show actions for the selected processor
    const actions: Array<vscode.QuickPickItem & { action: string }> = [];

    if (pick.enabled) {
      actions.push({ label: '$(circle-slash) Disable', description: `Turn off ${pick.processorId}`, action: 'disable' });
    } else {
      actions.push({ label: '$(check) Enable', description: `Turn on ${pick.processorId}`, action: 'enable' });
    }

    if (pick.index > 0) {
      actions.push({ label: '$(arrow-up) Move Up', description: `Move before ${processors[pick.index - 1].name}`, action: 'up' });
    }
    if (pick.index < processors.length - 1) {
      actions.push({ label: '$(arrow-down) Move Down', description: `Move after ${processors[pick.index + 1].name}`, action: 'down' });
    }

    const actionPick = await vscode.window.showQuickPick(actions, {
      placeHolder: `Action for ${pick.processorId}`,
      title: `VoxPilot: ${pick.processorId}`,
    });

    if (!actionPick) { continue; } // Back to list

    // Read current settings
    const config = vscode.workspace.getConfiguration('voxpilot');
    const current = config.get<{ order?: string[]; disabled?: string[] }>('postProcessors') ?? {};
    const order = [...(processors.map(p => p.id))]; // current effective order
    const disabled = new Set(current.disabled ?? []);

    // Also remove from disabled if legacy toggles were the cause
    // (we only write to postProcessors.disabled, legacy toggles stay as-is)

    switch (actionPick.action) {
      case 'enable':
        disabled.delete(pick.processorId);
        break;
      case 'disable':
        disabled.add(pick.processorId);
        break;
      case 'up': {
        const idx = pick.index;
        [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
        break;
      }
      case 'down': {
        const idx = pick.index;
        [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
        break;
      }
    }

    // Persist
    await config.update('postProcessors', {
      order,
      disabled: [...disabled],
    }, vscode.ConfigurationTarget.Global);

    // Reload pipeline so next iteration reflects changes
    pipeline.reloadConfig();
  }
}
