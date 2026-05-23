/**
 * Voice Command Marketplace v2 — ratings, reviews, verified publishers, revenue sharing.
 *
 * Extends the snippet marketplace with:
 *   - User ratings and reviews for packs
 *   - Verified publisher badges
 *   - Revenue sharing model (70/30 split for premium packs)
 *   - Pack versioning and auto-updates
 *   - Dependency resolution between packs
 *   - Usage statistics per pack
 *   - Report/flag system for quality control
 *   - Featured packs and editor's picks
 *   - Search with filters (language, category, rating, free/premium)
 *
 * Registry API:
 *   GET  /packs                    → List/search packs
 *   GET  /packs/:id                → Pack details with reviews
 *   GET  /packs/:id/download       → Download pack JSON
 *   POST /packs/:id/review         → Submit a review
 *   POST /packs/:id/report         → Report a pack
 *   POST /packs                    → Publish a new pack (authenticated)
 *   PUT  /packs/:id                → Update a pack (owner only)
 *
 * Enable via `voxpilot.marketplace.enabled` setting (default: true).
 */

import * as vscode from 'vscode';

/** Pack pricing model */
export type PricingModel = 'free' | 'premium' | 'freemium';

/** Publisher verification status */
export type VerificationStatus = 'unverified' | 'verified' | 'official';

/** Pack category */
export type MarketplaceCategory =
  | 'language' | 'framework' | 'productivity' | 'accessibility'
  | 'devops' | 'testing' | 'documentation' | 'navigation'
  | 'refactoring' | 'ai-integration' | 'custom';

/** Publisher info */
export interface Publisher {
  id: string;
  name: string;
  displayName: string;
  verification: VerificationStatus;
  packCount: number;
  totalDownloads: number;
  joinedAt: number;
  avatarUrl?: string;
  website?: string;
}

/** Pack listing in marketplace */
export interface MarketplacePack {
  /** Unique pack ID */
  id: string;
  /** Display name */
  name: string;
  /** Version (semver) */
  version: string;
  /** Description */
  description: string;
  /** Publisher info */
  publisher: Publisher;
  /** Category */
  category: MarketplaceCategory;
  /** Pricing model */
  pricing: PricingModel;
  /** Price in cents (0 for free) */
  priceUsd: number;
  /** Average rating (1-5) */
  rating: number;
  /** Number of ratings */
  ratingCount: number;
  /** Total downloads */
  downloads: number;
  /** Number of commands in pack */
  commandCount: number;
  /** Supported languages (empty = all) */
  languages: string[];
  /** Tags for search */
  tags: string[];
  /** Last updated timestamp */
  updatedAt: number;
  /** Published timestamp */
  publishedAt: number;
  /** Whether this pack is featured */
  featured: boolean;
  /** Dependencies on other packs */
  dependencies: string[];
  /** Minimum VoxPilot version required */
  minVersion: string;
  /** Pack icon URL */
  iconUrl?: string;
  /** Screenshots */
  screenshots?: string[];
}

/** User review */
export interface PackReview {
  /** Review ID */
  id: string;
  /** Reviewer display name */
  author: string;
  /** Rating (1-5) */
  rating: number;
  /** Review text */
  text: string;
  /** Timestamp */
  timestamp: number;
  /** VoxPilot version at time of review */
  voxpilotVersion: string;
  /** Helpful votes */
  helpfulCount: number;
}

/** Search/filter options */
export interface MarketplaceSearchOptions {
  /** Text query */
  query?: string;
  /** Filter by category */
  category?: MarketplaceCategory;
  /** Minimum rating */
  minRating?: number;
  /** Filter by pricing */
  pricing?: PricingModel;
  /** Filter by language */
  language?: string;
  /** Sort by */
  sortBy?: 'relevance' | 'rating' | 'downloads' | 'updated' | 'name';
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
  /** Page number */
  page?: number;
  /** Results per page */
  pageSize?: number;
}

