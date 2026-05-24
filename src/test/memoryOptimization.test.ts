import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryOptimizer, AudioBufferPool } from '../memoryOptimization';

describe('AudioBufferPool', () => {
  let pool: AudioBufferPool;

  beforeEach(() => {
    pool = new AudioBufferPool(1024, 5);
  });

  it('starts empty', () => {
    expect(pool.size).toBe(0);
  });

  it('acquire allocates new buffer', () => {
    const buf = pool.acquire();
    expect(buf).toBeInstanceOf(Float32Array);
    expect(buf.length).toBe(1024);
  });

  it('release returns buffer to pool', () => {
    const buf = pool.acquire();
    pool.release(buf);
    expect(pool.size).toBe(1);
  });

  it('acquire reuses released buffer', () => {
    const buf1 = pool.acquire();
    pool.release(buf1);
    const buf2 = pool.acquire();
    expect(buf2).toBe(buf1); // Same reference
    expect(pool.size).toBe(0);
  });

  it('release zeros buffer for security', () => {
    const buf = pool.acquire();
    buf[0] = 1.0;
    buf[100] = 0.5;
    pool.release(buf);
    const reused = pool.acquire();
    expect(reused[0]).toBe(0);
    expect(reused[100]).toBe(0);
  });

  it('respects max pool size', () => {
    const buffers = Array.from({ length: 10 }, () => pool.acquire());
    for (const buf of buffers) pool.release(buf);
    expect(pool.size).toBe(5); // Max is 5
  });

  it('rejects wrong-sized buffers', () => {
    const wrongSize = new Float32Array(512);
    pool.release(wrongSize);
    expect(pool.size).toBe(0);
  });

  it('getStats tracks allocations and reuse', () => {
    pool.acquire(); // allocate
    pool.acquire(); // allocate
    const buf = pool.acquire(); // allocate
    pool.release(buf);
    pool.acquire(); // reuse

    const stats = pool.getStats();
    expect(stats.allocated).toBe(3);
    expect(stats.reused).toBe(1);
    expect(stats.reuseRate).toBeCloseTo(0.25);
  });

  it('clear empties the pool', () => {
    const buf = pool.acquire();
    pool.release(buf);
    pool.clear();
    expect(pool.size).toBe(0);
  });
});

describe('MemoryOptimizer', () => {
  let optimizer: MemoryOptimizer;

  beforeEach(() => {
    optimizer = new MemoryOptimizer();
  });

  it('starts with no modules or snapshots', () => {
    const status = optimizer.getModuleStatus();
    expect(status).toHaveLength(0);
    expect(optimizer.getSnapshots()).toHaveLength(0);
  });

  it('registerModule adds a lazy module', () => {
    optimizer.registerModule('test', 'Test Module', () => ({ value: 42 }), 1024);
    const status = optimizer.getModuleStatus();
    expect(status).toHaveLength(1);
    expect(status[0].loaded).toBe(false);
  });

  it('getModule loads on first access', () => {
    let loadCount = 0;
    optimizer.registerModule('counter', 'Counter', () => { loadCount++; return { count: loadCount }; });

    const result = optimizer.getModule<{ count: number }>('counter');
    expect(result?.count).toBe(1);
    expect(optimizer.isModuleLoaded('counter')).toBe(true);

    // Second access doesn't reload
    const result2 = optimizer.getModule<{ count: number }>('counter');
    expect(result2?.count).toBe(1); // Same instance
    expect(loadCount).toBe(1);
  });

  it('getModule returns undefined for unknown id', () => {
    expect(optimizer.getModule('nonexistent')).toBeUndefined();
  });

  it('unloadModule frees non-essential module', () => {
    optimizer.registerModule('temp', 'Temp', () => ({}));
    optimizer.getModule('temp'); // Load it
    expect(optimizer.isModuleLoaded('temp')).toBe(true);

    expect(optimizer.unloadModule('temp')).toBe(true);
    expect(optimizer.isModuleLoaded('temp')).toBe(false);
  });

  it('unloadModule cannot unload essential modules', () => {
    optimizer.registerModule('core', 'Core', () => ({}), 0, true);
    optimizer.getModule('core');
    expect(optimizer.unloadModule('core')).toBe(false);
    expect(optimizer.isModuleLoaded('core')).toBe(true);
  });

  it('unloadModule returns false for unloaded module', () => {
    optimizer.registerModule('test', 'Test', () => ({}));
    expect(optimizer.unloadModule('test')).toBe(false);
  });

  it('unloadStale unloads old modules', async () => {
    optimizer.registerModule('old', 'Old', () => ({}));
    optimizer.getModule('old');

    // Wait a tiny bit so lastAccess is in the past
    await new Promise(r => setTimeout(r, 5));
    const unloaded = optimizer.unloadStale(1);
    expect(unloaded).toBe(1);
  });

  it('takeSnapshot records memory state', () => {
    const snapshot = optimizer.takeSnapshot('idle');
    expect(snapshot.timestamp).toBeGreaterThan(0);
    expect(snapshot.state).toBe('idle');
    expect(optimizer.getSnapshots()).toHaveLength(1);
  });

  it('getLatestSnapshot returns most recent', () => {
    optimizer.takeSnapshot('idle');
    optimizer.takeSnapshot('recording');
    const latest = optimizer.getLatestSnapshot();
    expect(latest?.state).toBe('recording');
  });

  it('isWithinBudget returns boolean', () => {
    const result = optimizer.isWithinBudget('idle');
    expect(typeof result).toBe('boolean');
  });

  it('cleanup unloads stale modules and clears pool', () => {
    optimizer.registerModule('stale', 'Stale', () => ({}));
    optimizer.getModule('stale');

    const pool = optimizer.getBufferPool();
    const buf = pool.acquire();
    pool.release(buf);

    const result = optimizer.cleanup();
    expect(result.clearedBuffers).toBe(true);
    expect(pool.size).toBe(0);
  });

  it('onCleanup registers callback', () => {
    let called = false;
    optimizer.onCleanup(() => { called = true; });
    optimizer.cleanup();
    expect(called).toBe(true);
  });

  it('onCleanup dispose removes callback', () => {
    let count = 0;
    const disposable = optimizer.onCleanup(() => { count++; });
    optimizer.cleanup();
    expect(count).toBe(1);

    disposable.dispose();
    optimizer.cleanup();
    expect(count).toBe(1);
  });

  it('getSummary returns memory info', () => {
    optimizer.registerModule('a', 'A', () => ({}));
    optimizer.registerModule('b', 'B', () => ({}));
    optimizer.getModule('a');

    const summary = optimizer.getSummary();
    expect(summary.totalModules).toBe(2);
    expect(summary.loadedModules).toBe(1);
    expect(summary.currentHeapMb).toBeGreaterThanOrEqual(0);
    expect(summary.snapshotCount).toBe(0);
  });

  it('getBudget returns current budget', () => {
    const budget = optimizer.getBudget();
    expect(budget.idleMaxBytes).toBe(50 * 1024 * 1024);
    expect(budget.autoCleanup).toBe(true);
  });

  it('setBudget updates budget', () => {
    optimizer.setBudget({ idleMaxBytes: 100 * 1024 * 1024 });
    expect(optimizer.getBudget().idleMaxBytes).toBe(100 * 1024 * 1024);
  });

  it('getBufferPool returns the pool instance', () => {
    const pool = optimizer.getBufferPool();
    expect(pool).toBeInstanceOf(AudioBufferPool);
  });
});
