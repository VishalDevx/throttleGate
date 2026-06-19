import { describe, it, expect } from "vitest";

interface TokenBucketState {
  tokens: number;
  lastRefillTime: number;
}

function tokenBucketCheck(
  state: TokenBucketState,
  capacity: number,
  refillRate: number,
  nowSeconds: number,
  cost: number = 1
): { allowed: boolean; remaining: number; retryAfter: number } {
  const elapsed = Math.max(0, nowSeconds - state.lastRefillTime);
  const tokensToAdd = elapsed * refillRate;
  state.tokens = Math.min(capacity, state.tokens + tokensToAdd);
  state.lastRefillTime = nowSeconds;

  if (state.tokens >= cost) {
    state.tokens -= cost;
    return { allowed: true, remaining: state.tokens, retryAfter: 0 };
  }

  const retryAfter = refillRate > 0
    ? Math.ceil((cost - state.tokens) / refillRate * 1000) / 1000
    : -1;

  return { allowed: false, remaining: state.tokens, retryAfter };
}

describe("Token Bucket Algorithm", () => {
  it("allows requests when bucket is full", () => {
    const state: TokenBucketState = { tokens: 10, lastRefillTime: 0 };
    const result = tokenBucketCheck(state, 10, 1, 0, 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeCloseTo(9);
  });

  it("rejects requests when bucket is empty", () => {
    const state: TokenBucketState = { tokens: 0, lastRefillTime: 0 };
    // 0.2 seconds elapsed * 1 token/sec = 0.2 tokens, still < 1
    const result = tokenBucketCheck(state, 10, 1, 0.2, 1);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBeCloseTo(0.2, 1);
  });

  it("refills tokens over time", () => {
    const state: TokenBucketState = { tokens: 0, lastRefillTime: 0 };
    // After 5 seconds at 2 tokens/sec, we have 10 tokens (capped at capacity 10)
    const result = tokenBucketCheck(state, 10, 2, 5, 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeCloseTo(9, 0);
  });

  it("caps at capacity", () => {
    const state: TokenBucketState = { tokens: 0, lastRefillTime: 0 };
    // After 100 seconds at 2/sec = 200 tokens, capped at 10
    const result = tokenBucketCheck(state, 10, 2, 100, 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeCloseTo(9, 0);
  });

  it("handles burst consumption", () => {
    const state: TokenBucketState = { tokens: 10, lastRefillTime: 0 };
    const result = tokenBucketCheck(state, 10, 1, 0, 8);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeCloseTo(2);
  });

  it("calculates retry-after correctly", () => {
    const state: TokenBucketState = { tokens: 0, lastRefillTime: 0 };
    const result = tokenBucketCheck(state, 10, 2, 0, 1);
    expect(result.allowed).toBe(false);
    // Need 1 token at 2 tokens/sec = 0.5 seconds
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(1);
  });

  it("handles multiple sequential requests", () => {
    const state: TokenBucketState = { tokens: 5, lastRefillTime: 0 };
    let result;

    // 5 requests at t=0
    for (let i = 0; i < 5; i++) {
      result = tokenBucketCheck(state, 5, 1, 0, 1);
      expect(result.allowed).toBe(true);
    }

    // 6th should fail
    result = tokenBucketCheck(state, 5, 1, 0, 1);
    expect(result.allowed).toBe(false);

    // After 2 seconds, 2 tokens refilled
    result = tokenBucketCheck(state, 5, 1, 2, 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeCloseTo(1, 0);
  });

  it("handles zero refill rate (no refill)", () => {
    const state: TokenBucketState = { tokens: 1, lastRefillTime: 0 };
    const result1 = tokenBucketCheck(state, 1, 0, 1, 1);
    expect(result1.allowed).toBe(true);

    const result2 = tokenBucketCheck(state, 1, 0, 2, 1);
    expect(result2.allowed).toBe(false);
    expect(result2.retryAfter).toBe(-1);
  });
});
