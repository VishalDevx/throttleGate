import { Request, Response, NextFunction } from "express";
import { getConfig } from "../config";

export function corsHandler(req: Request, res: Response, next: NextFunction): void {
  const config = getConfig();
  if (!config.cors.enabled) {
    next();
    return;
  }

  const origin = req.headers.origin;
  const allowedOrigins = config.cors.origins;

  // Allow if origin is in the list or wildcard is present
  if (origin && (allowedOrigins.includes("*") || allowedOrigins.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigins.includes("*") ? "*" : origin!);
    res.setHeader("Access-Control-Allow-Methods", config.cors.methods.join(", "));
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Tenant-Id, X-Request-Id, X-Correlation-Id");
    res.setHeader("Access-Control-Allow-Credentials", String(config.cors.credentials));
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  // Handle preflight
  if (req.method.toUpperCase() === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
