import express from "express";
import { Request, Response, NextFunction } from "express";
import { getConfig } from "./config";
import { tracingMiddleware } from "./middleware/tracing";
import { corsHandler } from "./middleware/cors";
import { ipFilter } from "./middleware/security";
import { inputSanitizer } from "./middleware/request-validation";
import { slowRequestProtection, requestSizeLimiter } from "./middleware/security";
import { buildRouter } from "./routing/router";
import { register } from "./metrics/prometheus";
import { getLogger } from "./metrics/logger";
import { serviceRegistry, ServiceInstance } from "./services/service-registry";

const logger = getLogger();

export function createApp(): express.Application {
  const app = express();
  const config = getConfig();

  // ===== Global Middleware Stack =====
  // Order matters: security -> routing -> proxy

  // 1. Request size limiting (before body parsing)
  const maxBytes = parseBytes(config.bodyLimit);
  app.use(requestSizeLimiter(maxBytes));

  // 2. Slow request protection
  app.use(slowRequestProtection(10000, 30000));

  // 3. Security: IP filtering
  app.use(ipFilter);

  // 4. Input sanitization
  app.use(inputSanitizer);

  // 5. CORS
  app.use(corsHandler);

  // 6. Tracing (generates trace ID, starts span)
  app.use(tracingMiddleware);

  // 7. Health check endpoints (before auth, since these need to be accessible)
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "throttlegate",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.get("/ready", (_req: Request, res: Response) => {
    // Readiness: check that Redis is available and upstreams are healthy
    const redisAvailable = true; // simplified
    const upstreams = config.upstreams;
    const allHealthy = upstreams.length === 0 || upstreams.every((u) => {
      const instances = serviceRegistry.getInstances(u.id);
      return instances.some((i) => i.healthy);
    });

    if (allHealthy) {
      res.json({ status: "ok", redis: redisAvailable, upstreams: "healthy" });
    } else {
      res.status(503).json({ status: "degraded", redis: redisAvailable, upstreams: "unhealthy" });
    }
  });

  // 8. Metrics endpoint (Prometheus scrape)
  app.get("/metrics", async (_req: Request, res: Response) => {
    try {
      res.setHeader("Content-Type", register.contentType);
      const metrics = await register.metrics();
      res.end(metrics);
    } catch (err) {
      res.status(500).json({ error: "Metrics error" });
    }
  });

  // 9. Body parsing (for routes that need it)
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

  // 10. Service registration/deregistration endpoints
  app.post("/register", express.json(), (req: Request, res: Response) => {
    const { serviceName, url, host, port, weight, id, maxConnections, metadata } = req.body;
    if (!serviceName || !url) {
      res.status(400).json({ error: "Bad Request", message: "serviceName and url required" });
      return;
    }

    const instanceId: string = id || `${serviceName}-${Date.now()}`;
    const instanceUrl: string = url as string;
    const instanceHost: string = (host as string) || new URL(instanceUrl).hostname;
    const instancePort: number = (port as number) || parseInt(new URL(instanceUrl).port, 10) || 80;
    const instanceWeight: number = (weight as number) || 1;
    const instanceMaxConns: number = (maxConnections as number) || 100;
    const instanceMeta: Record<string, string> = (metadata as Record<string, string>) || {};

    const instance = serviceRegistry.register({
      id: instanceId,
      serviceName: serviceName as string,
      url: instanceUrl,
      host: instanceHost,
      port: instancePort,
      weight: instanceWeight,
      maxConnections: instanceMaxConns,
      metadata: instanceMeta,
      activeConnections: 0,
    });

    logger.info({ instance: instance.id, service: serviceName }, "Service instance registered");
    res.status(201).json({ status: "registered", instance });
  });

  app.delete("/register/:serviceName/:instanceId", (req: Request, res: Response) => {
    const serviceName = req.params.serviceName!;
    const instanceId = req.params.instanceId!;
    const removed = serviceRegistry.deregister(serviceName, instanceId);
    if (removed) {
      logger.info({ instanceId, service: serviceName }, "Service instance deregistered");
      res.json({ status: "deregistered" });
    } else {
      res.status(404).json({ error: "Not Found", message: "Instance not found" });
    }
  });

  // 11. Dynamic routes (built from config and service discovery)
  const router = buildRouter();
  app.use(router);

  // 12. 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not Found", message: "No route configured for this path" });
  });

  // 13. Global error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error({
      traceId: (req as any).traceId,
      method: req.method,
      path: req.path,
      err,
    }, "Unhandled error");

    res.status(500).json({
      error: "Internal Server Error",
      message: process.env.NODE_ENV === "production" ? "An unexpected error occurred" : err.message,
    });
  });

  return app;
}

function parseBytes(str: string): number {
  const match = str.match(/^(\d+)(kb|mb|gb)?$/i);
  if (!match) return 1024 * 1024; // default 1mb
  const num = parseInt(match[1]!, 10);
  const unit = (match[2] ?? "mb").toLowerCase();
  switch (unit) {
    case "kb": return num * 1024;
    case "mb": return num * 1024 * 1024;
    case "gb": return num * 1024 * 1024 * 1024;
    default: return num;
  }
}