/** Search results */
export interface MarketplaceSearchResult {
  packs: MarketplacePack[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Installed pack state */
export interface InstalledPack {
  id: string;
  version: string;
  installedAt: number;
  autoUpdate: boolean;
  enabled: boolean;
}

/**
 * Marketplace client — handles browsing, installing, and managing packs.
 */
export class MarketplaceClient {
  private installed: Map<string, InstalledPack> = new Map();
  private registryUrl: string;
  private context: vscode.ExtensionContext | undefined;

  constructor(registryUrl?: string) {
    this.registryUrl = registryUrl || 'https://marketplace.voxpilot.dev/api/v1';
  }

  /** Initialize with extension context */
  init(extensionContext: vscode.ExtensionContext): void {
    this.context = extensionContext;
    this.loadInstalled();
  }

  /** Search the marketplace */
  async search(options: MarketplaceSearchOptions = {}): Promise<MarketplaceSearchResult> {
    const params = new URLSearchParams();
    if (options.query) params.set('q', options.query);
    if (options.category) params.set('category', options.category);
    if (options.minRating) params.set('minRating', String(options.minRating));
    if (options.pricing) params.set('pricing', options.pricing);
    if (options.language) params.set('language', options.language);
    if (options.sortBy) params.set('sort', options.sortBy);
    if (options.sortDirection) params.set('dir', options.sortDirection);
    if (options.page) params.set('page', String(options.page));
    if (options.pageSize) params.set('pageSize', String(options.pageSize));

    const url = `${this.registryUrl}/packs?${params.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Registry error: ${response.status}`);
      return (await response.json()) as MarketplaceSearchResult;
    } catch {
      // Return empty results on error
      return { packs: [], total: 0, page: 1, pageSize: 20, hasMore: false };
    }
  }

  /** Get pack details with reviews */
  async getPackDetails(packId: string): Promise<{ pack: MarketplacePack; reviews: PackReview[] } | null> {
    try {
      const response = await fetch(`${this.registryUrl}/packs/${packId}`);
      if (!response.ok) return null;
      return (await response.json()) as { pack: MarketplacePack; reviews: PackReview[] };
    } catch {
      return null;
    }
  }

  /** Install a pack */
  async install(packId: string, version?: string): Promise<boolean> {
    try {
      const url = version
        ? `${this.registryUrl}/packs/${packId}/download?version=${version}`
        : `${this.registryUrl}/packs/${packId}/download`;

      const response = await fetch(url);
      if (!response.ok) return false;

      const packData = (await response.json()) as { version?: string };

      this.installed.set(packId, {
        id: packId,
        version: packData.version || version || '1.0.0',
        installedAt: Date.now(),
        autoUpdate: true,
        enabled: true,
      });

      this.saveInstalled();
      return true;
    } catch {
      return false;
    }
  }

  /** Uninstall a pack */
  uninstall(packId: string): boolean {
    if (!this.installed.has(packId)) return false;
    this.installed.delete(packId);
    this.saveInstalled();
    return true;
  }

  /** Check if a pack is installed */
  isInstalled(packId: string): boolean {
    return this.installed.has(packId);
  }

  /** Get all installed packs */
  getInstalled(): InstalledPack[] {
    return [...this.installed.values()];
  }

  /** Get installed pack count */
  get installedCount(): number {
    return this.installed.size;
  }

  /** Enable/disable an installed pack */
  setEnabled(packId: string, enabled: boolean): boolean {
    const pack = this.installed.get(packId);
    if (!pack) return false;
    pack.enabled = enabled;
    this.saveInstalled();
    return true;
  }

  /** Set auto-update preference */
  setAutoUpdate(packId: string, autoUpdate: boolean): boolean {
    const pack = this.installed.get(packId);
    if (!pack) return false;
    pack.autoUpdate = autoUpdate;
    this.saveInstalled();
    return true;
  }

  /** Submit a review */
  async submitReview(packId: string, rating: number, text: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.registryUrl}/packs/${packId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, text, voxpilotVersion: vscode.version }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Report a pack */
  async reportPack(packId: string, reason: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.registryUrl}/packs/${packId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Check for updates on installed packs */
  async checkUpdates(): Promise<Array<{ id: string; currentVersion: string; latestVersion: string }>> {
    const updates: Array<{ id: string; currentVersion: string; latestVersion: string }> = [];

    for (const [id, pack] of this.installed) {
      if (!pack.autoUpdate) continue;
      try {
        const response = await fetch(`${this.registryUrl}/packs/${id}`);
        if (!response.ok) continue;
        const data = (await response.json()) as { pack?: { version?: string } };
        if (data.pack?.version && data.pack.version !== pack.version) {
          updates.push({ id, currentVersion: pack.version, latestVersion: data.pack.version });
        }
      } catch {
        continue;
      }
    }

    return updates;
  }

  /** Get featured packs */
  async getFeatured(): Promise<MarketplacePack[]> {
    const result = await this.search({ sortBy: 'downloads', pageSize: 10 });
    return result.packs.filter(p => p.featured);
  }

  private loadInstalled(): void {
    if (!this.context) return;
    const saved = this.context.globalState.get<Record<string, InstalledPack>>('marketplaceInstalled');
    if (saved) {
      this.installed = new Map(Object.entries(saved));
    }
  }

  private saveInstalled(): void {
    if (!this.context) return;
    this.context.globalState.update('marketplaceInstalled', Object.fromEntries(this.installed));
  }
}

/** Singleton instance */
export const marketplaceClient = new MarketplaceClient();
