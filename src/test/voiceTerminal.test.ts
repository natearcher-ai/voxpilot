import { describe, it, expect } from 'vitest';
import { parseTerminalCommand, buildShellCommand, isDangerous } from '../voiceTerminal';

describe('VoiceTerminal', () => {
  describe('parseTerminalCommand', () => {
    it('parses run command with argument', () => {
      const cmd = parseTerminalCommand('run echo hello');
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe('execute');
      expect(cmd!.argument).toBe('echo hello');
    });

    it('parses npm install with package', () => {
      const cmd = parseTerminalCommand('npm install express');
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe('npm-install');
      expect(cmd!.argument).toBe('express');
    });

    it('parses npm install without package', () => {
      const cmd = parseTerminalCommand('npm install');
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe('npm-install');
      expect(cmd!.argument).toBe('');
    });

    it('parses npm run with script', () => {
      const cmd = parseTerminalCommand('npm run build');
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe('npm-run');
      expect(cmd!.argument).toBe('build');
    });

    it('parses list files', () => {
      const cmd = parseTerminalCommand('list files');
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe('list-files');
    });

    it('parses cd with path', () => {
      const cmd = parseTerminalCommand('cd src/components');
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe('cd');
      expect(cmd!.argument).toBe('src/components');
    });

    it('parses clear terminal', () => {
      const cmd = parseTerminalCommand('clear terminal');
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe('clear');
    });

    it('parses kill process', () => {
      const cmd = parseTerminalCommand('kill process');
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe('kill');
    });

    it('parses new terminal', () => {
      const cmd = parseTerminalCommand('new terminal');
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe('new');
    });

    it('parses close terminal', () => {
      const cmd = parseTerminalCommand('close terminal');
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe('close');
    });

    it('parses next terminal', () => {
      const cmd = parseTerminalCommand('next terminal');
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe('next');
    });

    it('parses scroll up', () => {
      const cmd = parseTerminalCommand('scroll up');
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe('scroll-up');
    });

    it('returns null for non-terminal text', () => {
      const cmd = parseTerminalCommand('hello world this is normal text');
      expect(cmd).toBeNull();
    });

    it('marks dangerous commands', () => {
      const cmd = parseTerminalCommand('run rm -rf /tmp/test');
      expect(cmd).not.toBeNull();
      expect(cmd!.dangerous).toBe(true);
    });

    it('does not mark safe commands as dangerous', () => {
      const cmd = parseTerminalCommand('run echo hello');
      expect(cmd).not.toBeNull();
      expect(cmd!.dangerous).toBe(false);
    });
  });

  describe('buildShellCommand', () => {
    it('builds execute command', () => {
      const result = buildShellCommand({ type: 'execute', argument: 'echo hello', raw: 'run echo hello', dangerous: false });
      expect(result).toBe('echo hello');
    });

    it('builds npm install with package', () => {
      const result = buildShellCommand({ type: 'npm-install', argument: 'express', raw: 'npm install express', dangerous: false });
      expect(result).toBe('npm install express');
    });

    it('builds npm install without package', () => {
      const result = buildShellCommand({ type: 'npm-install', argument: '', raw: 'npm install', dangerous: false });
      expect(result).toBe('npm install');
    });

    it('builds npm run', () => {
      const result = buildShellCommand({ type: 'npm-run', argument: 'build', raw: 'npm run build', dangerous: false });
      expect(result).toBe('npm run build');
    });

    it('builds cd command', () => {
      const result = buildShellCommand({ type: 'cd', argument: 'src', raw: 'cd src', dangerous: false });
      expect(result).toBe('cd src');
    });

    it('builds list files command', () => {
      const result = buildShellCommand({ type: 'list-files', argument: '', raw: 'list files', dangerous: false });
      expect(result).toMatch(/ls|dir/);
    });

    it('builds clear command', () => {
      const result = buildShellCommand({ type: 'clear', argument: '', raw: 'clear', dangerous: false });
      expect(result).toMatch(/clear|cls/);
    });

    it('returns null for execute without argument', () => {
      const result = buildShellCommand({ type: 'execute', argument: '', raw: 'run', dangerous: false });
      expect(result).toBeNull();
    });

    it('returns null for cd without argument', () => {
      const result = buildShellCommand({ type: 'cd', argument: '', raw: 'cd', dangerous: false });
      expect(result).toBeNull();
    });

    it('returns null for terminal management commands', () => {
      const result = buildShellCommand({ type: 'new', argument: '', raw: 'new terminal', dangerous: false });
      expect(result).toBeNull();
    });
  });

  describe('isDangerous', () => {
    it('detects rm -rf', () => {
      expect(isDangerous('rm -rf /')).toBe(true);
    });

    it('detects rm -r', () => {
      expect(isDangerous('rm -r /tmp')).toBe(true);
    });

    it('detects drop database', () => {
      expect(isDangerous('drop database production')).toBe(true);
    });

    it('detects mkfs', () => {
      expect(isDangerous('mkfs.ext4 /dev/sda1')).toBe(true);
    });

    it('does not flag safe commands', () => {
      expect(isDangerous('echo hello')).toBe(false);
      expect(isDangerous('npm install express')).toBe(false);
      expect(isDangerous('git status')).toBe(false);
    });
  });
});
