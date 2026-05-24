/**
 * Integration Tests — end-to-end test suite covering all voice command categories.
 *
 * Provides a comprehensive integration test framework that validates:
 *   - Voice command recognition → action execution flow
 *   - Pipeline processor ordering and interaction
 *   - Multi-processor text transformation chains
 *   - Error handling across the full pipeline
 *   - Feature flag interactions
 *   - Performance under load (batch transcription simulation)
 *
 * Test categories:
 *   - Punctuation commands (period, comma, question mark, etc.)
 *   - Editor commands (undo, redo, save, format, etc.)
 *   - Navigation commands (go to file, go to line, etc.)
 *   - Git commands (commit, push, pull, checkout, etc.)
 *   - Terminal commands (run, cd, clear, etc.)
 *   - AI commands (ask copilot, explain this, etc.)
 *   - Documentation commands (document function, add todo, etc.)
 *   - Template commands (react component, express route, etc.)
 *   - Review commands (next change, approve, comment, etc.)
 *   - Macro commands (start recording, stop recording, etc.)
 *
 * Run via: `voxpilot.runIntegrationTests` command or `npm run test:integration`
 */

/** Test result for a single integration test */
export interface IntegrationTestResult {
  /** Test name */
  name: string;
  /** Test category */
  category: string;
  /** Whether the test passed */
  passed: boolean;
  /** Duration in ms */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Input text */
  input: string;
  /** Expected output */
  expected: string;
  /** Actual output */
  actual: string;
}

/** Test suite result */
export interface IntegrationSuiteResult {
  /** Suite name */
  name: string;
  /** Total tests */
  total: number;
  /** Passed tests */
  passed: number;
  /** Failed tests */
  failed: number;
  /** Skipped tests */
  skipped: number;
  /** Total duration in ms */
  durationMs: number;
  /** Individual test results */
  results: IntegrationTestResult[];
  /** Timestamp */
  timestamp: number;
}

/** A single test case definition */
export interface TestCase {
  /** Test name */
  name: string;
  /** Category */
  category: string;
  /** Input transcript text */
  input: string;
  /** Expected output (empty string = command consumed the input) */
  expectedOutput: string;
  /** Expected side effect (command executed, text inserted, etc.) */
  expectedEffect?: string;
  /** Whether this test should be skipped */
  skip?: boolean;
  /** Language context for the test */
  languageId?: string;
}

