/**
 * Voice-driven test runner — control VS Code test execution by voice.
 *
 * Say commands like:
 *   "run tests"                  → Run all tests in workspace
 *   "run all tests"              → Run all tests in workspace
 *   "run test"                   → Run test at cursor
 *   "run current test"           → Run test at cursor
 *   "run failing tests"          → Re-run only previously failed tests
 *   "run failed tests"           → Re-run only previously failed tests
 *   "run test file"              → Run all tests in the current file
 *   "run this file tests"        → Run all tests in the current file
 *   "debug test"                 → Debug test at cursor
 *   "debug tests"                → Debug all tests
 *   "stop tests"                 → Cancel running test execution
 *   "cancel tests"               → Cancel running test execution
 *   "show coverage"              → Show test coverage overlay
 *   "hide coverage"              → Hide test coverage overlay
 *   "toggle coverage"            → Toggle test coverage display
 *   "show test results"          → Focus the test results panel
 *   "show test explorer"         → Focus the test explorer panel
 *   "refresh tests"              → Refresh/rediscover tests
 *   "go to test"                 → Navigate to test at cursor or by name
 *   "go to test failure"         → Navigate to first test failure
 *
 * Enable via `voxpilot.voiceTestRunner` setting (default: true).
 */

import * as vscode from 'vscode';

export type TestCommandType =
  | 'run-all' | 'run-current' | 'run-failing' | 'run-file'
  | 'debug-current' | 'debug-all'
  | 'stop' | 'show-coverage' | 'hide-coverage' | 'toggle-coverage'
  | 'show-results' | 'show-explorer' | 'refresh'
  | 'go-to-test' | 'go-to-failure';

export interface TestMatch {
  type: TestCommandType;
  argument: string;
  trigger: string;
}

const TEST_TRIGGERS: Array<{ phrases: string[]; type: TestCommandType }> = [
  // Run tests
  { phrases: ['run all tests', 'run tests', 'run the tests', 'execute tests', 'test all'], type: 'run-all' },
  { phrases: ['run current test', 'run test', 'run this test', 'test this', 'run nearest test'], type: 'run-current' },
  { phrases: ['run failing tests', 'run failed tests', 'rerun failures', 'run failures', 'retry failed'], type: 'run-failing' },
  { phrases: ['run test file', 'run file tests', 'run this file tests', 'test this file', 'run tests in file'], type: 'run-file' },

  // Debug tests
  { phrases: ['debug test', 'debug current test', 'debug this test', 'debug nearest test'], type: 'debug-current' },
  { phrases: ['debug all tests', 'debug tests'], type: 'debug-all' },

  // Stop
  { phrases: ['stop tests', 'cancel tests', 'stop test run', 'abort tests', 'cancel test run'], type: 'stop' },

  // Coverage
  { phrases: ['show coverage', 'show test coverage', 'display coverage', 'coverage on'], type: 'show-coverage' },
  { phrases: ['hide coverage', 'hide test coverage', 'coverage off', 'clear coverage'], type: 'hide-coverage' },
  { phrases: ['toggle coverage', 'toggle test coverage'], type: 'toggle-coverage' },

  // Panels
  { phrases: ['show test results', 'open test results', 'test results', 'show results'], type: 'show-results' },
  { phrases: ['show test explorer', 'open test explorer', 'test explorer', 'show tests'], type: 'show-explorer' },

  // Refresh
  { phrases: ['refresh tests', 'rediscover tests', 'reload tests', 'rescan tests'], type: 'refresh' },

  // Navigation
  { phrases: ['go to test failure', 'go to failure', 'next failure', 'show failure'], type: 'go-to-failure' },
  { phrases: ['go to test', 'navigate to test', 'find test'], type: 'go-to-test' },
];

