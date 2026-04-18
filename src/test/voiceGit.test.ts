import { describe, it, expect, vi } from 'vitest';
import { matchGitCommand, buildGitCommand, sanitizeBranchName } from '../voiceGit';

// Mock vscode
vi.mock('vscode', () => ({
  commands: { executeCommand: async () => {} },
  window: {
    activeTerminal: undefined,
    createTerminal: () => ({ show: () => {}, sendText: () => {} }),
    showWarningMessage: async () => 'Yes, proceed',
  },
}));

describe('matchGitCommand', () => {
  it('matches "commit" with message', () => {
    const result = matchGitCommand('commit fix login bug');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('commit');
    expect(result!.argument).toBe('fix login bug');
  });

  it('matches "push"', () => {
    const result = matchGitCommand('push');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('push');
  });

  it('matches "pull"', () => {
    const result = matchGitCommand('pull');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('pull');
  });

  it('matches "stash pop" before "stash" (greedy)', () => {
    const result = matchGitCommand('stash pop');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('stash-pop');
  });

  it('matches "stash" alone', () => {
    const result = matchGitCommand('stash');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('stash');
  });

  it('matches "checkout" with branch', () => {
    const result = matchGitCommand('checkout main');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('checkout');
    expect(result!.argument).toBe('main');
  });

  it('matches "create branch" with name', () => {
    const result = matchGitCommand('create branch feature login');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('create-branch');
    expect(result!.argument).toBe('feature login');
  });

  it('matches "stage all"', () => {
    const result = matchGitCommand('stage all');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('stage-all');
  });

  it('marks "discard changes" as dangerous', () => {
    const result = matchGitCommand('discard changes');
    expect(result).not.toBeNull();
    expect(result!.dangerous).toBe(true);
  });

  it('is case-insensitive', () => {
    const result = matchGitCommand('Git Push');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('push');
  });

  it('returns null for non-git text', () => {
    expect(matchGitCommand('hello world')).toBeNull();
  });
});

describe('buildGitCommand', () => {
  it('builds commit command with message', () => {
    expect(buildGitCommand({ type: 'commit', argument: 'fix bug', trigger: 'commit', dangerous: false }))
      .toBe('git commit -m "fix bug"');
  });

  it('escapes quotes in commit message', () => {
    expect(buildGitCommand({ type: 'commit', argument: 'fix "login" bug', trigger: 'commit', dangerous: false }))
      .toBe('git commit -m "fix \\"login\\" bug"');
  });

  it('returns null for commit without message', () => {
    expect(buildGitCommand({ type: 'commit', argument: '', trigger: 'commit', dangerous: false })).toBeNull();
  });

  it('builds push command', () => {
    expect(buildGitCommand({ type: 'push', argument: '', trigger: 'push', dangerous: false })).toBe('git push');
  });

  it('builds checkout command', () => {
    expect(buildGitCommand({ type: 'checkout', argument: 'main', trigger: 'checkout', dangerous: false }))
      .toBe('git checkout main');
  });

  it('builds create-branch with hyphenated name', () => {
    expect(buildGitCommand({ type: 'create-branch', argument: 'feature login', trigger: 'create branch', dangerous: false }))
      .toBe('git checkout -b feature-login');
  });

  it('builds stage-all command', () => {
    expect(buildGitCommand({ type: 'stage-all', argument: '', trigger: 'stage all', dangerous: false }))
      .toBe('git add -A');
  });

  it('builds discard command', () => {
    expect(buildGitCommand({ type: 'discard', argument: '', trigger: 'discard changes', dangerous: true }))
      .toBe('git checkout -- .');
  });
});

describe('sanitizeBranchName', () => {
  it('converts spaces to hyphens', () => {
    expect(sanitizeBranchName('feature login page')).toBe('feature-login-page');
  });

  it('removes invalid characters', () => {
    expect(sanitizeBranchName('fix: bug #123')).toBe('fix-bug-123');
  });

  it('collapses multiple hyphens', () => {
    expect(sanitizeBranchName('fix -- bug')).toBe('fix-bug');
  });

  it('strips leading/trailing hyphens', () => {
    expect(sanitizeBranchName(' -feature- ')).toBe('feature');
  });

  it('lowercases', () => {
    expect(sanitizeBranchName('Feature/Login')).toBe('feature/login');
  });
});
