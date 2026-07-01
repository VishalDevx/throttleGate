import { describe, it, expect } from "vitest";
import { RateLimitRuleSchema } from "../../src/config";

describe("Rate Limit Configuration", () => {
  it("validates a sliding window rule", () => {
    const rule = RateLimitRuleSchema.parse({
      key: "ip",
      algorithm: "sliding_window",
      capacity: 100,
      windowMs: 60000,
      cost: 1,
    });
    expect(rule.key).toBe("ip");
    expect(rule.capacity).toBe(100);
    expect(rule.windowMs).toBe(60000);
  });

  it("validates a token bucket rule", () => {
    const rule = RateLimitRuleSchema.parse({
      key: "endpoint",
      algorithm: "token_bucket",
      capacity: 50,
      windowMs: 60000,
      refillRate: 0.83,
      cost: 1,
    });
    expect(rule.algorithm).toBe("token_bucket");
    expect(rule.refillRate).toBe(0.83);
  });

  it("defaults algorithm to sliding_window", () => {
    const rule = RateLimitRuleSchema.parse({
      key: "ip",
      capacity: 100,
      windowMs: 60000,
    });
    expect(rule.algorithm).toBe("sliding_window");
  });

  it("defaults cost to 1", () => {
    const rule = RateLimitRuleSchema.parse({ key: "ip", capacity: 100, windowMs: 60000 });
    expect(rule.cost).toBe(1);
  });

  it("rejects negative capacity", () => {
    expect(() => {
      RateLimitRuleSchema.parse({ key: "ip", capacity: -1, windowMs: 60000 });
    }).toThrow();
  });

  it("rejects non-positive windowMs", () => {
    expect(() => {
      RateLimitRuleSchema.parse({ key: "ip", capacity: 100, windowMs: 0 });
    }).toThrow();
  });
});
