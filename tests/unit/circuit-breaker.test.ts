import { describe, it, expect, vi, beforeEach } from "vitest";
import { CircuitBreaker } from "../../src/services/circuit-breaker-manager";

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    cb = new CircuitBreaker("test-service", {
      errorThreshold: 50,
      recoveryTimeoutMs: 30000,
      halfOpenMaxRequests: 3,
      windowSizeMs: 60000,
      minRequests: 5,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in closed state", () => {
    expect(cb.getState()).toBe("closed");
    expect(cb.allowRequest()).toBe(true);
  });

  it("opens when error rate exceeds threshold", () => {
    // 5 failures out of 8 = 62.5% error rate
    cb.record(true, 10);
    cb.record(false, 20);
    cb.record(true, 10);
    cb.record(false, 15);
    cb.record(false, 25);
    cb.record(true, 10);
    cb.record(false, 30);
    cb.record(false, 20);

    expect(cb.getState()).toBe("open");
    expect(cb.allowRequest()).toBe(false);
  });

  it("stays closed when errors are below threshold", () => {
    for (let i = 0; i < 20; i++) {
      cb.record(true, Math.random() * 50);
    }
    expect(cb.getState()).toBe("closed");
  });

  it("transitions to half-open after recovery timeout", () => {
    for (let i = 0; i < 8; i++) cb.record(false, 10);
    expect(cb.getState()).toBe("open");

    vi.advanceTimersByTime(31000);

    expect(cb.allowRequest()).toBe(true);
  });

  it("stays in half-open until max requests pass", () => {
    for (let i = 0; i < 8; i++) cb.record(false, 10);
    vi.advanceTimersByTime(31000);

    expect(cb.allowRequest()).toBe(true);
    expect(cb.allowRequest()).toBe(true);
    expect(cb.allowRequest()).toBe(true);
    expect(cb.allowRequest()).toBe(false);
  });

  it("closes after successful half-open requests", () => {
    for (let i = 0; i < 8; i++) cb.record(false, 10);
    vi.advanceTimersByTime(31000);

    // allowRequest triggers transition to half-open
    cb.allowRequest(); // triggers half-open transition
    cb.record(true, 10);
    cb.allowRequest();
    cb.record(true, 10);
    cb.allowRequest();
    cb.record(true, 10);

    expect(cb.getState()).toBe("closed");
  });

  it("re-opens on failure in half-open", () => {
    for (let i = 0; i < 8; i++) cb.record(false, 10);
    vi.advanceTimersByTime(31000);

    cb.record(true, 10);
    cb.record(false, 20);

    expect(cb.getState()).toBe("open");
  });

  it("does not open below minRequests even with 100% errors", () => {
    cb.record(false, 10);
    cb.record(false, 20);
    cb.record(false, 30);
    cb.record(false, 40);
    expect(cb.getState()).toBe("closed");
  });

  it("can be manually reset", () => {
    for (let i = 0; i < 8; i++) cb.record(false, 10);
    expect(cb.getState()).toBe("open");

    cb.reset();
    expect(cb.getState()).toBe("closed");
  });

  it("returns metrics", () => {
    cb.record(true, 10);
    cb.record(false, 20);
    const metrics = cb.getMetrics();
    expect(metrics.totalRequests).toBe(2);
  });

  it("handles half-open close correctly with allowRequest + record flow", () => {
    // Open the circuit
    for (let i = 0; i < 8; i++) cb.record(false, 10);
    expect(cb.getState()).toBe("open");

    vi.advanceTimersByTime(31000);

    // Allow 3 requests through in half-open
    expect(cb.allowRequest()).toBe(true);
    expect(cb.allowRequest()).toBe(true);
    expect(cb.allowRequest()).toBe(true);
    expect(cb.allowRequest()).toBe(false); // 4th blocked

    // All 3 succeed → should close
    cb.record(true, 10);
    cb.record(true, 10);
    cb.record(true, 10);

    expect(cb.getState()).toBe("closed");
  });

  it("handles half-open re-open correctly", () => {
    for (let i = 0; i < 8; i++) cb.record(false, 10);
    vi.advanceTimersByTime(31000);

    expect(cb.allowRequest()).toBe(true);
    cb.record(true, 10);

    expect(cb.allowRequest()).toBe(true);
    cb.record(false, 10); // failure → back to open

    expect(cb.getState()).toBe("open");
    expect(cb.allowRequest()).toBe(false);
  });
});
