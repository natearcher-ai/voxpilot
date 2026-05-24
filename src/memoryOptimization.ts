/**
 * Memory Optimization — reduce extension memory footprint by lazy-loading modules.
 *
 * Provides utilities for:
 *   - Lazy module loading (defer non-essential features until first use)
 *   - Memory pool management (reuse audio buffers instead of allocating new ones)
 *   - Garbage collection hints after heavy operations
 *   - Memory usage monitoring with configurable thresholds
 *   - Automatic cleanup of stale caches and buffers
 *   - Module unloading for features that haven't been used recently
 *
 * Memory budget targets:
 *   - Idle: <50MB heap
 *   - Active (recording): <80MB heap
 *   - Peak (model load): <150MB heap (temporary)
 *
 * Enable via `voxpilot.memoryOptimization.enabled` setting (default: true).
 */

import * as vscode from 'vscode';

/** Memory usage snapshot */
export interface MemorySnapshot {
  /** Heap used in bytes */
  heapUsed: number;
  /** Heap total in bytes */
  heapTotal: number;
  /** RSS in bytes */
  rss: number;
  /** External memory in bytes */
  external: number;
  /** Timestamp */
  timestamp: number;
  /** State at time of snapshot */
  state: 'idle' | 'recording' | 'processing' | 'model-loading';
}

/** Memory budget configuration */
export interface MemoryBudget {
  /** Max heap for idle state (bytes) */
  idleMaxBytes: number;
  /** Max heap for active state (bytes) */
  activeMaxBytes: number;
  /** Max heap for peak operations (bytes) */
  peakMaxBytes: number;
  /** Warning threshold (percentage of max) */
  warningThreshold: number;
  /** Whether to auto-cleanup when over budget */
  autoCleanup: boolean;
}

/** Default memory budget */
export const DEFAULT_MEMORY_BUDGET: MemoryBudget = {
  idleMaxBytes: 50 * 1024 * 1024,    // 50MB
  activeMaxBytes: 80 * 1024 * 1024,   // 80MB
  peakMaxBytes: 150 * 1024 * 1024,    // 150MB
  warningThreshold: 0.8,              // 80% of max
  autoCleanup: true,
};

/** Lazy-loaded module entry */
export interface LazyModule {
  /** Module identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Whether the module is currently loaded */
  loaded: boolean;
  /** Last access timestamp (0 = never accessed) */
  lastAccess: number;
  /** Estimated memory cost in bytes */
  estimatedBytes: number;
  /** Load function */
  loader: () => unknown;
  /** Cached instance */
  instance?: unknown;
  /** Whether this module is essential (cannot be unloaded) */
  essential: boolean;
}

/** Buffer pool for audio data reuse */
export class AudioBufferPool {
  private pool: Float32Array[] = [];
  private maxPoolSize: number;
  private bufferSize: number;
  private allocated: number = 0;
  private reused: number = 0;

  constructor(bufferSize: number = 16000, maxPoolSize: number = 10) {
    this.bufferSize = bufferSize;
    this.maxPoolSize = maxPoolSize;
  }

  /** Acquire a buffer from the pool (or allocate new) */
  acquire(): Float32Array {
    if (this.pool.length > 0) {
      this.reused++;
      return this.pool.pop()!;
    }
    this.allocated++;
    return new Float32Array(this.bufferSize);
  }

  /** Return a buffer to the pool */
  release(buffer: Float32Array): void {
    if (buffer.length !== this.bufferSize) return; // Wrong size, discard
    if (this.pool.length >= this.maxPoolSize) return; // Pool full, let GC handle it

    // Zero out for security
    buffer.fill(0);
    this.pool.push(buffer);
  }

  /** Get pool statistics */
  getStats(): { poolSize: number; allocated: number; reused: number; reuseRate: number } {
    const total = this.allocated + this.reused;
    return {
      poolSize: this.pool.length,
      allocated: this.allocated,
      reused: this.reused,
      reuseRate: total > 0 ? this.reused / total : 0,
    };
  }

  /** Clear the pool */
  clear(): void {
    this.pool = [];
  }

  /** Get current pool size */
  get size(): number {
    return this.pool.length;
  }
}

/**
 * Memory Optimization manager — handles lazy loading, pooling, and monitoring.
 */
export class MemoryOptimizer {
  private modules: Map<string, LazyModule> = new Map();
  private snapshots: MemorySnapshot[] = [];
  private budget: MemoryBudget;
  private bufferPool: AudioBufferPool;
  private cleanupCallbacks: (() => void)[] = [];
  private maxSnapshots: number = 1000;

  constructor(budget: MemoryBudget = DEFAULT_MEMORY_BUDGET) {
    this.budget = { ...budget };
    this.bufferPool = new AudioBufferPool();
  }

  /** Get current memory budget */
  getBudget(): MemoryBudget {
    return { ...this.budget };
  }

  /** Update memory budget */
  setBudget(updates: Partial<MemoryBudget>): void {
    this.budget = { ...this.budget, ...updates };
  }

  /** Get the audio buffer pool */
  getBufferPool(): AudioBufferPool {
    return this.bufferPool;
  }

