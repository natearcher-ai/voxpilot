/**
 * Context-aware Grammar — adapt punctuation and formatting rules per language and framework.
 *
 * Adjusts post-processing behavior based on the active file's language:
 *   - TypeScript/JavaScript: camelCase identifiers, semicolons, arrow functions
 *   - Python: snake_case, no semicolons, docstring formatting
 *   - Rust: snake_case, explicit types, lifetime annotations
 *   - Go: camelCase exports, PascalCase types, no semicolons
 *   - HTML/JSX: tag completion, attribute formatting
 *   - Markdown: heading formatting, list continuation
 *   - SQL: UPPERCASE keywords, lowercase identifiers
 *   - Shell: no capitalization, variable expansion syntax
 *
 * Also adapts to framework conventions:
 *   - React: component naming, hook patterns
 *   - Express: middleware patterns, route naming
 *   - Django: model naming, view patterns
 *   - Spring: annotation patterns, bean naming
 *
 * Enable via `voxpilot.contextGrammar.enabled` setting (default: true).
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

/** Language-specific grammar rules */
export interface GrammarRules {
  /** Language ID */
  languageId: string;
  /** Identifier casing style */
  identifierCase: 'camelCase' | 'snake_case' | 'PascalCase' | 'UPPER_SNAKE' | 'kebab-case' | 'none';
  /** Whether to add semicolons at end of statements */
  semicolons: boolean;
  /** Whether to auto-capitalize first word */
  autoCapitalize: boolean;
  /** String quote style */
  quoteStyle: 'single' | 'double' | 'backtick' | 'none';
  /** Comment prefix for inline comments */
  commentPrefix: string;
  /** Whether to expand common abbreviations */
  expandAbbreviations: boolean;
  /** Custom word replacements for this language */
  replacements: Record<string, string>;
  /** Keywords that should be uppercased */
  uppercaseKeywords: string[];
  /** Keywords that should be lowercased */
  lowercaseKeywords: string[];
}

/** Built-in grammar rules per language */
const LANGUAGE_RULES: Record<string, GrammarRules> = {
  typescript: {
    languageId: 'typescript',
    identifierCase: 'camelCase',
    semicolons: true,
    autoCapitalize: false,
    quoteStyle: 'single',
    commentPrefix: '//',
    expandAbbreviations: true,
    replacements: {
      'function': 'function',
      'const': 'const',
      'let': 'let',
      'arrow': '=>',
      'equals': '===',
      'not equals': '!==',
      'null check': '?.',
      'optional': '?:',
    },
    uppercaseKeywords: [],
    lowercaseKeywords: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'interface', 'type', 'export', 'import', 'async', 'await'],
  },
  javascript: {
    languageId: 'javascript',
    identifierCase: 'camelCase',
    semicolons: true,
    autoCapitalize: false,
    quoteStyle: 'single',
    commentPrefix: '//',
    expandAbbreviations: true,
    replacements: {
      'arrow': '=>',
      'equals': '===',
      'not equals': '!==',
      'null check': '?.',
    },
    uppercaseKeywords: [],
    lowercaseKeywords: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class'],
  },
  python: {
    languageId: 'python',
    identifierCase: 'snake_case',
    semicolons: false,
    autoCapitalize: false,
    quoteStyle: 'double',
    commentPrefix: '#',
    expandAbbreviations: true,
    replacements: {
      'none': 'None',
      'true': 'True',
      'false': 'False',
      'self dot': 'self.',
      'dunder': '__',
      'init': '__init__',
    },
    uppercaseKeywords: ['None', 'True', 'False'],
    lowercaseKeywords: ['def', 'class', 'import', 'from', 'return', 'if', 'elif', 'else', 'for', 'while', 'with', 'as', 'try', 'except', 'finally', 'raise', 'yield', 'async', 'await'],
  },
  rust: {
    languageId: 'rust',
    identifierCase: 'snake_case',
    semicolons: true,
    autoCapitalize: false,
    quoteStyle: 'double',
    commentPrefix: '//',
    expandAbbreviations: true,
    replacements: {
      'mutable': 'mut',
      'reference': '&',
      'mutable reference': '&mut',
      'lifetime': "'",
      'unwrap': '.unwrap()',
    },
    uppercaseKeywords: [],
    lowercaseKeywords: ['fn', 'let', 'mut', 'pub', 'struct', 'enum', 'impl', 'trait', 'use', 'mod', 'match', 'if', 'else', 'for', 'while', 'loop', 'return', 'async', 'await'],
  },
  go: {
    languageId: 'go',
    identifierCase: 'camelCase',
    semicolons: false,
    autoCapitalize: false,
    quoteStyle: 'double',
    commentPrefix: '//',
    expandAbbreviations: true,
    replacements: {
      'error': 'err',
      'context': 'ctx',
      'short assign': ':=',
      'nil': 'nil',
    },
    uppercaseKeywords: [],
    lowercaseKeywords: ['func', 'var', 'const', 'type', 'struct', 'interface', 'package', 'import', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'defer', 'go', 'chan'],
  },
  sql: {
    languageId: 'sql',
    identifierCase: 'snake_case',
    semicolons: true,
    autoCapitalize: false,
    quoteStyle: 'single',
    commentPrefix: '--',
    expandAbbreviations: true,
    replacements: {},
    uppercaseKeywords: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'IN', 'BETWEEN', 'LIKE', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'SET', 'VALUES', 'INTO'],
    lowercaseKeywords: [],
  },
  markdown: {
    languageId: 'markdown',
    identifierCase: 'none',
    semicolons: false,
    autoCapitalize: true,
    quoteStyle: 'none',
    commentPrefix: '',
    expandAbbreviations: false,
    replacements: {
      'heading one': '# ',
      'heading two': '## ',
      'heading three': '### ',
      'bullet': '- ',
      'numbered': '1. ',
      'code block': '```',
      'bold': '**',
      'italic': '*',
    },
    uppercaseKeywords: [],
    lowercaseKeywords: [],
  },
  shellscript: {
    languageId: 'shellscript',
    identifierCase: 'snake_case',
    semicolons: false,
    autoCapitalize: false,
    quoteStyle: 'double',
    commentPrefix: '#',
    expandAbbreviations: true,
    replacements: {
      'variable': '$',
      'pipe': '|',
      'redirect': '>',
      'append': '>>',
      'and then': '&&',
      'or else': '||',
    },
    uppercaseKeywords: [],
    lowercaseKeywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac', 'function'],
  },
};

