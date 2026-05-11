/**
 * Snippet marketplace — browse and install community-shared voice macro packs.
 *
 * Provides a registry of curated voice macro packs that users can browse,
 * preview, and install with one click. Packs are JSON files hosted on GitHub
 * or a custom registry URL.
 *
 * Pack structure:
 *   {
 *     "name": "react-voice-macros",
 *     "version": "1.0.0",
 *     "description": "Voice macros for React development",
 *     "author": "community",
 *     "macros": [ ...VoiceMacro[] ]
 *   }
 *
 * Features:
 *   - Browse available packs by category
 *   - Preview macros before installing
 *   - Install/uninstall packs (merges into voiceMacroDefinitions)
 *   - Check for pack updates
 *   - Submit your own packs
 *
 * Enable via `voxpilot.snippetMarketplace` setting (default: true).
 */

export interface MacroPack {
  /** Unique pack identifier (kebab-case) */
  name: string;
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description: string;
  /** Pack author */
  author: string;
  /** Category for browsing */
  category: PackCategory;
  /** Number of macros in the pack */
  macroCount: number;
  /** URL to download the full pack JSON */
  downloadUrl: string;
  /** Tags for search */
  tags: string[];
  /** Install count (from registry) */
  installs?: number;
  /** Rating (1-5) */
  rating?: number;
}

export type PackCategory =
  | 'frameworks'    // React, Vue, Angular, etc.
  | 'languages'     // Python, Go, Rust, etc.
  | 'tools'         // Git, Docker, Kubernetes, etc.
  | 'testing'       // Jest, Vitest, Pytest, etc.
  | 'productivity'  // General coding shortcuts
  | 'accessibility' // Accessibility-focused macros
  | 'other';

export interface InstalledPack {
  /** Pack name */
  name: string;
  /** Installed version */
  version: string;
  /** When it was installed */
  installedAt: string;
  /** Number of macros from this pack */
  macroCount: number;
}

/**
 * Parse and validate a macro pack from JSON.
 */
export function validatePack(data: unknown): MacroPack | null {
  if (!data || typeof data !== 'object') { return null; }
  const d = data as Record<string, unknown>;

  if (typeof d.name !== 'string' || !d.name.trim()) { return null; }
  if (typeof d.version !== 'string' || !d.version.trim()) { return null; }
  if (typeof d.description !== 'string') { return null; }
  if (typeof d.author !== 'string') { return null; }

  const validCategories: PackCategory[] = ['frameworks', 'languages', 'tools', 'testing', 'productivity', 'accessibility', 'other'];
  const category = validCategories.includes(d.category as PackCategory) ? d.category as PackCategory : 'other';

  return {
    name: d.name.trim(),
    version: d.version.trim(),
    description: (d.description as string) || '',
    author: (d.author as string) || 'unknown',
    category,
    macroCount: typeof d.macroCount === 'number' ? d.macroCount : 0,
    downloadUrl: typeof d.downloadUrl === 'string' ? d.downloadUrl : '',
    tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : [],
    installs: typeof d.installs === 'number' ? d.installs : undefined,
    rating: typeof d.rating === 'number' ? d.rating : undefined,
  };
}

/**
 * Compare two semantic versions. Returns -1, 0, or 1.
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const va = partsA[i] || 0;
    const vb = partsB[i] || 0;
    if (va < vb) { return -1; }
    if (va > vb) { return 1; }
  }
  return 0;
}

/**
 * Filter packs by search query (matches name, description, tags, author).
 */
export function searchPacks(packs: MacroPack[], query: string): MacroPack[] {
  if (!query.trim()) { return packs; }
  const lower = query.toLowerCase();

  return packs.filter(pack =>
    pack.name.toLowerCase().includes(lower) ||
    pack.description.toLowerCase().includes(lower) ||
    pack.author.toLowerCase().includes(lower) ||
    pack.tags.some(t => t.toLowerCase().includes(lower))
  );
}

/**
 * Filter packs by category.
 */
export function filterByCategory(packs: MacroPack[], category: PackCategory): MacroPack[] {
  return packs.filter(p => p.category === category);
}

/**
 * Sort packs by popularity (installs), rating, or name.
 */
