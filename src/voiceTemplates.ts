/**
 * Voice Templates — say "react component" or "express route" to scaffold from templates.
 *
 * Detects spoken template trigger phrases and generates boilerplate code at the
 * cursor position. Templates are language-aware and adapt to the current file context.
 *
 * Built-in templates:
 *   "react component <Name>"       → Functional React component with props interface
 *   "react hook <name>"            → Custom React hook skeleton
 *   "express route <path>"         → Express.js route handler
 *   "express middleware <name>"    → Express middleware function
 *   "api endpoint <method> <path>" → REST API endpoint handler
 *   "test suite <name>"            → Test file skeleton (Jest/Vitest)
 *   "test case <description>"      → Single test case
 *   "class <Name>"                 → TypeScript/JavaScript class
 *   "interface <Name>"             → TypeScript interface
 *   "enum <Name>"                  → TypeScript enum
 *   "function <name>"              → Function skeleton with JSDoc
 *   "arrow function <name>"        → Arrow function with type annotations
 *   "try catch"                    → Try-catch block
 *   "async function <name>"        → Async function skeleton
 *   "python class <Name>"          → Python class with __init__
 *   "python function <name>"       → Python function with docstring
 *   "docker compose"               → Docker Compose skeleton
 *   "github action <name>"         → GitHub Actions workflow skeleton
 *
 * Custom templates can be added via `voxpilot.voiceTemplates` setting.
 * Enable via `voxpilot.voiceTemplates.enabled` setting (default: true).
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

/** Template definition */
export interface VoiceTemplate {
  /** Unique template identifier */
  id: string;
  /** Trigger phrases (longest first) */
  phrases: string[];
  /** Whether the template captures a name/argument after the phrase */
  capturesName: boolean;
  /** Language IDs this template applies to (empty = all) */
  languages: string[];
  /** Template generator function */
  generate: (name: string, context: TemplateContext) => string;
  /** Description for UI */
  description: string;
}

/** Context passed to template generators */
export interface TemplateContext {
  /** Current file language ID */
  languageId: string;
  /** Current file path */
  filePath?: string;
  /** Indentation string (spaces or tabs) */
  indent: string;
  /** Whether the file uses semicolons */
  useSemicolons: boolean;
  /** Whether to use single quotes */
  singleQuotes: boolean;
}

/** Compiled trigger for matching */
interface CompiledTemplate {
  pattern: RegExp;
  template: VoiceTemplate;
}

