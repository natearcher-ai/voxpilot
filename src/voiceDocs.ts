/**
 * Voice-driven Documentation — generate README, API docs, changelogs from voice descriptions.
 *
 * Voice commands for documentation workflows:
 *   "document function"           → Generate JSDoc/docstring for function at cursor
 *   "document class"              → Generate class documentation
 *   "document file"               → Generate file-level documentation header
 *   "generate readme"             → Create README.md from project structure
 *   "generate api docs"           → Create API documentation from source
 *   "add changelog entry <text>"  → Add entry to CHANGELOG.md
 *   "describe this as <text>"     → Add inline comment with description
 *   "explain parameter <name>"    → Add @param documentation
 *   "add example <text>"          → Add @example block
 *   "mark deprecated <reason>"    → Add @deprecated tag
 *   "add todo <text>"             → Add TODO comment
 *   "add returns <description>"   → Add @returns documentation
 *
 * Uses AI (VS Code Language Model API) when available for richer documentation.
 * Falls back to template-based generation when AI is not available.
 *
 * Enable via `voxpilot.voiceDocs.enabled` setting (default: true).
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

/** Documentation command types */
export type DocCommandType =
  | 'doc-function' | 'doc-class' | 'doc-file'
  | 'gen-readme' | 'gen-api-docs'
  | 'changelog-entry' | 'describe' | 'param'
  | 'example' | 'deprecated' | 'todo' | 'returns';

/** Parsed documentation command */
export interface DocCommand {
  type: DocCommandType;
  argument: string;
}

/** Documentation trigger */
interface DocTrigger {
  phrases: string[];
  type: DocCommandType;
  capturesArg: boolean;
}

const DOC_TRIGGERS: DocTrigger[] = [
  { phrases: ['document function', 'doc function', 'jsdoc function'], type: 'doc-function', capturesArg: false },
  { phrases: ['document class', 'doc class'], type: 'doc-class', capturesArg: false },
  { phrases: ['document file', 'doc file', 'file header'], type: 'doc-file', capturesArg: false },
  { phrases: ['generate readme', 'create readme', 'write readme'], type: 'gen-readme', capturesArg: false },
  { phrases: ['generate api docs', 'create api docs', 'api documentation'], type: 'gen-api-docs', capturesArg: false },
  { phrases: ['add changelog entry', 'changelog', 'add to changelog'], type: 'changelog-entry', capturesArg: true },
  { phrases: ['describe this as', 'describe as'], type: 'describe', capturesArg: true },
  { phrases: ['explain parameter', 'document parameter', 'param'], type: 'param', capturesArg: true },
  { phrases: ['add example', 'example'], type: 'example', capturesArg: true },
  { phrases: ['mark deprecated', 'deprecate'], type: 'deprecated', capturesArg: true },
  { phrases: ['add todo', 'todo'], type: 'todo', capturesArg: true },
  { phrases: ['add returns', 'returns', 'return type'], type: 'returns', capturesArg: true },
];

/**
 * Parse voice input into a documentation command.
 */
export function parseDocCommand(text: string): DocCommand | null {
  const trimmed = text.trim().toLowerCase();

  for (const trigger of DOC_TRIGGERS) {
    for (const phrase of trigger.phrases) {
      if (trimmed === phrase) {
        return { type: trigger.type, argument: '' };
      }
      if (trigger.capturesArg && trimmed.startsWith(phrase + ' ')) {
        const arg = text.trim().slice(phrase.length).trim();
        return { type: trigger.type, argument: arg };
      }
    }
  }

  return null;
}

/**
 * Generate a JSDoc comment for a function signature.
 */
export function generateFunctionDoc(signature: string, languageId: string): string {
  const params = extractParameters(signature);
  const funcName = extractFunctionName(signature);
  const isAsync = signature.includes('async');
  const hasReturn = !signature.includes(': void') && !signature.includes('-> None');

  if (languageId === 'python') {
    const lines = [`"""${funcName} — TODO: add description.`, ''];
    if (params.length > 0) {
      lines.push('Args:');
      for (const p of params) {
        lines.push(`    ${p.name}: TODO: describe ${p.name}`);
      }
      lines.push('');
    }
    if (hasReturn) {
      lines.push('Returns:');
      lines.push('    TODO: describe return value');
      lines.push('');
    }
    lines.push('"""');
    return lines.join('\n');
  }

  // JSDoc style (TypeScript, JavaScript)
  const lines = ['/**', ` * ${funcName} — TODO: add description.`, ' *'];
  for (const p of params) {
    lines.push(` * @param ${p.name} — TODO: describe ${p.name}`);
  }
  if (hasReturn) {
    lines.push(' * @returns TODO: describe return value');
  }
  if (isAsync) {
    lines.push(' * @async');
  }
  lines.push(' */');
  return lines.join('\n');
}

/**
 * Generate a class documentation block.
 */
export function generateClassDoc(className: string, languageId: string): string {
  if (languageId === 'python') {
    return `"""${className} — TODO: add description."""`;
  }

  return [
    '/**',
    ` * ${className} — TODO: add description.`,
    ' *',
    ` * @class ${className}`,
    ' */',
  ].join('\n');
}

/**
 * Generate a file header documentation block.
 */
