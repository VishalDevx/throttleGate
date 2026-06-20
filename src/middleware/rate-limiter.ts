import { Request, Response, NextFunction, RequestHandler } from "express";
import { getConfig, RateLimitRule } from "../config";
import { isRedisAvailable, evalsha } from "../services/redis";
import { rateLimitMetrics } from "../metrics/prometheus";

const SCRIPT_SHA = new Map<string, string>();

export function setScriptShas(shas: Map<string, string>): void {
  shas.forEach((sha, name) => SCRIPT_SHA.set(name, sha));
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
  resetTimestamp: number;
}

function getRateLimitKey(rule: RateLimitRule, req: Request): string {
  const parts = ["rate_limit", rule.algorithm, rule.key];

  switch (rule.key) {
    case "ip":
      parts.push(req.ip ?? req.socket.remoteAddress ?? "unknown");
      break;
    case "api_key":
      parts.push((req.headers["x-api-key"] as string) ?? "unknown");
      break;
    case "tenant":
      parts.push((req.headers["x-tenant-id"] as string) ?? "default");
      break;
    case "endpoint":
      parts.push(req.method, req.path);
      break;
    default:
      parts.push(rule.key);
  }

  if (rule.tier) {
    parts.push(rule.tier);
  }

  return parts.join(":");
}

async function checkRateLimitRedis(rule: RateLimitRule, req: Request): Promise<RateLimitResult> {
  const key = getRateLimitKey(rule, req);
  const now = Date.now();

  if (rule.algorithm === "token_bucket") {
    const sha = SCRIPT_SHA.get("token_bucket");
    if (!sha) throw new Error("token_bucket script not loaded");
    const result = await evalsha(sha, [key], [
      rule.capacity,
      rule.refillRate ?? rule.capacity / (rule.windowMs / 1000),
      Math.floor(now / 1000),
      rule.cost,
    ]);
    return {
      allowed: result[0] === 1,
      remaining: result[1],
      retryAfter: Math.ceil(result[2] as number),
      resetTimestamp: result[3],
    };
  } else {
    const sha = SCRIPT_SHA.get("sliding_window_log");
    if (!sha) throw new Error("sliding_window_log script not loaded");
    const result = await evalsha(sha, [key], [
      rule.windowMs,
      rule.capacity,
      now,
      rule.cost,
    ]);
    return {
      allowed: result[0] === 1,
      remaining: result[1],
      retryAfter: Math.ceil(result[2] as number),
      resetTimestamp: result[3],
    };
  }
}

function checkRateLimitLocal(rule: RateLimitRule, req: Request): RateLimitResult {
  // Fallback: permissive local check when Redis is down
  // Behavior depends on redisFailOpen config
  const config = getConfig();
  if (config.redisFailOpen) {
    return { allowed: true, remaining: rule.capacity, retryAfter: 0, resetTimestamp: Math.floor(Date.now() / 1000) + 60 };
  }
  return { allowed: false, remaining: 0, retryAfter: 3600, resetTimestamp: Math.floor(Date.now() / 1000) + 3600 };
}

export function rateLimiter(rule: RateLimitRule): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    try {
      let result: RateLimitResult;

      if (isRedisAvailable()) {
        result = await checkRateLimitRedis(rule, req);
      } else {
        result = checkRateLimitLocal(rule, req);
        rateLimitMetrics.redisFailover.inc({ algorithm: rule.algorithm, key: rule.key });
      }

      // Set standard rate limit headers
      res.setHeader("X-RateLimit-Limit", rule.capacity);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, result.remaining));
      res.setHeader("X-RateLimit-Reset", result.resetTimestamp);

      if (!result.allowed) {
        res.setHeader("Retry-After", result.retryAfter);
        rateLimitMetrics.rejected.inc({ algorithm: rule.algorithm, key: rule.key, tier: rule.tier ?? "none" });
        res.status(429).json({
          error: "Too Many Requests",
          message: `Rate limit exceeded for ${rule.key}. Retry after ${result.retryAfter} seconds.`,
          retryAfter: result.retryAfter,
        });
        return;
      }

      rateLimitMetrics.allowed.inc({ algorithm: rule.algorithm, key: rule.key, tier: rule.tier ?? "none" });
      rateLimitMetrics.latency.observe({ algorithm: rule.algorithm, key: rule.key }, Date.now() - startTime);
      next();
    } catch (err) {
      rateLimitMetrics.errors.inc({ algorithm: rule.algorithm, key: rule.key });
      // On unexpected error, use fail-open/closed based on config
      const config = getConfig();
      if (config.redisFailOpen) {
        next();
      } else {
        res.status(503).json({ error: "Service Unavailable", message: "Rate limiter unavailable" });
      }
    }
  };
}

// Build stacked rate limiters: run all rules for a request
export function stackedRateLimiter(rules: RateLimitRule[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const middlewares: RequestHandler[] = rules.map((rule) => rateLimiter(rule));
    function chain(index: number): void {
      if (index >= middlewares.length) {
        next();
        return;
      }
      middlewares[index]!(req, res, () => chain(index + 1));
    }
    chain(0);
  };
}
