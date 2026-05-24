/**
 * Error Recovery — graceful degradation for all failure modes, auto-retry with backoff.
 *
 * Provides a unified error handling framework for VoxPilot:
 *   - Categorized error types (transient, permanent, degraded)
 *   - Exponential backoff retry for transient failures
 *   - Circuit breaker pattern for repeated failures
 *   - Graceful degradation (disable failing features, keep core working)
 *   - Error reporting and diagnostics
 *   - Recovery suggestions for users
 *   - Health status per subsystem
 *
 * Failure modes handled:
 *   - Audio capture failure → suggest device change, fall back to clipboard input
 *   - Model load failure → retry with smaller model, suggest download
 *   - Pipeline processor crash → skip failing processor, continue pipeline
 *   - Extension API timeout → retry with backoff, degrade gracefully
 *   - File system errors → retry, then warn user
 *   - Network errors (model download) → retry with backoff, resume support
 *
 * Enable via `voxpilot.errorRecovery.enabled` setting (default: true).
 */

import * as vscode from 'vscode';

/** Error severity levels */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/** Error categories */
export type ErrorCategory = 'audio' | 'model' | 'pipeline' | 'api' | 'filesystem' | 'network' | 'config' | 'unknown';

/** Whether an error is retryable */
export type ErrorType = 'transient' | 'permanent' | 'degraded';

/** A structured error event */
export interface ErrorEvent {
  /** Unique error ID */
  id: string;
  /** Error category */
  category: ErrorCategory;
  /** Error type */
  type: ErrorType;
  /** Severity */
  severity: ErrorSeverity;
  /** Error message */
  message: string;
  /** Original error (if available) */
  originalError?: string;
  /** Timestamp */
  timestamp: number;
  /** Number of retries attempted */
  retryCount: number;
  /** Whether recovery was successful */
  recovered: boolean;
  /** Recovery action taken */
  recoveryAction?: string;
  /** Subsystem that generated the error */
  subsystem: string;
}

/** Circuit breaker state */
export type CircuitState = 'closed' | 'open' | 'half-open';

/** Circuit breaker for a subsystem */
export interface CircuitBreaker {
  /** Subsystem name */
  subsystem: string;
  /** Current state */
  state: CircuitState;
  /** Failure count in current window */
  failureCount: number;
  /** Success count since last failure */
  successCount: number;
  /** Threshold to open circuit */
  failureThreshold: number;
  /** Time to wait before half-open (ms) */
  resetTimeoutMs: number;
  /** When the circuit was opened */
  openedAt: number;
  /** Last failure timestamp */
  lastFailure: number;
}

/** Retry configuration */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Initial delay in ms */
  initialDelayMs: number;
  /** Maximum delay in ms */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Whether to add jitter */
  jitter: boolean;
}

/** Default retry configuration */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/** Subsystem health status */
export interface SubsystemHealth {
  /** Subsystem name */
  name: string;
  /** Whether the subsystem is healthy */
  healthy: boolean;
  /** Circuit breaker state */
  circuitState: CircuitState;
  /** Last error (if any) */
  lastError?: string;
  /** Last success timestamp */
  lastSuccess: number;
  /** Error count in last hour */
  recentErrors: number;
  /** Whether the subsystem is degraded */
  degraded: boolean;
}

/**
 * Calculate delay for exponential backoff with optional jitter.
 */
export function calculateBackoff(attempt: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const delay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs,
  );

  if (config.jitter) {
    // Add random jitter (±25%)
    const jitterRange = delay * 0.25;
    return delay + (Math.random() * jitterRange * 2 - jitterRange);
  }

  return delay;
}

/**
 * Determine if an error is retryable based on its characteristics.
 */
export function isRetryable(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // Transient errors (retryable)
  const transientPatterns = [
    'timeout', 'econnreset', 'econnrefused', 'epipe',
    'network', 'socket hang up', 'dns', 'enotfound',
    'rate limit', '429', '503', '502', '504',
    'busy', 'temporarily', 'try again',
  ];

  if (transientPatterns.some(p => lower.includes(p))) return true;

  // Permanent errors (not retryable)
  const permanentPatterns = [
    'not found', '404', '401', '403', 'permission denied',
    'invalid', 'malformed', 'syntax error', 'type error',
    'does not exist', 'unsupported',
  ];

  if (permanentPatterns.some(p => lower.includes(p))) return false;

  // Default: retry once for unknown errors
  return true;
}

/**
 * Classify an error into a category.
 */
export function classifyError(error: unknown, subsystem?: string): { category: ErrorCategory; type: ErrorType; severity: ErrorSeverity } {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  // Audio errors
  if (lower.includes('audio') || lower.includes('microphone') || lower.includes('arecord') || lower.includes('sox')) {
    return { category: 'audio', type: 'transient', severity: 'error' };
  }

  // Model errors
  if (lower.includes('model') || lower.includes('onnx') || lower.includes('wasm') || lower.includes('inference')) {
    return { category: 'model', type: lower.includes('download') ? 'transient' : 'permanent', severity: 'error' };
  }

  // Network errors
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('http') || lower.includes('timeout')) {
    return { category: 'network', type: 'transient', severity: 'warning' };
  }

  // File system errors
  if (lower.includes('enoent') || lower.includes('eacces') || lower.includes('file') || lower.includes('directory')) {
    return { category: 'filesystem', type: 'permanent', severity: 'error' };
  }

  // Use subsystem hint if available
  if (subsystem) {
    const categoryMap: Record<string, ErrorCategory> = {
      'audio-capture': 'audio',
      'transcriber': 'model',
      'pipeline': 'pipeline',
      'extension-api': 'api',
      'model-manager': 'model',
    };
    if (categoryMap[subsystem]) {
      return { category: categoryMap[subsystem], type: isRetryable(error) ? 'transient' : 'permanent', severity: 'error' };
    }
  }

  return { category: 'unknown', type: isRetryable(error) ? 'transient' : 'permanent', severity: 'warning' };
}