function buildTestIndex(): Array<[string, TestCommandType]> {
  const pairs: Array<[string, TestCommandType]> = [];
  for (const { phrases, type } of TEST_TRIGGERS) {
    for (const phrase of phrases) {
      pairs.push([phrase.toLowerCase(), type]);
    }
  }
  // Sort by length descending for greedy matching (longest phrase first)
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

const TEST_INDEX = buildTestIndex();

/**
 * Match a transcript against test runner commands.
 */
export function matchTestCommand(transcript: string): TestMatch | null {
  const normalized = transcript.toLowerCase().replace(/\s+/g, ' ').trim();

  for (const [trigger, type] of TEST_INDEX) {
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

/**
 * Execute a matched test command via VS Code's testing API and commands.
 */
export async function executeTestCommand(match: TestMatch): Promise<boolean> {
  try {
    switch (match.type) {
      // Run tests
      case 'run-all':
        await vscode.commands.executeCommand('testing.runAll');
        vscode.window.showInformationMessage('VoxPilot: Running all tests…');
        return true;

      case 'run-current':
        await vscode.commands.executeCommand('testing.runAtCursor');
        return true;

      case 'run-failing':
        await vscode.commands.executeCommand('testing.reRunFailTests');
        vscode.window.showInformationMessage('VoxPilot: Re-running failed tests…');
        return true;

      case 'run-file': {
        // Run all tests in the current file
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('VoxPilot: No active editor to run file tests from.');
          return false;
        }
        await vscode.commands.executeCommand('testing.runCurrentFile');
        return true;
      }

      // Debug tests
      case 'debug-current':
        await vscode.commands.executeCommand('testing.debugAtCursor');
        return true;

      case 'debug-all':
        await vscode.commands.executeCommand('testing.debugAll');
        vscode.window.showInformationMessage('VoxPilot: Debugging all tests…');
        return true;

      // Stop
      case 'stop':
        await vscode.commands.executeCommand('testing.cancelRun');
        vscode.window.showInformationMessage('VoxPilot: Test run cancelled.');
        return true;

      // Coverage
      case 'show-coverage':
        await vscode.commands.executeCommand('testing.coverageAll');
        return true;

      case 'hide-coverage':
        await vscode.commands.executeCommand('testing.coverage.close');
        return true;

      case 'toggle-coverage':
        await vscode.commands.executeCommand('testing.coverageToggleInline');
        return true;

      // Panels
      case 'show-results':
        await vscode.commands.executeCommand('testing.openOutputPeek');
        return true;

      case 'show-explorer':
        await vscode.commands.executeCommand('workbench.view.testing.focus');
        return true;

      // Refresh
      case 'refresh':
        await vscode.commands.executeCommand('testing.refreshTests');
        vscode.window.showInformationMessage('VoxPilot: Refreshing tests…');
        return true;

      // Navigation
      case 'go-to-failure':
        await vscode.commands.executeCommand('testing.goToNextMessage');
        return true;

      case 'go-to-test': {
        if (!match.argument) {
          // Open test explorer for manual selection
          await vscode.commands.executeCommand('workbench.view.testing.focus');
          return true;
        }
        // Try to find and open the test by name using workspace symbol search
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
          'vscode.executeWorkspaceSymbolProvider',
          match.argument,
        );
        if (symbols && symbols.length > 0) {
          // Filter for test-like symbols (functions/methods containing the search term)
          const testSymbol = symbols.find(s =>
            s.name.toLowerCase().includes(match.argument.toLowerCase()) &&
            (s.kind === vscode.SymbolKind.Function || s.kind === vscode.SymbolKind.Method),
          );
          if (testSymbol) {
            const doc = await vscode.workspace.openTextDocument(testSymbol.location.uri);
            await vscode.window.showTextDocument(doc, {
              selection: testSymbol.location.range,
            });
            return true;
          }
        }
        // Fallback: open test explorer
        await vscode.commands.executeCommand('workbench.view.testing.focus');
        vscode.window.showInformationMessage(`VoxPilot: Could not find test "${match.argument}" — showing test explorer.`);
        return true;
      }

      default:
        return false;
    }
  } catch (err: any) {
    vscode.window.showWarningMessage(`VoxPilot: Test command "${match.trigger}" failed — ${err.message}`);
    return false;
  }
}
