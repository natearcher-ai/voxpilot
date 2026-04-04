/**
 * Code vocabulary — built-in dictionary of programming term corrections.
 *
 * ASR models frequently misrecognize or split programming terms:
 *   "java script" → "JavaScript"
 *   "type script" → "TypeScript"
 *   "camel case"  → "camelCase"
 *   "jason"       → "JSON"
 *
 * This post-processor runs a curated dictionary of pattern→correction
 * replacements on the transcript. Matches are case-insensitive and
 * word-boundary anchored to avoid false positives.
 *
 * Enable/disable via `voxpilot.codeVocabulary` setting (default: true).
 */

import { PostProcessor, ProcessorContext } from './postProcessingPipeline';

/** A single vocabulary correction rule */
interface VocabRule {
  /** Regex matching the misrecognized form (case-insensitive, word-boundary) */
  pattern: RegExp;
  /** Correct form */
  replacement: string;
}

/**
 * Raw dictionary: [spoken/misrecognized form, correct form].
 * Patterns are matched case-insensitively at word boundaries.
 */
const CODE_DICTIONARY: Array<[string, string]> = [
  // ── Languages & runtimes ──
  ['java script', 'JavaScript'],
  ['type script', 'TypeScript'],
  ['coffee script', 'CoffeeScript'],
  ['action script', 'ActionScript'],
  ['c sharp', 'C#'],
  ['c plus plus', 'C++'],
  ['f sharp', 'F#'],
  ['objective c', 'Objective-C'],
  ['go lang', 'Golang'],
  ['node js', 'Node.js'],
  ['node j s', 'Node.js'],
  ['deno js', 'Deno'],
  ['bun js', 'Bun'],
  ['ruby on rails', 'Ruby on Rails'],
  ['dot net', '.NET'],

  // ── Casing conventions ──
  ['camel case', 'camelCase'],
  ['pascal case', 'PascalCase'],
  ['snake case', 'snake_case'],
  ['kebab case', 'kebab-case'],
  ['screaming snake case', 'SCREAMING_SNAKE_CASE'],

  // ── Data formats ──
  ['jason', 'JSON'],
  ['j son', 'JSON'],
  ['yaml', 'YAML'],
  ['toml', 'TOML'],
  ['csv', 'CSV'],
  ['xml', 'XML'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['sass', 'Sass'],
  ['scss', 'SCSS'],
  ['svg', 'SVG'],
  ['markdown', 'Markdown'],

  // ── Frameworks & libraries ──
  ['react js', 'React.js'],
  ['react native', 'React Native'],
  ['next js', 'Next.js'],
  ['nuxt js', 'Nuxt.js'],
  ['vue js', 'Vue.js'],
  ['angular js', 'AngularJS'],
  ['express js', 'Express.js'],
  ['nest js', 'NestJS'],
  ['spring boot', 'Spring Boot'],
  ['fast api', 'FastAPI'],
  ['flask', 'Flask'],
  ['django', 'Django'],
  ['tailwind css', 'Tailwind CSS'],
  ['bootstrap', 'Bootstrap'],
  ['jquery', 'jQuery'],
  ['j query', 'jQuery'],
  ['tensorflow', 'TensorFlow'],
  ['tensor flow', 'TensorFlow'],
  ['pytorch', 'PyTorch'],
  ['py torch', 'PyTorch'],

  // ── Tools & platforms ──
  ['git hub', 'GitHub'],
  ['git lab', 'GitLab'],
  ['bit bucket', 'Bitbucket'],
  ['vs code', 'VS Code'],
  ['v s code', 'VS Code'],
  ['visual studio code', 'VS Code'],
  ['x code', 'Xcode'],
  ['docker', 'Docker'],
  ['kubernetes', 'Kubernetes'],
  ['web pack', 'webpack'],
  ['es build', 'esbuild'],
  ['rollup', 'Rollup'],
  ['npm', 'npm'],
  ['yarn', 'Yarn'],
  ['pnpm', 'pnpm'],
  ['eslint', 'ESLint'],
  ['e s lint', 'ESLint'],
  ['prettier', 'Prettier'],
  ['postgres', 'PostgreSQL'],
  ['mongo db', 'MongoDB'],
  ['redis', 'Redis'],
  ['dynamo db', 'DynamoDB'],
  ['fire base', 'Firebase'],
  ['supabase', 'Supabase'],

  // ── Cloud & infra ──
  ['aws', 'AWS'],
  ['a w s', 'AWS'],
  ['gcp', 'GCP'],
  ['azure', 'Azure'],
  ['terraform', 'Terraform'],
  ['terra form', 'Terraform'],
  ['cloud formation', 'CloudFormation'],
  ['lambda', 'Lambda'],
  ['ec2', 'EC2'],
  ['s3', 'S3'],

  // ── Keywords & concepts ──
  ['api', 'API'],
  ['a p i', 'API'],
  ['rest api', 'REST API'],
  ['graphql', 'GraphQL'],
  ['graph ql', 'GraphQL'],
  ['graph q l', 'GraphQL'],
  ['sql', 'SQL'],
  ['s q l', 'SQL'],
  ['no sql', 'NoSQL'],
  ['regex', 'regex'],
  ['reg ex', 'regex'],
  ['async', 'async'],
  ['a sync', 'async'],
  ['await', 'await'],
  ['a wait', 'await'],
  ['dev ops', 'DevOps'],
  ['ci cd', 'CI/CD'],
  ['c i c d', 'CI/CD'],
  ['oauth', 'OAuth'],
  ['o auth', 'OAuth'],
  ['jwt', 'JWT'],
  ['j w t', 'JWT'],
  ['http', 'HTTP'],
  ['https', 'HTTPS'],
  ['url', 'URL'],
  ['uri', 'URI'],
  ['sdk', 'SDK'],
  ['cli', 'CLI'],
  ['gui', 'GUI'],
  ['ide', 'IDE'],
  ['oop', 'OOP'],
  ['crud', 'CRUD'],
  ['dom', 'DOM'],
  ['ajax', 'AJAX'],
  ['stdin', 'stdin'],
  ['stdout', 'stdout'],
  ['stderr', 'stderr'],
  ['localhost', 'localhost'],
  ['local host', 'localhost'],
  ['null', 'null'],
  ['undefined', 'undefined'],
  ['boolean', 'boolean'],
  ['bool', 'bool'],
  ['int', 'int'],
  ['float', 'float'],
  ['string', 'string'],
  ['enum', 'enum'],
  ['tuple', 'tuple'],
  ['hashmap', 'HashMap'],
  ['hash map', 'HashMap'],
  ['array list', 'ArrayList'],
  ['linked list', 'LinkedList'],

  // ── Common ASR confusions ──
  ['get hub', 'GitHub'],
  ['no js', 'Node.js'],
  ['pie thon', 'Python'],
  ['python', 'Python'],
  ['rust', 'Rust'],
  ['swift', 'Swift'],
  ['kotlin', 'Kotlin'],
  ['scala', 'Scala'],
  ['elixir', 'Elixir'],
  ['closure', 'Clojure'],
  ['haskell', 'Haskell'],
  ['erlang', 'Erlang'],
  ['lua', 'Lua'],
  ['perl', 'Perl'],
  ['php', 'PHP'],
  ['dart', 'Dart'],
  ['zig', 'Zig'],
];

/**
 * Compile the raw dictionary into regex rules.
 * Sorted longest-pattern-first to avoid partial matches.
 */
function compileDictionary(): VocabRule[] {
  const entries = [...CODE_DICTIONARY].sort((a, b) => b[0].length - a[0].length);

  return entries.map(([spoken, correct]) => {
    const escaped = spoken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      pattern: new RegExp(`\\b${escaped}\\b`, 'gi'),
      replacement: correct,
    };
  });
}

const COMPILED_RULES = compileDictionary();

/**
 * Apply code vocabulary corrections to a transcript.
 * Returns the corrected text and count of corrections made.
 */
export function applyCodeVocabulary(text: string): { text: string; corrections: number } {
  let result = text;
  let corrections = 0;

  for (const rule of COMPILED_RULES) {
    const before = result;
    result = result.replace(rule.pattern, rule.replacement);
    if (result !== before) {
      corrections++;
    }
  }

  return { text: result, corrections };
}

/**
 * Post-processor that corrects programming term misrecognitions.
 * Runs after typo fixes and before auto-punctuation/capitalization.
 */
export class CodeVocabularyProcessor implements PostProcessor {
  readonly id = 'codeVocabulary';
  readonly name = 'Code Vocabulary';
  readonly description = 'Correct common ASR misrecognitions of programming terms (e.g. "java script" → "JavaScript")';

  process(text: string, _context: ProcessorContext): string {
    const { text: corrected } = applyCodeVocabulary(text);
    return corrected;
  }
}
