import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceTemplatesProcessor } from '../voiceTemplates';

describe('VoiceTemplatesProcessor', () => {
  let processor: VoiceTemplatesProcessor;

  beforeEach(() => {
    processor = new VoiceTemplatesProcessor();
  });

  it('has correct id and name', () => {
    expect(processor.id).toBe('voiceTemplates');
    expect(processor.name).toBe('Voice Templates');
  });

  it('returns built-in templates', () => {
    const templates = processor.getTemplates();
    expect(templates.length).toBeGreaterThan(10);
  });

  it('gets template by id', () => {
    const t = processor.getTemplate('react-component');
    expect(t).toBeDefined();
    expect(t?.phrases).toContain('react component');
  });

  it('generates react component', () => {
    const t = processor.getTemplate('react-component')!;
    const result = t.generate('user card', {
      languageId: 'typescriptreact',
      indent: '  ',
      useSemicolons: true,
      singleQuotes: true,
    });
    expect(result).toContain('interface UserCardProps');
    expect(result).toContain('export function UserCard');
    expect(result).toContain('<h1>UserCard</h1>');
  });

  it('generates react hook with use prefix', () => {
    const t = processor.getTemplate('react-hook')!;
    const result = t.generate('auth', {
      languageId: 'typescript',
      indent: '  ',
      useSemicolons: true,
      singleQuotes: true,
    });
    expect(result).toContain('export function useAuth');
    expect(result).toContain('useState');
    expect(result).toContain('useEffect');
  });

  it('generates express route with path', () => {
    const t = processor.getTemplate('express-route')!;
    const result = t.generate('users list', {
      languageId: 'typescript',
      indent: '  ',
      useSemicolons: true,
      singleQuotes: true,
    });
    expect(result).toContain("'/users-list'");
    expect(result).toContain('router.get');
    expect(result).toContain('async (req, res)');
  });

  it('generates test suite', () => {
    const t = processor.getTemplate('test-suite')!;
    const result = t.generate('AuthService', {
      languageId: 'typescript',
      indent: '  ',
      useSemicolons: true,
      singleQuotes: true,
    });
    expect(result).toContain("describe('AuthService'");
    expect(result).toContain('beforeEach');
    expect(result).toContain('expect(true)');
  });

  it('generates python class', () => {
    const t = processor.getTemplate('python-class')!;
    const result = t.generate('data processor', {
      languageId: 'python',
      indent: '    ',
      useSemicolons: false,
      singleQuotes: true,
    });
    expect(result).toContain('class DataProcessor:');
    expect(result).toContain('def __init__(self)');
  });

  it('generates python function', () => {
    const t = processor.getTemplate('python-function')!;
    const result = t.generate('process data', {
      languageId: 'python',
      indent: '    ',
      useSemicolons: false,
      singleQuotes: true,
    });
    expect(result).toContain('def process_data():');
  });

  it('generates docker compose', () => {
    const t = processor.getTemplate('docker-compose')!;
    const result = t.generate('', {
      languageId: 'yaml',
      indent: '  ',
      useSemicolons: false,
      singleQuotes: false,
    });
    expect(result).toContain("version: '3.8'");
    expect(result).toContain('services:');
    expect(result).toContain('postgres');
  });

  it('generates github action', () => {
    const t = processor.getTemplate('github-action')!;
    const result = t.generate('Deploy', {
      languageId: 'yaml',
      indent: '  ',
      useSemicolons: false,
      singleQuotes: false,
    });
    expect(result).toContain('name: Deploy');
    expect(result).toContain('runs-on: ubuntu-latest');
    expect(result).toContain('actions/checkout@v4');
  });

  it('generates try-catch block', () => {
    const t = processor.getTemplate('try-catch')!;
    const result = t.generate('', {
      languageId: 'typescript',
      indent: '  ',
      useSemicolons: true,
      singleQuotes: true,
    });
    expect(result).toContain('try {');
    expect(result).toContain('} catch (error) {');
  });

  it('generates async function', () => {
    const t = processor.getTemplate('async-function')!;
    const result = t.generate('fetch users', {
      languageId: 'typescript',
      indent: '  ',
      useSemicolons: true,
      singleQuotes: true,
    });
    expect(result).toContain('export async function fetchUsers');
    expect(result).toContain('Promise<void>');
  });

  it('process returns empty string when template matches', () => {
    const result = processor.processWithLanguage('react component user card', 'typescriptreact');
    expect(result).toBe('');
  });

  it('process passes through non-matching text', () => {
    const result = processor.processWithLanguage('hello world this is normal text', 'typescript');
    expect(result).toBe('hello world this is normal text');
  });

  it('process respects language filter', () => {
    // Python class should not match in TypeScript files
    const result = processor.processWithLanguage('python class data handler', 'typescript');
    expect(result).toBe('python class data handler');
  });

  it('addTemplate registers custom template', () => {
    processor.addTemplate({
      id: 'custom-widget',
      phrases: ['widget'],
      capturesName: true,
      languages: [],
      description: 'Custom widget',
      generate: (name) => `<Widget name="${name}" />`,
    });

    const t = processor.getTemplate('custom-widget');
    expect(t).toBeDefined();
    expect(processor.getTemplates().length).toBeGreaterThan(17);
  });

  it('toPascalCase works correctly via react component', () => {
    const t = processor.getTemplate('react-component')!;
    const result = t.generate('my awesome component', {
      languageId: 'typescriptreact',
      indent: '  ',
      useSemicolons: true,
      singleQuotes: true,
    });
    expect(result).toContain('MyAwesomeComponent');
  });

  it('generates interface', () => {
    const t = processor.getTemplate('typescript-interface')!;
    const result = t.generate('user profile', {
      languageId: 'typescript',
      indent: '  ',
      useSemicolons: true,
      singleQuotes: true,
    });
    expect(result).toContain('export interface UserProfile');
  });

  it('generates enum', () => {
    const t = processor.getTemplate('typescript-enum')!;
    const result = t.generate('status', {
      languageId: 'typescript',
      indent: '  ',
      useSemicolons: true,
      singleQuotes: true,
    });
    expect(result).toContain('export enum Status');
    expect(result).toContain("Value1 = 'VALUE_1'");
  });
});
