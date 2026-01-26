/**
 * Circuit Breaker - Prevents cascading failures
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit tripped, requests fail fast
 * - HALF_OPEN: Testing if service recovered, one request allowed
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Name for logging/metrics */
  name: string;
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Milliseconds to wait before allowing probe request (default: 30000) */
  resetTimeout?: number;
  /** Number of successes in half-open to close circuit (default: 1) */
  successThreshold?: number;
  /** Optional callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  openedAt: Date | null;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailure: Date | null = null;
  private lastSuccess: Date | null = null;
  private openedAt: Date | null = null;
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: 5,
      resetTimeout: 30000,
      successThreshold: 1,
      onStateChange: () => {},
      ...config,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (!this.canExecute()) {
      throw new CircuitOpenError(this.config.name, this.getRemainingCooldown());
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /**
   * Check if a request can be executed
   */
  canExecute(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      // Check if cooldown period has elapsed
      if (this.openedAt && Date.now() - this.openedAt.getTime() >= this.config.resetTimeout) {
        this.transition('HALF_OPEN');
        return true;
      }
      return false;
    }

    // HALF_OPEN - allow one request to probe
    return true;
  }

  /**
   * Record a successful operation
   */
  onSuccess(): void {
    this.lastSuccess = new Date();
    this.totalSuccesses++;
    this.failures = 0;

    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transition('CLOSED');
      }
    }
  }

  /**
   * Record a failed operation
   */
  onFailure(): void {
    this.lastFailure = new Date();
    this.totalFailures++;
    this.failures++;
    this.successes = 0;

    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open immediately opens circuit
      this.transition('OPEN');
    } else if (this.state === 'CLOSED' && this.failures >= this.config.failureThreshold) {
      this.transition('OPEN');
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transition('CLOSED');
    this.failures = 0;
    this.successes = 0;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      openedAt: this.openedAt,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get remaining cooldown time in ms
   */
  getRemainingCooldown(): number {
    if (this.state !== 'OPEN' || !this.openedAt) {
      return 0;
    }
    const elapsed = Date.now() - this.openedAt.getTime();
    return Math.max(0, this.config.resetTimeout - elapsed);
  }

  private transition(newState: CircuitState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    if (newState === 'OPEN') {
      this.openedAt = new Date();
    } else if (newState === 'CLOSED') {
      this.openedAt = null;
      this.failures = 0;
      this.successes = 0;
    }

    this.config.onStateChange(oldState, newState, this.config.name);
  }
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  readonly circuitName: string;
  readonly retryAfterMs: number;

  constructor(circuitName: string, retryAfterMs: number) {
    super(`Circuit '${circuitName}' is OPEN. Retry after ${retryAfterMs}ms.`);
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create a circuit breaker
   */
  get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker({ name, ...config });
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /**
   * Get all circuit breaker stats
   */
  getAllStats(): CircuitBreakerStats[] {
    return Array.from(this.breakers.values()).map(b => b.getStats());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach(b => b.reset());
  }
}

// Global registry for shared circuit breakers
export const globalCircuitBreakers = new CircuitBreakerRegistry();