export function sortPacks(packs: MacroPack[], by: 'popular' | 'rating' | 'name' | 'newest'): MacroPack[] {
  const sorted = [...packs];
  switch (by) {
    case 'popular':
      return sorted.sort((a, b) => (b.installs ?? 0) - (a.installs ?? 0));
    case 'rating':
      return sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'newest':
      return sorted.sort((a, b) => compareVersions(b.version, a.version));
    default:
      return sorted;
  }
}

/**
 * Get the actual macro definitions for a built-in pack.
 */
export function getBuiltinPackMacros(packName: string): any[] {
  switch (packName) {
    case 'react-essentials':
      return [
        { phrase: 'react component', description: 'Function component boilerplate', actions: [{ type: 'snippet', value: 'export function ${1:Component}(${2:props}: ${3:Props}) {\n\treturn (\n\t\t<div>\n\t\t\t$0\n\t\t</div>\n\t);\n}' }] },
        { phrase: 'use state', description: 'useState hook', actions: [{ type: 'snippet', value: 'const [${1:state}, set${1/(.*)/${1:/capitalize}/}] = useState<${2:type}>(${3:initial});$0' }] },
        { phrase: 'use effect', description: 'useEffect hook', actions: [{ type: 'snippet', value: 'useEffect(() => {\n\t$0\n}, [${1:deps}]);' }] },
        { phrase: 'use memo', description: 'useMemo hook', actions: [{ type: 'snippet', value: 'const ${1:value} = useMemo(() => {\n\treturn $0;\n}, [${2:deps}]);' }] },
        { phrase: 'use callback', description: 'useCallback hook', actions: [{ type: 'snippet', value: 'const ${1:handler} = useCallback((${2:args}) => {\n\t$0\n}, [${3:deps}]);' }] },
        { phrase: 'use ref', description: 'useRef hook', actions: [{ type: 'snippet', value: 'const ${1:ref} = useRef<${2:HTMLDivElement}>(null);$0' }] },
        { phrase: 'use context', description: 'useContext hook', actions: [{ type: 'snippet', value: 'const ${1:value} = useContext(${2:Context});$0' }] },
        { phrase: 'react fragment', description: 'Fragment wrapper', actions: [{ type: 'insert', value: '<>\n\t\n</>' }] },
        { phrase: 'class name conditional', description: 'Conditional className', actions: [{ type: 'snippet', value: 'className={`${1:base} ${${2:condition} ? \'${3:active}\' : \'\'}`}$0' }] },
        { phrase: 'map items', description: 'Array map with key', actions: [{ type: 'snippet', value: '{${1:items}.map((${2:item}) => (\n\t<${3:div} key={${2:item}.${4:id}}>\n\t\t$0\n\t</${3:div}>\n))}' }] },
        { phrase: 'event handler', description: 'Event handler function', actions: [{ type: 'snippet', value: 'const handle${1:Click} = (e: React.${2:MouseEvent}<${3:HTMLButtonElement}>) => {\n\t$0\n};' }] },
        { phrase: 'react import', description: 'Import React', actions: [{ type: 'insert', value: "import React from 'react';\n" }] },
      ];
    case 'python-shortcuts':
      return [
        { phrase: 'python function', description: 'Function with type hints', actions: [{ type: 'snippet', value: 'def ${1:name}(${2:args}) -> ${3:None}:\n\t"""${4:Docstring}."""\n\t$0' }] },
        { phrase: 'python class', description: 'Class with init', actions: [{ type: 'snippet', value: 'class ${1:Name}:\n\t"""${2:Docstring}."""\n\n\tdef __init__(self, ${3:args}) -> None:\n\t\t$0' }] },
        { phrase: 'list comprehension', description: 'List comprehension', actions: [{ type: 'snippet', value: '[${1:expr} for ${2:item} in ${3:iterable}]$0' }] },
        { phrase: 'dict comprehension', description: 'Dict comprehension', actions: [{ type: 'snippet', value: '{${1:key}: ${2:value} for ${3:item} in ${4:iterable}}$0' }] },
        { phrase: 'python decorator', description: 'Decorator function', actions: [{ type: 'snippet', value: 'def ${1:decorator}(func):\n\t@functools.wraps(func)\n\tdef wrapper(*args, **kwargs):\n\t\t$0\n\t\treturn func(*args, **kwargs)\n\treturn wrapper' }] },
        { phrase: 'try except', description: 'Try/except block', actions: [{ type: 'snippet', value: 'try:\n\t${1:pass}\nexcept ${2:Exception} as e:\n\t$0' }] },
        { phrase: 'with open', description: 'File open context manager', actions: [{ type: 'snippet', value: 'with open(${1:path}, "${2:r}") as ${3:f}:\n\t$0' }] },
        { phrase: 'dataclass', description: 'Dataclass', actions: [{ type: 'snippet', value: '@dataclass\nclass ${1:Name}:\n\t${2:field}: ${3:str}\n\t$0' }] },
        { phrase: 'pytest fixture', description: 'Pytest fixture', actions: [{ type: 'snippet', value: '@pytest.fixture\ndef ${1:name}():\n\t$0' }] },
        { phrase: 'pytest test', description: 'Test function', actions: [{ type: 'snippet', value: 'def test_${1:name}(${2:fixtures}):\n\t$0' }] },
        { phrase: 'type hint optional', description: 'Optional type hint', actions: [{ type: 'snippet', value: '${1:name}: Optional[${2:str}] = ${3:None}$0' }] },
        { phrase: 'async function', description: 'Async function', actions: [{ type: 'snippet', value: 'async def ${1:name}(${2:args}) -> ${3:None}:\n\t$0' }] },
        { phrase: 'lambda', description: 'Lambda expression', actions: [{ type: 'snippet', value: 'lambda ${1:x}: ${2:x}$0' }] },
        { phrase: 'if name main', description: 'Main guard', actions: [{ type: 'insert', value: 'if __name__ == "__main__":\n\t' }] },
        { phrase: 'python import', description: 'Import statement', actions: [{ type: 'snippet', value: 'from ${1:module} import ${2:name}$0' }] },
      ];
    case 'docker-commands':
      return [
        { phrase: 'docker build', description: 'Build image', actions: [{ type: 'terminal', value: 'docker build -t ${1:name}:${2:latest} .' }] },
        { phrase: 'docker run', description: 'Run container', actions: [{ type: 'terminal', value: 'docker run -d --name ${1:name} -p ${2:8080}:${3:80} ${4:image}' }] },
        { phrase: 'docker compose up', description: 'Compose up', actions: [{ type: 'terminal', value: 'docker compose up -d' }] },
        { phrase: 'docker compose down', description: 'Compose down', actions: [{ type: 'terminal', value: 'docker compose down' }] },
        { phrase: 'docker logs', description: 'View logs', actions: [{ type: 'terminal', value: 'docker logs -f ${1:container}' }] },
        { phrase: 'docker exec', description: 'Exec into container', actions: [{ type: 'terminal', value: 'docker exec -it ${1:container} /bin/sh' }] },
        { phrase: 'docker ps', description: 'List containers', actions: [{ type: 'terminal', value: 'docker ps' }] },
        { phrase: 'docker images', description: 'List images', actions: [{ type: 'terminal', value: 'docker images' }] },
        { phrase: 'docker stop all', description: 'Stop all containers', actions: [{ type: 'terminal', value: 'docker stop $(docker ps -q)' }] },
        { phrase: 'docker prune', description: 'System prune', actions: [{ type: 'terminal', value: 'docker system prune -af' }] },
      ];
    case 'testing-toolkit':
      return [
        { phrase: 'describe block', description: 'Describe block', actions: [{ type: 'snippet', value: "describe('${1:subject}', () => {\n\t$0\n});" }] },
        { phrase: 'it should', description: 'Test case', actions: [{ type: 'snippet', value: "it('should ${1:behavior}', () => {\n\t$0\n});" }] },
        { phrase: 'it async', description: 'Async test case', actions: [{ type: 'snippet', value: "it('should ${1:behavior}', async () => {\n\t$0\n});" }] },
        { phrase: 'expect equal', description: 'Expect toBe', actions: [{ type: 'snippet', value: 'expect(${1:actual}).toBe(${2:expected});$0' }] },
        { phrase: 'expect deep equal', description: 'Expect toEqual', actions: [{ type: 'snippet', value: 'expect(${1:actual}).toEqual(${2:expected});$0' }] },
        { phrase: 'expect throw', description: 'Expect toThrow', actions: [{ type: 'snippet', value: 'expect(() => ${1:fn}()).toThrow(${2:error});$0' }] },
        { phrase: 'expect called', description: 'Expect toHaveBeenCalled', actions: [{ type: 'snippet', value: 'expect(${1:mock}).toHaveBeenCalledWith(${2:args});$0' }] },
        { phrase: 'mock function', description: 'vi.fn() mock', actions: [{ type: 'snippet', value: 'const ${1:mock} = vi.fn(${2:});$0' }] },
        { phrase: 'spy on', description: 'vi.spyOn', actions: [{ type: 'snippet', value: "vi.spyOn(${1:object}, '${2:method}').mockReturnValue(${3:value});$0" }] },
        { phrase: 'before each', description: 'beforeEach hook', actions: [{ type: 'snippet', value: 'beforeEach(() => {\n\t$0\n});' }] },
        { phrase: 'after each', description: 'afterEach hook', actions: [{ type: 'snippet', value: 'afterEach(() => {\n\t$0\n});' }] },
        { phrase: 'mock module', description: 'vi.mock module', actions: [{ type: 'snippet', value: "vi.mock('${1:module}', () => ({\n\t${2:export}: vi.fn(),\n}));$0" }] },
        { phrase: 'expect truthy', description: 'Expect toBeTruthy', actions: [{ type: 'snippet', value: 'expect(${1:value}).toBeTruthy();$0' }] },
        { phrase: 'expect contains', description: 'Expect toContain', actions: [{ type: 'snippet', value: 'expect(${1:array}).toContain(${2:item});$0' }] },
        { phrase: 'expect length', description: 'Expect toHaveLength', actions: [{ type: 'snippet', value: 'expect(${1:array}).toHaveLength(${2:n});$0' }] },
        { phrase: 'expect match', description: 'Expect toMatch', actions: [{ type: 'snippet', value: 'expect(${1:string}).toMatch(${2:/regex/});$0' }] },
        { phrase: 'test snapshot', description: 'Snapshot test', actions: [{ type: 'snippet', value: 'expect(${1:component}).toMatchSnapshot();$0' }] },
        { phrase: 'expect resolves', description: 'Expect resolves', actions: [{ type: 'snippet', value: 'await expect(${1:promise}).resolves.toBe(${2:value});$0' }] },
      ];
    default:
      return [];
  }
}

