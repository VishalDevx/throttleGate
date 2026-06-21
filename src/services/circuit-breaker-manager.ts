import { CircuitBreakerState } from "../config";
import { circuitBreakerMetrics } from "../metrics/prometheus";

interface CircuitBreakerOptions {
  errorThreshold: number;       // % of errors to trigger open
  recoveryTimeoutMs: number;   // time before half-open
  halfOpenMaxRequests: number; // requests allowed in half-open
  windowSizeMs: number;        // rolling window for error tracking
  minRequests: number;         // min requests before evaluating
}

interface RequestRecord {
  timestamp: number;
  success: boolean;
  latency: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = "closed";
  private failureCount = 0;
  private totalCount = 0;
  private requestLog: RequestRecord[] = [];
  private halfOpenPassCount = 0;
  private halfOpenFailCount = 0;
  private halfOpenRequestCount = 0; // requests let through in half-open (before recording)
  private openedAt: number | null = null;
  private options: CircuitBreakerOptions;
  private name: string;

  constructor(name: string, options: Partial<CircuitBreakerOptions> = {}) {
    this.name = name;
    this.options = {
      errorThreshold: options.errorThreshold ?? 50,
      recoveryTimeoutMs: options.recoveryTimeoutMs ?? 30000,
      halfOpenMaxRequests: options.halfOpenMaxRequests ?? 5,
      windowSizeMs: options.windowSizeMs ?? 60000,
      minRequests: options.minRequests ?? 10,
    };
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getName(): string {
    return this.name;
  }

  /**
   * Determines if a request should be allowed through
   */
  allowRequest(): boolean {
    switch (this.state) {
      case "closed":
        return true;

      case "open": {
        // Check if recovery timeout has elapsed
        if (this.openedAt && Date.now() - this.openedAt >= this.options.recoveryTimeoutMs) {
          this.transitionTo("half-open");
          return this.allowRequest();
        }
        return false;
      }

      case "half-open": {
        if (this.halfOpenRequestCount < this.options.halfOpenMaxRequests) {
          this.halfOpenRequestCount++;
          return true;
        }
        return false;
      }
    }
  }

  /**
   * Record the result of a proxied request
   */
  record(success: boolean, latency: number): void {
    const now = Date.now();
    this.requestLog.push({ timestamp: now, success, latency: latency });
    this.totalCount++;

    // Prune old entries outside the window
    const cutoff = now - this.options.windowSizeMs;
    this.requestLog = this.requestLog.filter((r) => r.timestamp >= cutoff);

    if (success) {
      if (this.state === "half-open") {
        this.halfOpenPassCount++;
        // If we've passed enough, close the circuit
        if (this.halfOpenPassCount >= this.options.halfOpenMaxRequests) {
          this.transitionTo("closed");
        }
      }
    } else {
      if (this.state === "half-open") {
        this.halfOpenFailCount++;
        // Any failure in half-open goes back to open
        this.transitionTo("open");
        return;
      }
    }

    // Only evaluate error rate if we have enough requests
    if (this.state === "closed" && this.totalCount >= this.options.minRequests) {
      const windowFailures = this.requestLog.filter((r) => !r.success).length;
      const windowTotal = this.requestLog.length;
      const errorRate = (windowFailures / windowTotal) * 100;

      if (errorRate >= this.options.errorThreshold) {
        this.transitionTo("open");
      }
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;

    this.halfOpenPassCount = 0;
    this.halfOpenFailCount = 0;
    this.halfOpenRequestCount = 0;

    if (newState === "open") {
      this.openedAt = Date.now();
    }

    if (newState === "closed") {
      this.openedAt = null;
      this.requestLog = [];
      this.totalCount = 0;
    }

    circuitBreakerMetrics.stateChanges.inc({
      breaker: this.name,
      from: oldState,
      to: newState,
    });

    circuitBreakerMetrics.currentState.set({ breaker: this.name }, this.stateToValue(newState));
  }

  private stateToValue(s: CircuitBreakerState): number {
    switch (s) {
      case "closed": return 0;
      case "half-open": return 1;
      case "open": return 2;
    }
  }

  getMetrics(): { errorRate: number; totalRequests: number } {
    const now = Date.now();
    const cutoff = now - this.options.windowSizeMs;
    const windowLog = this.requestLog.filter((r) => r.timestamp >= cutoff);
    const failures = windowLog.filter((r) => !r.success).length;
    return {
      errorRate: windowLog.length > 0 ? (failures / windowLog.length) * 100 : 0,
      totalRequests: this.totalCount,
    };
  }

  reset(): void {
    this.transitionTo("closed");
  }
}

/**
 * Manages circuit breakers for all backend services
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  getOrCreate(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    let cb = this.breakers.get(name);
    if (!cb) {
      cb = new CircuitBreaker(name, options);
      this.breakers.set(name, cb);
    }
    return cb;
  }

  getAllStates(): Array<{ name: string; state: CircuitBreakerState }> {
    return Array.from(this.breakers.entries()).map(([name, cb]) => ({
      name,
      state: cb.getState(),
    }));
  }

  reset(name: string): void {
    const cb = this.breakers.get(name);
    if (cb) cb.reset();
  }

  resetAll(): void {
    this.breakers.forEach((cb) => cb.reset());
  }
}

export const circuitBreakerManager = new CircuitBreakerManager();
