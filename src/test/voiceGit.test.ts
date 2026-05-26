import { describe, it, expect } from 'vitest';
import { matchGitCommand, buildGitCommand, sanitizeBranchName } from '../voiceGit';

describe('matchGitCommand', () => {
  it('matches "commit" with message', () => {
    const result = matchGitCommand('commit fix the login bug');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('commit');
    expect(result!.argument).toBe('fix the login bug');
  });

  it('matches "push" without argument', () => {
    const result = matchGitCommand('push');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('push');
    expect(result!.argument).toBe('');
  });

  it('matches "pull" without argument', () => {
    const result = matchGitCommand('pull');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('pull');
  });

  it('matches "stash pop" before "stash" (longest first)', () => {
    const result = matchGitCommand('stash pop');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('stash-pop');
  });

  it('matches "stash" alone', () => {
    const result = matchGitCommand('stash');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('stash');
  });

  it('matches "create branch" with name', () => {
    const result = matchGitCommand('create branch feature auth');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('create-branch');
    expect(result!.argument).toBe('feature auth');
  });

  it('marks dangerous commands', () => {
    const result = matchGitCommand('discard changes');
    expect(result).not.toBeNull();
    expect(result!.dangerous).toBe(true);
  });

  it('returns null for non-git text', () => {
    expect(matchGitCommand('hello world')).toBeNull();
    expect(matchGitCommand('the push was hard')).toBeNull();
  });

  it('is case insensitive', () => {
    const result = matchGitCommand('PUSH');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('push');
  });
});

describe('buildGitCommand', () => {
  it('builds commit with single-quoted message', () => {
    const cmd = buildGitCommand({ type: 'commit', argument: 'fix login', trigger: 'commit', dangerous: false });
    expect(cmd).toBe("git commit -m 'fix login'");
  });

  it('escapes single quotes in commit message', () => {
    const cmd = buildGitCommand({ type: 'commit', argument: "it's fixed", trigger: 'commit', dangerous: false });
    expect(cmd).toBe("git commit -m 'it'\\''s fixed'");
  });

  it('returns null for commit without argument', () => {
    const cmd = buildGitCommand({ type: 'commit', argument: '', trigger: 'commit', dangerous: false });
    expect(cmd).toBeNull();
  });

  it('sanitizes branch name (removes special chars)', () => {
    const cmd = buildGitCommand({ type: 'checkout', argument: 'feature/auth', trigger: 'checkout', dangerous: false });
    expect(cmd).toBe('git checkout feature/auth');
  });

  it('sanitizes branch name with spaces → hyphens for create-branch', () => {
    const cmd = buildGitCommand({ type: 'create-branch', argument: 'feature auth flow', trigger: 'create branch', dangerous: false });
    expect(cmd).toBe('git checkout -b feature-auth-flow');
  });

  it('builds simple commands without arguments', () => {
    expect(buildGitCommand({ type: 'push', argument: '', trigger: 'push', dangerous: false })).toBe('git push');
    expect(buildGitCommand({ type: 'pull', argument: '', trigger: 'pull', dangerous: false })).toBe('git pull');
    expect(buildGitCommand({ type: 'status', argument: '', trigger: 'status', dangerous: false })).toBe('git status');
    expect(buildGitCommand({ type: 'stash', argument: '', trigger: 'stash', dangerous: false })).toBe('git stash');
    expect(buildGitCommand({ type: 'stash-pop', argument: '', trigger: 'stash pop', dangerous: false })).toBe('git stash pop');
  });
});

describe('sanitizeBranchName', () => {
  it('converts spaces to hyphens', () => {
    expect(sanitizeBranchName('feature auth')).toBe('feature-auth');
  });

  it('removes invalid characters', () => {
    expect(sanitizeBranchName('feature@auth!')).toBe('featureauth');
  });

  it('lowercases the name', () => {
    expect(sanitizeBranchName('Feature-Auth')).toBe('feature-auth');
  });

  it('collapses multiple hyphens', () => {
    expect(sanitizeBranchName('feature  auth')).toBe('feature-auth');
  });

  it('trims leading/trailing hyphens', () => {
    expect(sanitizeBranchName(' -feature- ')).toBe('feature');
  });
});