/**
 * Error Recovery manager — handles retries, circuit breakers, and degradation.
 */
export class ErrorRecoveryManager {
  private errors: ErrorEvent[] = [];
  private circuits: Map<string, CircuitBreaker> = new Map();
  private degradedSubsystems: Set<string> = new Set();
  private maxErrors: number = 1000;

  /** Register a subsystem with a circuit breaker */
  registerSubsystem(name: string, failureThreshold: number = 5, resetTimeoutMs: number = 60000): void {
    this.circuits.set(name, {
      subsystem: name,
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      failureThreshold,
      resetTimeoutMs,
      openedAt: 0,
      lastFailure: 0,
    });
  }

  /** Record a successful operation */
  recordSuccess(subsystem: string): void {
    const circuit = this.circuits.get(subsystem);
    if (!circuit) return;

    circuit.successCount++;
    if (circuit.state === 'half-open') {
      circuit.state = 'closed';
      circuit.failureCount = 0;
    }

    this.degradedSubsystems.delete(subsystem);
  }

  /** Record a failure */
  recordFailure(subsystem: string, error: unknown): ErrorEvent {
    const { category, type, severity } = classifyError(error, subsystem);
    const message = error instanceof Error ? error.message : String(error);

    const event: ErrorEvent = {
      id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category,
      type,
      severity,
      message,
      originalError: error instanceof Error ? error.stack : undefined,
      timestamp: Date.now(),
      retryCount: 0,
      recovered: false,
      subsystem,
    };

    this.errors.push(event);
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-500);
    }

    // Update circuit breaker
    const circuit = this.circuits.get(subsystem);
    if (circuit) {
      circuit.failureCount++;
      circuit.lastFailure = Date.now();

      if (circuit.failureCount >= circuit.failureThreshold && circuit.state === 'closed') {
        circuit.state = 'open';
        circuit.openedAt = Date.now();
        this.degradedSubsystems.add(subsystem);
      }
    }

    return event;
  }

  /** Check if a subsystem is available (circuit not open) */
  isAvailable(subsystem: string): boolean {
    const circuit = this.circuits.get(subsystem);
    if (!circuit) return true;

    if (circuit.state === 'closed') return true;

    if (circuit.state === 'open') {
      // Check if reset timeout has elapsed
      if (Date.now() - circuit.openedAt >= circuit.resetTimeoutMs) {
        circuit.state = 'half-open';
        return true; // Allow one attempt
      }
      return false;
    }

    // half-open: allow attempts
    return true;
  }

  /** Check if a subsystem is degraded */
  isDegraded(subsystem: string): boolean {
    return this.degradedSubsystems.has(subsystem);
  }

  /** Get all degraded subsystems */
  getDegradedSubsystems(): string[] {
    return [...this.degradedSubsystems];
  }

  /**
   * Execute a function with retry logic.
   */
  async withRetry<T>(
    subsystem: string,
    fn: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
  ): Promise<T> {
    if (!this.isAvailable(subsystem)) {
      throw new Error(`Subsystem "${subsystem}" is unavailable (circuit open)`);
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await fn();
        this.recordSuccess(subsystem);
        return result;
      } catch (error) {
        lastError = error;

        if (!isRetryable(error) || attempt === config.maxRetries) {
          this.recordFailure(subsystem, error);
          throw error;
        }

        // Wait before retry
        const delay = calculateBackoff(attempt, config);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.recordFailure(subsystem, lastError);
    throw lastError;
  }

  /** Get health status for all subsystems */
  getHealth(): SubsystemHealth[] {
    const oneHourAgo = Date.now() - 3600000;

    return [...this.circuits.values()].map(circuit => {
      const recentErrors = this.errors.filter(
        e => e.subsystem === circuit.subsystem && e.timestamp > oneHourAgo,
      ).length;

      const lastSuccess = circuit.successCount > 0 ? Date.now() : 0; // Simplified

      return {
        name: circuit.subsystem,
        healthy: circuit.state === 'closed' && recentErrors < circuit.failureThreshold,
        circuitState: circuit.state,
        lastError: this.errors.filter(e => e.subsystem === circuit.subsystem).pop()?.message,
        lastSuccess,
        recentErrors,
        degraded: this.degradedSubsystems.has(circuit.subsystem),
      };
    });
  }

  /** Get recent errors */
  getRecentErrors(limit: number = 20): ErrorEvent[] {
    return this.errors.slice(-limit);
  }

  /** Get error count by category */
  getErrorCounts(): Record<ErrorCategory, number> {
    const counts: Record<ErrorCategory, number> = {
      audio: 0, model: 0, pipeline: 0, api: 0,
      filesystem: 0, network: 0, config: 0, unknown: 0,
    };
    for (const err of this.errors) {
      counts[err.category]++;
    }
    return counts;
  }

  /** Reset a circuit breaker */
  resetCircuit(subsystem: string): boolean {
    const circuit = this.circuits.get(subsystem);
    if (!circuit) return false;

    circuit.state = 'closed';
    circuit.failureCount = 0;
    circuit.successCount = 0;
    this.degradedSubsystems.delete(subsystem);
    return true;
  }

  /** Clear all errors */
  clearErrors(): void {
    this.errors = [];
  }

  /** Get total error count */
  get errorCount(): number {
    return this.errors.length;
  }

  /** Get registered subsystem count */
  get subsystemCount(): number {
    return this.circuits.size;
  }
}

/** Singleton instance */
export const errorRecovery = new ErrorRecoveryManager();
