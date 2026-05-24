import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorRecoveryManager, calculateBackoff, isRetryable, classifyError, DEFAULT_RETRY_CONFIG } from '../errorRecovery';

describe('calculateBackoff', () => {
  it('increases delay with each attempt', () => {
    const d0 = calculateBackoff(0, { ...DEFAULT_RETRY_CONFIG, jitter: false });
    const d1 = calculateBackoff(1, { ...DEFAULT_RETRY_CONFIG, jitter: false });
    const d2 = calculateBackoff(2, { ...DEFAULT_RETRY_CONFIG, jitter: false });
    expect(d1).toBeGreaterThan(d0);
    expect(d2).toBeGreaterThan(d1);
  });

  it('respects maxDelayMs', () => {
    const delay = calculateBackoff(100, { ...DEFAULT_RETRY_CONFIG, jitter: false });
    expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_CONFIG.maxDelayMs);
  });

  it('adds jitter when enabled', () => {
    const delays = Array.from({ length: 10 }, () => calculateBackoff(1, { ...DEFAULT_RETRY_CONFIG, jitter: true }));
    const unique = new Set(delays);
    expect(unique.size).toBeGreaterThan(1); // Should vary
  });

  it('first attempt uses initialDelayMs', () => {
    const delay = calculateBackoff(0, { ...DEFAULT_RETRY_CONFIG, jitter: false });
    expect(delay).toBe(DEFAULT_RETRY_CONFIG.initialDelayMs);
  });
});

