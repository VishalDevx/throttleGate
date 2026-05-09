import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getConfig } from "../config";
import { securityMetrics } from "../metrics/prometheus";
import { getRedisClient } from "../services/redis";

export interface AuthUser {
  id: string;
  roles: string[];
  tier: string;
  apiKey?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const CACHE_TTL = 300;
const keyCache = new Map<string, { tenantId: string; tier: string }>();

async function lookupApiKey(apiKey: string): Promise<{ tenantId: string; tier: string } | null> {
  const cached = keyCache.get(apiKey);
  if (cached) return cached;

  try {
    const redis = getRedisClient();
    const data = await redis.get(`apikey:${apiKey}`);
    if (data) {
      const parsed = JSON.parse(data) as { tenantId: string; tier: string };
      keyCache.set(apiKey, parsed);
      setTimeout(() => keyCache.delete(apiKey), CACHE_TTL * 1000);
      return parsed;
    }
  } catch {
    // Redis unavailable — fall back to legacy store
  }

  const legacyStore = new Map<string, { tenantId: string; tier: string }>([
    ["sk-free-123", { tenantId: "tenant-free", tier: "free" }],
    ["sk-pro-456", { tenantId: "tenant-pro", tier: "pro" }],
    ["sk-enterprise-789", { tenantId: "tenant-ent", tier: "enterprise" }],
  ]);

  return legacyStore.get(apiKey) ?? null;
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (!apiKey) {
    securityMetrics.authFailures.inc({ reason: "missing_api_key" });
    res.status(401).json({ error: "Unauthorized", message: "Missing X-API-Key header" });
    return;
  }

  const mapping = await lookupApiKey(apiKey);
  if (!mapping) {
    securityMetrics.authFailures.inc({ reason: "invalid_api_key" });
    res.status(403).json({ error: "Forbidden", message: "Invalid API key" });
    return;
  }

  req.headers["x-tenant-id"] = mapping.tenantId;
  req.headers["x-tier"] = mapping.tier;
  req.user = { id: mapping.tenantId, roles: ["user"], tier: mapping.tier, apiKey };
  securityMetrics.authSuccesses.inc();
  next();
}

export function jwtAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    securityMetrics.authFailures.inc({ reason: "missing_token" });
    res.status(401).json({ error: "Unauthorized", message: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.substring(7);
  const config = getConfig();

  try {
    const decoded = jwt.verify(token, config.jwtSecret, {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }) as any;

    req.user = {
      id: decoded.sub ?? decoded.id,
      roles: decoded.roles ?? [],
      tier: decoded.tier ?? "free",
    };

    req.headers["x-tenant-id"] = decoded.tenantId ?? decoded.sub;
    req.headers["x-tier"] = decoded.tier ?? "free";

    securityMetrics.authSuccesses.inc();
    next();
  } catch (err) {
    securityMetrics.authFailures.inc({ reason: "invalid_token" });
    res.status(401).json({ error: "Unauthorized", message: "Invalid or expired token" });
  }
}