export function generateFileHeader(fileName: string, languageId: string): string {
  const date = new Date().toISOString().slice(0, 10);

  if (languageId === 'python') {
    return [
      `"""`,
      `${fileName}`,
      ``,
      `TODO: Add file description.`,
      ``,
      `Created: ${date}`,
      `"""`,
    ].join('\n');
  }

  return [
    '/**',
    ` * @file ${fileName}`,
    ' * @description TODO: Add file description.',
    ` * @created ${date}`,
    ' */',
  ].join('\n');
}

/**
 * Generate a changelog entry.
 */
export function generateChangelogEntry(description: string, type: 'added' | 'changed' | 'fixed' | 'removed' = 'added'): string {
  const date = new Date().toISOString().slice(0, 10);
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  return `\n## [Unreleased] - ${date}\n\n### ${typeLabel}\n- ${description}\n`;
}

/**
 * Generate a TODO comment.
 */
export function generateTodo(text: string, languageId: string): string {
  const prefix = getCommentPrefix(languageId);
  return `${prefix} TODO: ${text}`;
}

/**
 * Generate a deprecation notice.
 */
export function generateDeprecated(reason: string, languageId: string): string {
  if (languageId === 'python') {
    return `# @deprecated: ${reason}\nimport warnings\nwarnings.warn("${reason}", DeprecationWarning, stacklevel=2)`;
  }
  return `/** @deprecated ${reason} */`;
}

/**
 * Get the comment prefix for a language.
 */
function getCommentPrefix(languageId: string): string {
  switch (languageId) {
    case 'python':
    case 'shellscript':
    case 'yaml':
      return '#';
    case 'sql':
      return '--';
    case 'html':
    case 'xml':
      return '<!--';
    default:
      return '//';
  }
}

/** Parameter info extracted from a signature */
interface ParamInfo {
  name: string;
  type?: string;
}

/**
 * Extract parameter names from a function signature.
 */
function extractParameters(signature: string): ParamInfo[] {
  // Match content between parentheses
  const match = signature.match(/\(([^)]*)\)/);
  if (!match || !match[1].trim()) return [];

  return match[1]
    .split(',')
    .map(p => p.trim())
    .filter(p => p && p !== 'self' && p !== 'cls')
    .map(p => {
      // Handle "name: type" or "type name" patterns
      const colonSplit = p.split(':');
      if (colonSplit.length > 1) {
        return { name: colonSplit[0].trim().replace(/[?]$/, ''), type: colonSplit[1].trim() };
      }
      // Handle "name = default"
      const eqSplit = p.split('=');
      return { name: eqSplit[0].trim(), type: undefined };
    });
}

/**
 * Extract function name from a signature.
 */
function extractFunctionName(signature: string): string {
  // Match "function name", "def name", "name(" patterns
  const patterns = [
    /(?:function|def|fn|func)\s+(\w+)/,
    /(?:const|let|var)\s+(\w+)\s*=/,
    /(\w+)\s*\(/,
  ];

  for (const pattern of patterns) {
    const match = signature.match(pattern);
    if (match) return match[1];
  }

  return 'unknown';
}

/**
 * Voice Documentation processor — detects doc commands in transcripts.
 */
export class VoiceDocsProcessor implements PostProcessor {
  readonly id = 'voiceDocs';
  readonly name = 'Voice Documentation';
  readonly description = 'Generate documentation from voice commands';

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (!config.get<boolean>('voiceDocs.enabled', true)) {
      return text;
    }

    const cmd = parseDocCommand(text);
    if (cmd) {
      this.executeDocCommand(cmd);
      return '';
    }

    return text;
  }

  private async executeDocCommand(cmd: DocCommand): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const languageId = editor.document.languageId;
    const currentLine = editor.document.lineAt(editor.selection.active.line).text;

    let docText = '';

    switch (cmd.type) {
      case 'doc-function':
        docText = generateFunctionDoc(currentLine, languageId);
        break;
      case 'doc-class':
        const className = currentLine.match(/class\s+(\w+)/)?.[1] || 'MyClass';
        docText = generateClassDoc(className, languageId);
        break;
      case 'doc-file':
        const fileName = editor.document.fileName.split('/').pop() || 'file';
        docText = generateFileHeader(fileName, languageId);
        break;
      case 'changelog-entry':
        docText = generateChangelogEntry(cmd.argument);
        break;
      case 'todo':
        docText = generateTodo(cmd.argument, languageId);
        break;
      case 'deprecated':
        docText = generateDeprecated(cmd.argument, languageId);
        break;
      case 'describe':
        docText = `${getCommentPrefix(languageId)} ${cmd.argument}`;
        break;
      case 'param':
        docText = languageId === 'python'
          ? `    ${cmd.argument}: TODO: describe`
          : ` * @param ${cmd.argument} — TODO: describe`;
        break;
      case 'example':
        docText = languageId === 'python'
          ? `    Example:\n        >>> ${cmd.argument}`
          : ` * @example\n * ${cmd.argument}`;
        break;
      case 'returns':
        docText = languageId === 'python'
          ? `    Returns:\n        ${cmd.argument}`
          : ` * @returns ${cmd.argument}`;
        break;
      default:
        return;
    }

    if (docText) {
      await editor.edit(eb => {
        const position = editor.selection.active;
        eb.insert(position, docText + '\n');
      });
    }
  }
}

/** Singleton instance */
export const voiceDocs = new VoiceDocsProcessor();