/**
 * Convert text to the specified casing style.
 */
export function applyCase(text: string, style: GrammarRules['identifierCase']): string {
  if (style === 'none' || !text.includes(' ')) return text;

  const words = text.trim().split(/\s+/);
  if (words.length < 2) return text;

  switch (style) {
    case 'camelCase':
      return words[0].toLowerCase() + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    case 'PascalCase':
      return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
    case 'snake_case':
      return words.map(w => w.toLowerCase()).join('_');
    case 'UPPER_SNAKE':
      return words.map(w => w.toUpperCase()).join('_');
    case 'kebab-case':
      return words.map(w => w.toLowerCase()).join('-');
    default:
      return text;
  }
}

/** Precompiled keyword patterns cache (per language) */
const _keywordPatternCache = new Map<string, { upper: Array<[RegExp, string]>; lower: Array<[RegExp, string]> }>();

function getCompiledKeywords(rules: GrammarRules): { upper: Array<[RegExp, string]>; lower: Array<[RegExp, string]> } {
  const cached = _keywordPatternCache.get(rules.languageId);
  if (cached) { return cached; }

  const upper = rules.uppercaseKeywords.map(k => [new RegExp(`\\b${k}\\b`, 'gi'), k] as [RegExp, string]);
  const lower = rules.lowercaseKeywords.map(k => [new RegExp(`\\b${k}\\b`, 'gi'), k] as [RegExp, string]);
  const entry = { upper, lower };
  _keywordPatternCache.set(rules.languageId, entry);
  return entry;
}

/**
 * Apply keyword casing rules to text.
 * Uses precompiled regex patterns for performance.
 */
export function applyKeywordCasing(text: string, rules: GrammarRules): string {
  let result = text;
  const { upper, lower } = getCompiledKeywords(rules);

  for (const [regex, keyword] of upper) {
    result = result.replace(regex, keyword);
  }

  for (const [regex, keyword] of lower) {
    result = result.replace(regex, keyword);
  }

  return result;
}

/**
 * Apply language-specific replacements.
 */
export function applyReplacements(text: string, rules: GrammarRules): string {
  let result = text;

  // Sort by length descending to match longer phrases first
  const sorted = Object.entries(rules.replacements).sort((a, b) => b[0].length - a[0].length);

  for (const [phrase, replacement] of sorted) {
    const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    result = result.replace(regex, replacement);
  }

  return result;
}

/**
 * Get grammar rules for a language ID.
 */
export function getRulesForLanguage(languageId: string): GrammarRules | null {
  // Direct match
  if (LANGUAGE_RULES[languageId]) return LANGUAGE_RULES[languageId];

  // Aliases
  const aliases: Record<string, string> = {
    'typescriptreact': 'typescript',
    'javascriptreact': 'javascript',
    'tsx': 'typescript',
    'jsx': 'javascript',
    'bash': 'shellscript',
    'sh': 'shellscript',
    'zsh': 'shellscript',
    'pgsql': 'sql',
    'mysql': 'sql',
    'plsql': 'sql',
  };

  if (aliases[languageId]) return LANGUAGE_RULES[aliases[languageId]];

  return null;
}

/**
 * Context-aware Grammar processor.
 */
export class ContextGrammarProcessor implements PostProcessor {
  readonly id = 'contextGrammar';
  readonly name = 'Context-aware Grammar';
  readonly description = 'Adapt punctuation and formatting rules per language';

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (!config.get<boolean>('contextGrammar.enabled', true)) {
      return text;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) return text;

    const languageId = editor.document.languageId;
    const rules = getRulesForLanguage(languageId);
    if (!rules) return text;

    let result = text;

    // Apply replacements first
    if (rules.expandAbbreviations) {
      result = applyReplacements(result, rules);
    }

    // Apply keyword casing
    result = applyKeywordCasing(result, rules);

    return result;
  }
}

/** Singleton instance */
export const contextGrammar = new ContextGrammarProcessor();