describe('isRetryable', () => {
  it('returns true for timeout errors', () => {
    expect(isRetryable(new Error('Connection timeout'))).toBe(true);
  });

  it('returns true for network errors', () => {
    expect(isRetryable(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryable(new Error('socket hang up'))).toBe(true);
  });

  it('returns true for rate limit errors', () => {
    expect(isRetryable(new Error('429 Too Many Requests'))).toBe(true);
  });

  it('returns true for 503 errors', () => {
    expect(isRetryable(new Error('503 Service Unavailable'))).toBe(true);
  });

  it('returns false for 404 errors', () => {
    expect(isRetryable(new Error('404 Not Found'))).toBe(false);
  });

  it('returns false for permission errors', () => {
    expect(isRetryable(new Error('403 Permission Denied'))).toBe(false);
  });

  it('returns false for invalid input', () => {
    expect(isRetryable(new Error('Invalid JSON syntax error'))).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe('classifyError', () => {
  it('classifies audio errors', () => {
    const result = classifyError(new Error('Audio capture failed: no microphone'));
    expect(result.category).toBe('audio');
  });

  it('classifies model errors', () => {
    const result = classifyError(new Error('ONNX model inference failed'));
    expect(result.category).toBe('model');
  });

  it('classifies network errors', () => {
    const result = classifyError(new Error('fetch timeout after 30s'));
    expect(result.category).toBe('network');
    expect(result.type).toBe('transient');
  });

  it('classifies filesystem errors', () => {
    const result = classifyError(new Error('ENOENT: file not found'));
    expect(result.category).toBe('filesystem');
  });

  it('uses subsystem hint', () => {
    const result = classifyError(new Error('something broke'), 'audio-capture');
    expect(result.category).toBe('audio');
  });

  it('defaults to unknown for unrecognized errors', () => {
    const result = classifyError(new Error('something weird happened'));
    expect(result.category).toBe('unknown');
  });
});

describe('ErrorRecoveryManager', () => {
  let manager: ErrorRecoveryManager;

  beforeEach(() => {
    manager = new ErrorRecoveryManager();
  });

  it('starts with no errors or subsystems', () => {
    expect(manager.errorCount).toBe(0);
    expect(manager.subsystemCount).toBe(0);
  });

  it('registerSubsystem adds circuit breaker', () => {
    manager.registerSubsystem('audio');
    expect(manager.subsystemCount).toBe(1);
    expect(manager.isAvailable('audio')).toBe(true);
  });

  it('isAvailable returns true for unregistered subsystems', () => {
    expect(manager.isAvailable('unknown')).toBe(true);
  });

  it('recordSuccess keeps circuit closed', () => {
    manager.registerSubsystem('audio');
    manager.recordSuccess('audio');
    expect(manager.isAvailable('audio')).toBe(true);
    expect(manager.isDegraded('audio')).toBe(false);
  });

  it('recordFailure increments error count', () => {
    manager.registerSubsystem('audio');
    manager.recordFailure('audio', new Error('mic failed'));
    expect(manager.errorCount).toBe(1);
  });

  it('circuit opens after threshold failures', () => {
    manager.registerSubsystem('audio', 3, 60000);

    manager.recordFailure('audio', new Error('fail 1'));
    manager.recordFailure('audio', new Error('fail 2'));
    expect(manager.isAvailable('audio')).toBe(true);

    manager.recordFailure('audio', new Error('fail 3'));
    expect(manager.isAvailable('audio')).toBe(false);
    expect(manager.isDegraded('audio')).toBe(true);
  });

  it('getDegradedSubsystems returns degraded list', () => {
    manager.registerSubsystem('audio', 2);
    manager.registerSubsystem('model', 2);

    manager.recordFailure('audio', new Error('fail'));
    manager.recordFailure('audio', new Error('fail'));

    expect(manager.getDegradedSubsystems()).toContain('audio');
    expect(manager.getDegradedSubsystems()).not.toContain('model');
  });

  it('resetCircuit restores availability', () => {
    manager.registerSubsystem('audio', 2);
    manager.recordFailure('audio', new Error('fail'));
    manager.recordFailure('audio', new Error('fail'));
    expect(manager.isAvailable('audio')).toBe(false);

    manager.resetCircuit('audio');
    expect(manager.isAvailable('audio')).toBe(true);
    expect(manager.isDegraded('audio')).toBe(false);
  });

  it('resetCircuit returns false for unknown subsystem', () => {
    expect(manager.resetCircuit('nonexistent')).toBe(false);
  });

  it('withRetry succeeds on first try', async () => {
    manager.registerSubsystem('test');
    const result = await manager.withRetry('test', async () => 'success');
    expect(result).toBe('success');
  });

  it('withRetry retries on transient failure', async () => {
    manager.registerSubsystem('test');
    let attempts = 0;

    const result = await manager.withRetry('test', async () => {
      attempts++;
      if (attempts < 3) throw new Error('timeout');
      return 'recovered';
    }, { maxRetries: 3, initialDelayMs: 10, maxDelayMs: 50, backoffMultiplier: 2, jitter: false });

    expect(result).toBe('recovered');
    expect(attempts).toBe(3);
  });

  it('withRetry throws after max retries', async () => {
    manager.registerSubsystem('test');

    await expect(
      manager.withRetry('test', async () => {
        throw new Error('timeout');
      }, { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 50, backoffMultiplier: 2, jitter: false }),
    ).rejects.toThrow('timeout');
  });

  it('withRetry throws immediately for non-retryable errors', async () => {
    manager.registerSubsystem('test');
    let attempts = 0;

    await expect(
      manager.withRetry('test', async () => {
        attempts++;
        throw new Error('404 Not Found');
      }, { maxRetries: 3, initialDelayMs: 10, maxDelayMs: 50, backoffMultiplier: 2, jitter: false }),
    ).rejects.toThrow('404');

    expect(attempts).toBe(1); // No retries for permanent errors
  });

  it('withRetry throws when circuit is open', async () => {
    manager.registerSubsystem('test', 2);
    manager.recordFailure('test', new Error('fail'));
    manager.recordFailure('test', new Error('fail'));

    await expect(
      manager.withRetry('test', async () => 'should not run'),
    ).rejects.toThrow('unavailable');
  });

  it('getHealth returns status for all subsystems', () => {
    manager.registerSubsystem('audio');
    manager.registerSubsystem('model');
    manager.recordFailure('audio', new Error('test'));

    const health = manager.getHealth();
    expect(health).toHaveLength(2);
    expect(health.find(h => h.name === 'audio')?.recentErrors).toBe(1);
  });

  it('getRecentErrors returns last N errors', () => {
    manager.registerSubsystem('test');
    for (let i = 0; i < 30; i++) {
      manager.recordFailure('test', new Error(`error ${i}`));
    }

    const recent = manager.getRecentErrors(10);
    expect(recent).toHaveLength(10);
    expect(recent[9].message).toBe('error 29');
  });

  it('getErrorCounts groups by category', () => {
    manager.registerSubsystem('test');
    manager.recordFailure('test', new Error('Audio capture failed'));
    manager.recordFailure('test', new Error('ONNX model crash'));
    manager.recordFailure('test', new Error('fetch timeout'));

    const counts = manager.getErrorCounts();
    expect(counts.audio).toBe(1);
    expect(counts.model).toBe(1);
    expect(counts.network).toBe(1);
  });

  it('clearErrors removes all errors', () => {
    manager.registerSubsystem('test');
    manager.recordFailure('test', new Error('fail'));
    manager.clearErrors();
    expect(manager.errorCount).toBe(0);
  });
});