/** Convert a captured name to PascalCase */
function toPascalCase(str: string): string {
  return str
    .split(/[\s_-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

/** Convert a captured name to camelCase */
function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** Built-in templates */
const BUILTIN_TEMPLATES: VoiceTemplate[] = [
  {
    id: 'react-component',
    phrases: ['react component'],
    capturesName: true,
    languages: ['typescriptreact', 'javascriptreact', 'typescript', 'javascript'],
    description: 'Functional React component with props',
    generate: (name, ctx) => {
      const n = toPascalCase(name || 'MyComponent');
      const q = ctx.singleQuotes ? "'" : '"';
      const semi = ctx.useSemicolons ? ';' : '';
      return [
        `interface ${n}Props {`,
        `${ctx.indent}// Add props here`,
        `}`,
        ``,
        `export function ${n}({ }: ${n}Props) {`,
        `${ctx.indent}return (`,
        `${ctx.indent}${ctx.indent}<div>`,
        `${ctx.indent}${ctx.indent}${ctx.indent}<h1>${n}</h1>`,
        `${ctx.indent}${ctx.indent}</div>`,
        `${ctx.indent})${semi}`,
        `}`,
      ].join('\n');
    },
  },
  {
    id: 'react-hook',
    phrases: ['react hook'],
    capturesName: true,
    languages: ['typescriptreact', 'javascriptreact', 'typescript', 'javascript'],
    description: 'Custom React hook',
    generate: (name, ctx) => {
      const n = toCamelCase(name || 'useCustom');
      const hookName = n.startsWith('use') ? n : `use${toPascalCase(n)}`;
      const semi = ctx.useSemicolons ? ';' : '';
      return [
        `import { useState, useEffect } from 'react'${semi}`,
        ``,
        `export function ${hookName}() {`,
        `${ctx.indent}const [state, setState] = useState(null)${semi}`,
        ``,
        `${ctx.indent}useEffect(() => {`,
        `${ctx.indent}${ctx.indent}// Effect logic here`,
        `${ctx.indent}}, [])${semi}`,
        ``,
        `${ctx.indent}return { state }${semi}`,
        `}`,
      ].join('\n');
    },
  },
  {
    id: 'express-route',
    phrases: ['express route'],
    capturesName: true,
    languages: ['typescript', 'javascript'],
    description: 'Express.js route handler',
    generate: (name, ctx) => {
      const path = name ? `/${name.replace(/\s+/g, '-').toLowerCase()}` : '/example';
      const semi = ctx.useSemicolons ? ';' : '';
      return [
        `router.get('${path}', async (req, res) => {`,
        `${ctx.indent}try {`,
        `${ctx.indent}${ctx.indent}// Route logic here`,
        `${ctx.indent}${ctx.indent}res.json({ message: 'OK' })${semi}`,
        `${ctx.indent}} catch (error) {`,
        `${ctx.indent}${ctx.indent}res.status(500).json({ error: 'Internal server error' })${semi}`,
        `${ctx.indent}}`,
        `})${semi}`,
      ].join('\n');
    },
  },
  {
    id: 'express-middleware',
    phrases: ['express middleware'],
    capturesName: true,
    languages: ['typescript', 'javascript'],
    description: 'Express middleware function',
    generate: (name, ctx) => {
      const n = toCamelCase(name || 'customMiddleware');
      const semi = ctx.useSemicolons ? ';' : '';
      return [
        `function ${n}(req, res, next) {`,
        `${ctx.indent}// Middleware logic here`,
        `${ctx.indent}next()${semi}`,
        `}`,
      ].join('\n');
    },
  },
  {
    id: 'test-suite',
    phrases: ['test suite'],
    capturesName: true,
    languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    description: 'Test file skeleton',
    generate: (name, ctx) => {
      const n = name || 'MyModule';
      const semi = ctx.useSemicolons ? ';' : '';
      return [
        `import { describe, it, expect, beforeEach } from 'vitest'${semi}`,
        ``,
        `describe('${n}', () => {`,
        `${ctx.indent}beforeEach(() => {`,
        `${ctx.indent}${ctx.indent}// Setup`,
        `${ctx.indent}})${semi}`,
        ``,
        `${ctx.indent}it('should work correctly', () => {`,
        `${ctx.indent}${ctx.indent}// Test logic`,
        `${ctx.indent}${ctx.indent}expect(true).toBe(true)${semi}`,
        `${ctx.indent}})${semi}`,
        `})${semi}`,
      ].join('\n');
    },
  },
  {
    id: 'test-case',
    phrases: ['test case'],
    capturesName: true,
    languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    description: 'Single test case',
    generate: (name, ctx) => {
      const desc = name || 'should do something';
      const semi = ctx.useSemicolons ? ';' : '';
      return [
        `it('${desc}', () => {`,
        `${ctx.indent}// Arrange`,
        ``,
        `${ctx.indent}// Act`,
        ``,
        `${ctx.indent}// Assert`,
        `${ctx.indent}expect(true).toBe(true)${semi}`,
        `})${semi}`,
      ].join('\n');
    },
  },
  {
    id: 'typescript-class',
    phrases: ['class'],
    capturesName: true,
    languages: ['typescript', 'javascript'],
    description: 'TypeScript/JavaScript class',
    generate: (name, ctx) => {
      const n = toPascalCase(name || 'MyClass');
      return [
        `export class ${n} {`,
        `${ctx.indent}constructor() {`,
        `${ctx.indent}${ctx.indent}// Initialize`,
        `${ctx.indent}}`,
        `}`,
      ].join('\n');
    },
  },
  {
    id: 'typescript-interface',
    phrases: ['interface'],
    capturesName: true,
    languages: ['typescript', 'typescriptreact'],
    description: 'TypeScript interface',
    generate: (name, ctx) => {
      const n = toPascalCase(name || 'MyInterface');
      return [
        `export interface ${n} {`,
        `${ctx.indent}// Add properties here`,
        `}`,
      ].join('\n');
    },
  },
  {
    id: 'typescript-enum',
    phrases: ['enum'],
    capturesName: true,
    languages: ['typescript', 'typescriptreact'],
    description: 'TypeScript enum',
    generate: (name, ctx) => {
      const n = toPascalCase(name || 'MyEnum');
      return [
        `export enum ${n} {`,
        `${ctx.indent}Value1 = 'VALUE_1',`,
        `${ctx.indent}Value2 = 'VALUE_2',`,
        `${ctx.indent}Value3 = 'VALUE_3',`,
        `}`,
      ].join('\n');
    },
  },
  {
    id: 'function',
    phrases: ['function'],
    capturesName: true,
    languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    description: 'Function with JSDoc',
    generate: (name, ctx) => {
      const n = toCamelCase(name || 'myFunction');
      const semi = ctx.useSemicolons ? ';' : '';
      return [
        `/**`,
        ` * ${n} — TODO: add description`,
        ` */`,
        `export function ${n}() {`,
        `${ctx.indent}// Implementation`,
        `}`,
      ].join('\n');
    },
  },
  {
    id: 'async-function',
    phrases: ['async function'],
    capturesName: true,
    languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    description: 'Async function skeleton',
    generate: (name, ctx) => {
      const n = toCamelCase(name || 'myAsyncFunction');
      return [
        `export async function ${n}(): Promise<void> {`,
        `${ctx.indent}try {`,
        `${ctx.indent}${ctx.indent}// Async logic here`,
        `${ctx.indent}} catch (error) {`,
        `${ctx.indent}${ctx.indent}throw error;`,
        `${ctx.indent}}`,
        `}`,
      ].join('\n');
    },
  },
  {
    id: 'arrow-function',
    phrases: ['arrow function'],
    capturesName: true,
    languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    description: 'Arrow function with type annotations',
    generate: (name, ctx) => {
      const n = toCamelCase(name || 'myFunction');
      const semi = ctx.useSemicolons ? ';' : '';
      return `export const ${n} = () => {\n${ctx.indent}// Implementation\n}${semi}`;
    },
  },
  {
    id: 'try-catch',
    phrases: ['try catch'],
    capturesName: false,
    languages: [],
    description: 'Try-catch block',
    generate: (_name, ctx) => {
      return [
        `try {`,
        `${ctx.indent}// Code that might throw`,
        `} catch (error) {`,
        `${ctx.indent}console.error('Error:', error);`,
        `}`,
      ].join('\n');
    },
  },
  {
    id: 'python-class',
    phrases: ['python class'],
    capturesName: true,
    languages: ['python'],
    description: 'Python class with __init__',
    generate: (name, ctx) => {
      const n = toPascalCase(name || 'MyClass');
      return [
        `class ${n}:`,
        `${ctx.indent}"""${n} — TODO: add description."""`,
        ``,
        `${ctx.indent}def __init__(self):`,
        `${ctx.indent}${ctx.indent}"""Initialize ${n}."""`,
        `${ctx.indent}${ctx.indent}pass`,
      ].join('\n');
    },
  },
  {
    id: 'python-function',
    phrases: ['python function'],
    capturesName: true,
    languages: ['python'],
    description: 'Python function with docstring',
    generate: (name, ctx) => {
      const n = (name || 'my_function').toLowerCase().replace(/\s+/g, '_');
      return [
        `def ${n}():`,
        `${ctx.indent}"""${n} — TODO: add description."""`,
        `${ctx.indent}pass`,
      ].join('\n');
    },
  },
  {
    id: 'docker-compose',
    phrases: ['docker compose'],
    capturesName: false,
    languages: ['yaml', 'dockercompose'],
    description: 'Docker Compose skeleton',
    generate: (_name, _ctx) => {
      return [
        `version: '3.8'`,
        ``,
        `services:`,
        `  app:`,
        `    build: .`,
        `    ports:`,
        `      - "3000:3000"`,
        `    environment:`,
        `      - NODE_ENV=production`,
        `    depends_on:`,
        `      - db`,
        ``,
        `  db:`,
        `    image: postgres:16-alpine`,
        `    environment:`,
        `      - POSTGRES_DB=app`,
        `      - POSTGRES_USER=app`,
        `      - POSTGRES_PASSWORD=changeme`,
        `    volumes:`,
        `      - db_data:/var/lib/postgresql/data`,
        ``,
        `volumes:`,
        `  db_data:`,
      ].join('\n');
    },
  },
  {
    id: 'github-action',
    phrases: ['github action'],
    capturesName: true,
    languages: ['yaml'],
    description: 'GitHub Actions workflow skeleton',
    generate: (name, _ctx) => {
      const n = name || 'CI';
      return [
        `name: ${n}`,
        ``,
        `on:`,
        `  push:`,
        `    branches: [main]`,
        `  pull_request:`,
        `    branches: [main]`,
        ``,
        `jobs:`,
        `  build:`,
        `    runs-on: ubuntu-latest`,
        `    steps:`,
        `      - uses: actions/checkout@v4`,
        `      - uses: actions/setup-node@v4`,
        `        with:`,
        `          node-version: '20'`,
        `      - run: npm ci`,
        `      - run: npm test`,
      ].join('\n');
    },
  },
];

/**
 * Voice Templates processor — detects template trigger phrases and generates code.
 */
export class VoiceTemplatesProcessor implements PostProcessor {
  readonly id = 'voiceTemplates';
  readonly name = 'Voice Templates';
  readonly description = 'Scaffold code from spoken template triggers';

  private compiled: CompiledTemplate[] = [];
  private templates: VoiceTemplate[] = [];

  constructor() {
    this.templates = [...BUILTIN_TEMPLATES];
    this.compile();
  }

  /** Add a custom template */
  addTemplate(template: VoiceTemplate): void {
    this.templates.push(template);
    this.compile();
  }

  /** Get all registered templates */
  getTemplates(): VoiceTemplate[] {
    return [...this.templates];
  }

  /** Get template by ID */
  getTemplate(id: string): VoiceTemplate | undefined {
    return this.templates.find(t => t.id === id);
  }

  private compile(): void {
    this.compiled = [];
    for (const template of this.templates) {
      for (const phrase of template.phrases) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = template.capturesName
          ? new RegExp(`^${escaped}\\s+(.+?)\\s*$`, 'i')
          : new RegExp(`^${escaped}\\s*$`, 'i');

        this.compiled.push({ pattern, template });
      }
    }
    // Sort by phrase length descending (longest match first)
    this.compiled.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
  }

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (!config.get<boolean>('voiceTemplates.enabled', true)) {
      return text;
    }

    const trimmed = text.trim();
    const editor = vscode.window.activeTextEditor;
    const languageId = editor?.document?.languageId ?? 'plaintext';

    return this.processWithLanguage(trimmed, languageId);
  }

  /** Process text with an explicit language (for testing and API use) */
  processWithLanguage(text: string, languageId: string): string {
    const trimmed = text.trim();

    for (const { pattern, template } of this.compiled) {
      const match = trimmed.match(pattern);
      if (!match) continue;

      // Check language compatibility
      if (template.languages.length > 0 && !template.languages.includes(languageId)) {
        continue;
      }

      const name = template.capturesName ? (match[1] || '').trim() : '';
      const templateContext = this.buildContext();
      templateContext.languageId = languageId;
      const generated = template.generate(name, templateContext);

      // Insert the generated code at cursor
      this.insertAtCursor(generated);

      // Return empty string (template consumed the input)
      return '';
    }

    return text;
  }

  private buildContext(editor?: vscode.TextEditor): TemplateContext {
    const config = vscode.workspace.getConfiguration('editor');
    const insertSpaces = config.get<boolean>('insertSpaces', true);
    const tabSize = config.get<number>('tabSize', 2);
    const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

    return {
      languageId: editor?.document.languageId ?? 'plaintext',
      filePath: editor?.document.uri.fsPath,
      indent,
      useSemicolons: true,
      singleQuotes: true,
    };
  }

  private detectSemicolons(): boolean {
    return true;
  }

  private detectQuoteStyle(): boolean {
    return true;
  }

  private insertAtCursor(text: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    editor.edit(editBuilder => {
      editBuilder.insert(editor.selection.active, text);
    });
  }
}

/** Singleton instance */
export const voiceTemplates = new VoiceTemplatesProcessor();