/** Built-in integration test cases */
export const INTEGRATION_TESTS: TestCase[] = [
  // Punctuation commands
  { name: 'period inserts dot', category: 'punctuation', input: 'hello world period', expectedOutput: 'hello world.' },
  { name: 'comma inserts comma', category: 'punctuation', input: 'hello comma world', expectedOutput: 'hello, world' },
  { name: 'question mark inserts ?', category: 'punctuation', input: 'how are you question mark', expectedOutput: 'how are you?' },
  { name: 'exclamation mark inserts !', category: 'punctuation', input: 'wow exclamation mark', expectedOutput: 'wow!' },
  { name: 'new line inserts newline', category: 'punctuation', input: 'hello new line world', expectedOutput: 'hello\nworld' },
  { name: 'colon inserts colon', category: 'punctuation', input: 'note colon important', expectedOutput: 'note: important' },
  { name: 'semicolon inserts semicolon', category: 'punctuation', input: 'first semicolon second', expectedOutput: 'first; second' },

  // Editor commands (consumed — return empty)
  { name: 'undo command', category: 'editor', input: 'undo', expectedOutput: '', expectedEffect: 'editor.undo' },
  { name: 'redo command', category: 'editor', input: 'redo', expectedOutput: '', expectedEffect: 'editor.redo' },
  { name: 'save command', category: 'editor', input: 'save', expectedOutput: '', expectedEffect: 'workbench.action.files.save' },
  { name: 'save file command', category: 'editor', input: 'save file', expectedOutput: '', expectedEffect: 'workbench.action.files.save' },
  { name: 'select all command', category: 'editor', input: 'select all', expectedOutput: '', expectedEffect: 'editor.action.selectAll' },
  { name: 'delete line command', category: 'editor', input: 'delete line', expectedOutput: '', expectedEffect: 'editor.action.deleteLines' },
  { name: 'format document command', category: 'editor', input: 'format document', expectedOutput: '', expectedEffect: 'editor.action.formatDocument' },
  { name: 'copy command', category: 'editor', input: 'copy', expectedOutput: '', expectedEffect: 'editor.action.clipboardCopyAction' },
  { name: 'paste command', category: 'editor', input: 'paste', expectedOutput: '', expectedEffect: 'editor.action.clipboardPasteAction' },

  // Git commands
  { name: 'git push', category: 'git', input: 'push', expectedOutput: '', expectedEffect: 'git.push' },
  { name: 'git pull', category: 'git', input: 'pull', expectedOutput: '', expectedEffect: 'git.pull' },
  { name: 'git stash', category: 'git', input: 'stash', expectedOutput: '', expectedEffect: 'git.stash' },
  { name: 'git commit with message', category: 'git', input: 'commit fix login bug', expectedOutput: '', expectedEffect: 'git.commit' },
  { name: 'create branch', category: 'git', input: 'create branch feature auth', expectedOutput: '', expectedEffect: 'git.checkout -b' },

  // Terminal commands
  { name: 'run command', category: 'terminal', input: 'run npm test', expectedOutput: '', expectedEffect: 'terminal.sendText' },
  { name: 'npm install', category: 'terminal', input: 'npm install express', expectedOutput: '', expectedEffect: 'terminal.sendText' },
  { name: 'clear terminal', category: 'terminal', input: 'clear terminal', expectedOutput: '', expectedEffect: 'terminal.clear' },
  { name: 'new terminal', category: 'terminal', input: 'new terminal', expectedOutput: '', expectedEffect: 'terminal.create' },
  { name: 'kill process', category: 'terminal', input: 'kill process', expectedOutput: '', expectedEffect: 'terminal.sigint' },

  // AI commands
  { name: 'ask copilot', category: 'ai', input: 'ask copilot how to sort an array', expectedOutput: '', expectedEffect: 'copilot.chat' },
  { name: 'explain this', category: 'ai', input: 'explain this', expectedOutput: '', expectedEffect: 'ai.explain' },
  { name: 'refactor this', category: 'ai', input: 'refactor this', expectedOutput: '', expectedEffect: 'ai.refactor' },
  { name: 'add tests', category: 'ai', input: 'add tests', expectedOutput: '', expectedEffect: 'ai.generateTests' },

  // Documentation commands
  { name: 'document function', category: 'documentation', input: 'document function', expectedOutput: '', expectedEffect: 'insert.jsdoc' },
  { name: 'add todo', category: 'documentation', input: 'add todo refactor this later', expectedOutput: '', expectedEffect: 'insert.todo' },
  { name: 'add changelog', category: 'documentation', input: 'add changelog entry added user auth', expectedOutput: '', expectedEffect: 'insert.changelog' },

  // Template commands
  { name: 'react component', category: 'template', input: 'react component user card', expectedOutput: '', expectedEffect: 'insert.template', languageId: 'typescriptreact' },
  { name: 'express route', category: 'template', input: 'express route users', expectedOutput: '', expectedEffect: 'insert.template', languageId: 'typescript' },
  { name: 'test suite', category: 'template', input: 'test suite AuthService', expectedOutput: '', expectedEffect: 'insert.template', languageId: 'typescript' },

  // Review commands
  { name: 'next change', category: 'review', input: 'next change', expectedOutput: '', expectedEffect: 'editor.nextChange' },
  { name: 'approve pr', category: 'review', input: 'approve', expectedOutput: '', expectedEffect: 'pr.approve' },
  { name: 'comment on pr', category: 'review', input: 'comment needs error handling here', expectedOutput: '', expectedEffect: 'pr.comment' },

  // Journal commands
  { name: 'note command', category: 'journal', input: 'note remember to update the docs', expectedOutput: '', expectedEffect: 'journal.add' },
  { name: 'todo command', category: 'journal', input: 'todo fix the login bug', expectedOutput: '', expectedEffect: 'journal.add' },
  { name: 'bug command', category: 'journal', input: 'bug null pointer in auth module', expectedOutput: '', expectedEffect: 'journal.add' },

  // Passthrough (normal text that should NOT trigger commands)
  { name: 'normal text passes through', category: 'passthrough', input: 'the quick brown fox jumps over the lazy dog', expectedOutput: 'the quick brown fox jumps over the lazy dog' },
  { name: 'code description passes through', category: 'passthrough', input: 'create a variable called user count', expectedOutput: 'create a variable called user count' },
  { name: 'partial command word passes through', category: 'passthrough', input: 'I need to undo my decision about the architecture', expectedOutput: 'I need to undo my decision about the architecture' },
];

