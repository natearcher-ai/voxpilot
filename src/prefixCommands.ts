/**
 * Prefix commands — spoken keyword prefixes that auto-wrap transcription output.
 *
 * Say a prefix keyword before dictating to automatically format the output:
 *   "comment hello world"        → // hello world
 *   "block comment hello world"  → /* hello world *​/
 *   "function greet"             → function greet() {}
 *   "variable count"             → const count = 
 *   "let count"                  → let count = 
 *   "log hello"                  → console.log("hello");
 *   "return value"               → return value;
 *   "import react"               → import react;
 *   "class animal"               → class Animal {}
 *   "if logged in"               → if (logged in) {}
 *   "todo fix this"              → // TODO: fix this
 *   "print hello"                → console.log("hello");
 *
 * Prefix commands are detected at the start of the transcript only.
 * They are processed before voice commands but after stitching/trim/normalize.
 */

import * as vscode from 'vscode';
import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

interface PrefixRule {
  /** Spoken prefix keyword(s) — matched case-insensitively at start of transcript */
  prefixes: string[];
  /** Transform function: takes the remaining text after the prefix and returns wrapped output */
  transform: (text: string) => string;
}

const BUILTIN_PREFIX_RULES: PrefixRule[] = [
  {
    prefixes: ['comment'],
    transform: (text: string) => `// ${text}`,
  },
  {
    prefixes: ['block comment'],
    transform: (text: string) => `/* ${text} */`,
  },
  {
    prefixes: ['todo'],
    transform: (text: string) => `// TODO: ${text}`,
  },
  {
    prefixes: ['fixme'],
    transform: (text: string) => `// FIXME: ${text}`,
  },
  {
    prefixes: ['function'],
    transform: (text: string) => {
      const name = text.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_$]/g, '');
      return `function ${name || 'unnamed'}() {}`;
    },
  },
  {
    prefixes: ['variable', 'const'],
    transform: (text: string) => {
      const name = text.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z0-9_$]/g, '') || 'value';
      return `const ${name} = `;
    },
  },
  {
    prefixes: ['let'],
    transform: (text: string) => {
      const name = text.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z0-9_$]/g, '') || 'value';
      return `let ${name} = `;
    },
  },
  {
    prefixes: ['log', 'print'],
    transform: (text: string) => `console.log("${text}");`,
  },
  {
    prefixes: ['return'],
    transform: (text: string) => `return ${text};`,
  },
  {
    prefixes: ['import'],
    transform: (text: string) => `import ${text};`,
  },
  {
    prefixes: ['class'],
    transform: (text: string) => {
      const name = text.trim().split(/\s+/)[0] || 'Unnamed';
      // Capitalize first letter
      const className = name.charAt(0).toUpperCase() + name.slice(1);
      return `class ${className} {}`;
    },
  },
  {
    prefixes: ['if'],
    transform: (text: string) => `if (${text}) {}`,
  },
];

/**
 * Build a sorted list of [prefix, rule] pairs, longest prefix first
 * so "block comment" matches before "comment" would.
 */
function buildPrefixIndex(rules: PrefixRule[]): Array<[string, PrefixRule]> {
  const pairs: Array<[string, PrefixRule]> = [];
  for (const rule of rules) {
    for (const prefix of rule.prefixes) {
      pairs.push([prefix.toLowerCase(), rule]);
    }
  }
  // Sort longest first for greedy matching
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

const PREFIX_INDEX = buildPrefixIndex(BUILTIN_PREFIX_RULES);

export class PrefixCommandsProcessor implements PostProcessor {
  readonly id = 'prefixCommands';
  readonly name = 'Prefix Commands';
  readonly description = 'Auto-wrap transcription based on spoken prefix keywords (comment, function, variable, log, etc.)';

  process(text: string, _context: ProcessorContext): string {
    const config = vscode.workspace.getConfiguration('voxpilot');
    if (config.get<boolean>('prefixCommands') === false) {
      return text;
    }

    const lower = text.toLowerCase();

    for (const [prefix, rule] of PREFIX_INDEX) {
      if (lower.startsWith(prefix)) {
        // Must be followed by a space or be the entire text
        const afterPrefix = text.slice(prefix.length);
        if (afterPrefix.length === 0) {
          return rule.transform('');
        }
        if (afterPrefix[0] === ' ') {
          const remaining = afterPrefix.slice(1).trim();
          return rule.transform(remaining);
        }
      }
    }

    return text;
  }
}
