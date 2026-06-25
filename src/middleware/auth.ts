import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getConfig } from "../config";
import { securityMetrics } from "../metrics/prometheus";

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

// Simple API key -> tenant/tier mapping (in production, query Redis)
const API_KEY_STORE = new Map<string, { tenantId: string; tier: string }>([
  ["sk-free-123", { tenantId: "tenant-free", tier: "free" }],
  ["sk-pro-456", { tenantId: "tenant-pro", tier: "pro" }],
  ["sk-enterprise-789", { tenantId: "tenant-ent", tier: "enterprise" }],
]);

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (!apiKey) {
    securityMetrics.authFailures.inc({ reason: "missing_api_key" });
    res.status(401).json({ error: "Unauthorized", message: "Missing X-API-Key header" });
    return;
  }

  const mapping = API_KEY_STORE.get(apiKey);
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