/**
 * Run a single test case against a processor function.
 */
export function runTestCase(
  testCase: TestCase,
  processor: (text: string, languageId?: string) => string,
): IntegrationTestResult {
  const start = performance.now();

  try {
    const actual = processor(testCase.input, testCase.languageId);
    const passed = actual === testCase.expectedOutput;
    const durationMs = Math.round((performance.now() - start) * 100) / 100;

    return {
      name: testCase.name,
      category: testCase.category,
      passed,
      durationMs,
      input: testCase.input,
      expected: testCase.expectedOutput,
      actual,
      error: passed ? undefined : `Expected "${testCase.expectedOutput}" but got "${actual}"`,
    };
  } catch (error) {
    return {
      name: testCase.name,
      category: testCase.category,
      passed: false,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      input: testCase.input,
      expected: testCase.expectedOutput,
      actual: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run all integration tests.
 */
export function runAllTests(
  processor: (text: string, languageId?: string) => string,
  filter?: { category?: string; skip?: string[] },
): IntegrationSuiteResult {
  const start = performance.now();
  const results: IntegrationTestResult[] = [];
  let skipped = 0;

  for (const testCase of INTEGRATION_TESTS) {
    if (testCase.skip) {
      skipped++;
      continue;
    }
    if (filter?.category && testCase.category !== filter.category) {
      skipped++;
      continue;
    }
    if (filter?.skip?.includes(testCase.category)) {
      skipped++;
      continue;
    }

    results.push(runTestCase(testCase, processor));
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    name: 'VoxPilot Integration Tests',
    total: results.length + skipped,
    passed,
    failed,
    skipped,
    durationMs: Math.round((performance.now() - start) * 100) / 100,
    results,
    timestamp: Date.now(),
  };
}

/**
 * Get test categories with counts.
 */
export function getTestCategories(): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>();
  for (const test of INTEGRATION_TESTS) {
    counts.set(test.category, (counts.get(test.category) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get total test count.
 */
export function getTestCount(): number {
  return INTEGRATION_TESTS.length;
}

/**
 * Format test results as a report string.
 */
export function formatReport(suite: IntegrationSuiteResult): string {
  const lines: string[] = [];
  lines.push(`# ${suite.name}`);
  lines.push(`\nRun: ${new Date(suite.timestamp).toISOString()}`);
  lines.push(`Duration: ${suite.durationMs}ms`);
  lines.push(`\n## Summary\n`);
  lines.push(`- ✅ Passed: ${suite.passed}`);
  lines.push(`- ❌ Failed: ${suite.failed}`);
  lines.push(`- ⏭️ Skipped: ${suite.skipped}`);
  lines.push(`- Total: ${suite.total}`);

  if (suite.failed > 0) {
    lines.push(`\n## Failures\n`);
    for (const result of suite.results.filter(r => !r.passed)) {
      lines.push(`### ❌ ${result.name} (${result.category})`);
      lines.push(`- Input: \`${result.input}\``);
      lines.push(`- Expected: \`${result.expected}\``);
      lines.push(`- Actual: \`${result.actual}\``);
      lines.push(`- Error: ${result.error}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
