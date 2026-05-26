import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateBackoff,
  isRetryable,
  classifyError,
  ErrorRecoveryManager,
  DEFAULT_RETRY_CONFIG,
} from '../errorRecovery';

describe('calculateBackoff', () => {
  const config = { ...DEFAULT_RETRY_CONFIG, jitter: false };

  it('returns initialDelayMs for attempt 0', () => {
    expect(calculateBackoff(0, config)).toBe(1000);
  });

  it('doubles each attempt', () => {
    expect(calculateBackoff(1, config)).toBe(2000);
    expect(calculateBackoff(2, config)).toBe(4000);
    expect(calculateBackoff(3, config)).toBe(8000);
  });

  it('caps at maxDelayMs', () => {
    expect(calculateBackoff(10, config)).toBe(30000);
    expect(calculateBackoff(20, config)).toBe(30000);
  });

  it('adds jitter when enabled', () => {
    const jitterConfig = { ...DEFAULT_RETRY_CONFIG, jitter: true };
    const results = new Set<number>();
    for (let i = 0; i < 10; i++) {
      results.add(calculateBackoff(0, jitterConfig));
    }
    // With jitter, not all values should be the same
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('isRetryable', () => {
  it('returns true for timeout errors', () => {
    expect(isRetryable(new Error('Connection timeout'))).toBe(true);
    expect(isRetryable(new Error('ECONNRESET'))).toBe(true);
  });

  it('returns true for rate limit errors', () => {
    expect(isRetryable(new Error('rate limit exceeded'))).toBe(true);
    expect(isRetryable(new Error('HTTP 429'))).toBe(true);
  });

  it('returns false for permission errors', () => {
    expect(isRetryable(new Error('Permission denied'))).toBe(false);
    expect(isRetryable(new Error('HTTP 403'))).toBe(false);
  });

  it('returns false for not found errors', () => {
    expect(isRetryable(new Error('Not found'))).toBe(false);
    expect(isRetryable(new Error('HTTP 404'))).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe('classifyError', () => {
  it('classifies audio errors', () => {
    const result = classifyError(new Error('audio capture failed'));
    expect(result.category).toBe('audio');
  });

  it('classifies model errors', () => {
    const result = classifyError(new Error('ONNX model failed to load'));
    expect(result.category).toBe('model');
  });

  it('classifies network errors', () => {
    const result = classifyError(new Error('network timeout'));
    expect(result.category).toBe('network');
    expect(result.type).toBe('transient');
  });

  it('classifies filesystem errors', () => {
    const result = classifyError(new Error('ENOENT: file not found'));
    expect(result.category).toBe('filesystem');
  });

  it('uses subsystem hint when message is ambiguous', () => {
    const result = classifyError(new Error('something went wrong'), 'audio-capture');
    expect(result.category).toBe('audio');
  });
});

describe('ErrorRecoveryManager', () => {
  let manager: ErrorRecoveryManager;

  beforeEach(() => {
    manager = new ErrorRecoveryManager();
  });

  it('starts with no errors', () => {
    expect(manager.errorCount).toBe(0);
  });

  it('records failures', () => {
    manager.registerSubsystem('audio');
    manager.recordFailure('audio', new Error('mic disconnected'));
    expect(manager.errorCount).toBe(1);
  });

  it('circuit breaker opens after threshold failures', () => {
    manager.registerSubsystem('audio', 3); // threshold = 3

    manager.recordFailure('audio', new Error('fail 1'));
    manager.recordFailure('audio', new Error('fail 2'));
    expect(manager.isAvailable('audio')).toBe(true);

    manager.recordFailure('audio', new Error('fail 3'));
    expect(manager.isAvailable('audio')).toBe(false);
    expect(manager.isDegraded('audio')).toBe(true);
  });

  it('circuit breaker resets after timeout', () => {
    vi.useFakeTimers();
    manager.registerSubsystem('audio', 2, 5000); // threshold=2, resetTimeout=5s

    manager.recordFailure('audio', new Error('fail 1'));
    manager.recordFailure('audio', new Error('fail 2'));
    expect(manager.isAvailable('audio')).toBe(false);

    vi.advanceTimersByTime(5001);
    expect(manager.isAvailable('audio')).toBe(true); // half-open

    vi.useRealTimers();
  });

  it('recordSuccess resets circuit from half-open to closed', () => {
    vi.useFakeTimers();
    manager.registerSubsystem('audio', 2, 1000);

    manager.recordFailure('audio', new Error('fail'));
    manager.recordFailure('audio', new Error('fail'));
    vi.advanceTimersByTime(1001); // half-open

    manager.recordSuccess('audio');
    // Should be closed again
    expect(manager.isAvailable('audio')).toBe(true);
    expect(manager.isDegraded('audio')).toBe(false);

    vi.useRealTimers();
  });

  it('resetCircuit manually resets a circuit', () => {
    manager.registerSubsystem('audio', 1);
    manager.recordFailure('audio', new Error('fail'));
    expect(manager.isAvailable('audio')).toBe(false);

    manager.resetCircuit('audio');
    expect(manager.isAvailable('audio')).toBe(true);
  });

  it('getHealth returns subsystem status', () => {
    manager.registerSubsystem('audio');
    manager.registerSubsystem('model');

    const health = manager.getHealth();
    expect(health.length).toBe(2);
    expect(health[0].name).toBe('audio');
    expect(health[0].healthy).toBe(true);
  });

  it('isAvailable returns true for unregistered subsystems', () => {
    expect(manager.isAvailable('unknown-subsystem')).toBe(true);
  });
});

import { vi } from 'vitest';