  /** Register a lazy-loadable module */
  registerModule(id: string, name: string, loader: () => unknown, estimatedBytes: number = 0, essential: boolean = false): void {
    this.modules.set(id, {
      id,
      name,
      loaded: false,
      lastAccess: 0,
      estimatedBytes,
      loader,
      essential,
    });
  }

  /** Get a lazy-loaded module (loads on first access) */
  getModule<T>(id: string): T | undefined {
    const mod = this.modules.get(id);
    if (!mod) return undefined;

    if (!mod.loaded) {
      mod.instance = mod.loader();
      mod.loaded = true;
    }
    mod.lastAccess = Date.now();
    return mod.instance as T;
  }

  /** Check if a module is loaded */
  isModuleLoaded(id: string): boolean {
    return this.modules.get(id)?.loaded ?? false;
  }

  /** Unload a non-essential module to free memory */
  unloadModule(id: string): boolean {
    const mod = this.modules.get(id);
    if (!mod || mod.essential || !mod.loaded) return false;

    mod.instance = undefined;
    mod.loaded = false;
    return true;
  }

  /** Unload modules not accessed within the given time (ms) */
  unloadStale(maxAgeMs: number = 300000): number {
    const cutoff = Date.now() - maxAgeMs;
    let unloaded = 0;

    for (const mod of this.modules.values()) {
      if (!mod.essential && mod.loaded && mod.lastAccess < cutoff) {
        mod.instance = undefined;
        mod.loaded = false;
        unloaded++;
      }
    }

    return unloaded;
  }

  /** Get all registered modules with their status */
  getModuleStatus(): Array<{ id: string; name: string; loaded: boolean; lastAccess: number; estimatedBytes: number }> {
    return [...this.modules.values()].map(m => ({
      id: m.id,
      name: m.name,
      loaded: m.loaded,
      lastAccess: m.lastAccess,
      estimatedBytes: m.estimatedBytes,
    }));
  }

  /** Take a memory snapshot */
  takeSnapshot(state: MemorySnapshot['state'] = 'idle'): MemorySnapshot {
    const mem = process.memoryUsage?.() || { heapUsed: 0, heapTotal: 0, rss: 0, external: 0 };
    const snapshot: MemorySnapshot = {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
      timestamp: Date.now(),
      state,
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-500);
    }

    // Check budget
    if (this.budget.autoCleanup) {
      this.checkBudget(snapshot);
    }

    return snapshot;
  }

  /** Get memory snapshots */
  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  /** Get latest snapshot */
  getLatestSnapshot(): MemorySnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  /** Check if current memory is within budget */
  isWithinBudget(state: MemorySnapshot['state'] = 'idle'): boolean {
    const mem = process.memoryUsage?.();
    if (!mem) return true;

    const maxBytes = state === 'idle' ? this.budget.idleMaxBytes
      : state === 'model-loading' ? this.budget.peakMaxBytes
      : this.budget.activeMaxBytes;

    return mem.heapUsed < maxBytes;
  }

  /** Register a cleanup callback (called when over budget) */
  onCleanup(callback: () => void): vscode.Disposable {
    this.cleanupCallbacks.push(callback);
    return {
      dispose: () => {
        const idx = this.cleanupCallbacks.indexOf(callback);
        if (idx >= 0) this.cleanupCallbacks.splice(idx, 1);
      },
    };
  }

  /** Force a cleanup cycle */
  cleanup(): { unloadedModules: number; clearedBuffers: boolean } {
    // Unload stale modules (not used in 5 minutes)
    const unloaded = this.unloadStale(300000);

    // Clear buffer pool
    this.bufferPool.clear();

    // Notify cleanup callbacks
    for (const cb of this.cleanupCallbacks) {
      try { cb(); } catch { /* swallow */ }
    }

    return { unloadedModules: unloaded, clearedBuffers: true };
  }

  /** Get memory usage summary */
  getSummary(): {
    currentHeapMb: number;
    budgetUsedPercent: number;
    loadedModules: number;
    totalModules: number;
    bufferPoolStats: ReturnType<AudioBufferPool['getStats']>;
    snapshotCount: number;
  } {
    const mem = process.memoryUsage?.();
    const heapUsed = mem?.heapUsed || 0;

    return {
      currentHeapMb: Math.round(heapUsed / 1048576 * 10) / 10,
      budgetUsedPercent: Math.round((heapUsed / this.budget.idleMaxBytes) * 100),
      loadedModules: [...this.modules.values()].filter(m => m.loaded).length,
      totalModules: this.modules.size,
      bufferPoolStats: this.bufferPool.getStats(),
      snapshotCount: this.snapshots.length,
    };
  }

  private checkBudget(snapshot: MemorySnapshot): void {
    const maxBytes = snapshot.state === 'idle' ? this.budget.idleMaxBytes
      : snapshot.state === 'model-loading' ? this.budget.peakMaxBytes
      : this.budget.activeMaxBytes;

    const threshold = maxBytes * this.budget.warningThreshold;

    if (snapshot.heapUsed > threshold) {
      this.cleanup();
    }
  }
}

/** Singleton instance */
export const memoryOptimizer = new MemoryOptimizer();