/** Built-in curated pack registry (starter packs) */
export const BUILTIN_PACKS: MacroPack[] = [
  {
    name: 'react-essentials',
    version: '1.0.0',
    description: 'Voice macros for React development — components, hooks, JSX patterns',
    author: 'VoxPilot',
    category: 'frameworks',
    macroCount: 12,
    downloadUrl: '',
    tags: ['react', 'jsx', 'hooks', 'components'],
    installs: 0,
    rating: 5.0,
  },
  {
    name: 'python-shortcuts',
    version: '1.0.0',
    description: 'Voice macros for Python — decorators, comprehensions, type hints, testing',
    author: 'VoxPilot',
    category: 'languages',
    macroCount: 15,
    downloadUrl: '',
    tags: ['python', 'pytest', 'typing', 'decorators'],
    installs: 0,
    rating: 5.0,
  },
  {
    name: 'docker-commands',
    version: '1.0.0',
    description: 'Voice macros for Docker and Docker Compose operations',
    author: 'VoxPilot',
    category: 'tools',
    macroCount: 10,
    downloadUrl: '',
    tags: ['docker', 'compose', 'containers', 'devops'],
    installs: 0,
    rating: 4.5,
  },
  {
    name: 'testing-toolkit',
    version: '1.0.0',
    description: 'Voice macros for test writing — describe, it, expect, mock, spy patterns',
    author: 'VoxPilot',
    category: 'testing',
    macroCount: 18,
    downloadUrl: '',
    tags: ['jest', 'vitest', 'testing', 'tdd', 'mock'],
    installs: 0,
    rating: 4.8,
  },
];
