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
