import http from "http";
import https from "https";
import { Request, Response } from "express";
import { ProxyRoute } from "../config";
import { loadBalancer } from "../services/load-balancer";
import { serviceRegistry } from "../services/service-registry";
import { circuitBreakerManager } from "../services/circuit-breaker-manager";
import { healthChecker } from "../services/health-checker";
import { getConfig, IdempotentMethods } from "../config";
import { proxyMetrics } from "../metrics/prometheus";
import { getLogger } from "../metrics/logger";

const logger = getLogger();

const HOP_BY_HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade",
]);

function stripHopByHop(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase()) && value !== undefined) {
      result[key] = Array.isArray(value) ? value.join(", ") : value;
    }
  }
  return result;
}

function forwardRequestHeaders(req: Request, targetUrl: URL): Record<string, string> {
  const headers = stripHopByHop(req.headers as Record<string, string | string[] | undefined>);

  // Forward proxy headers
  headers["X-Forwarded-For"] = req.ip ?? req.socket.remoteAddress ?? "";
  headers["X-Forwarded-Proto"] = req.protocol;
  headers["X-Forwarded-Host"] = req.hostname;
  headers["X-Forwarded-Port"] = String(Number(targetUrl.port) || (targetUrl.protocol === "https:" ? 443 : 80));

  // Propagate trace ID if present
  const traceId = (req as any).traceId;
  if (traceId) {
    headers["x-trace-id"] = traceId;
  }

  return headers;
}

// Simple ephemeral connection pool
const connectionPool = new Map<string, http.Agent>();

function getAgent(targetUrl: URL): http.Agent {
  const key = targetUrl.origin;
  let agent = connectionPool.get(key);
  if (!agent) {
    agent = new (targetUrl.protocol === "https:" ? https : http).Agent({
      keepAlive: true,
      keepAliveMsecs: 5000,
      maxSockets: 100,
      maxFreeSockets: 20,
      scheduling: "lifo",
    });
    connectionPool.set(key, agent);
  }
  return agent;
}

function exponentialBackoffWithJitter(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  const jitter = Math.random() * delay * 0.5;
  return Math.floor(delay + jitter);
}

export function proxyRequest(req: Request, res: Response, route: ProxyRoute): void {
  const startTime = Date.now();
  const traceId = (req as any).traceId ?? "unknown";

  const cbName = `route:${route.path}`;
  const cb = circuitBreakerManager.getOrCreate(cbName, route.circuitBreaker);

  const maxRetries = IdempotentMethods.has(req.method.toUpperCase() as any) ? route.retry.maxRetries : 0;

  async function attempt(remainingRetries: number): Promise<void> {
    if (!cb.allowRequest()) {
      res.status(503).json({
        error: "Service Unavailable",
        message: `Circuit breaker is open for ${route.path}`,
      });
      proxyMetrics.rejected.inc({ route: route.path, reason: "circuit_breaker_open" });
      return;
    }

    const targetUrl = new URL(route.target);
    const agent = getAgent(targetUrl);
    const headers = forwardRequestHeaders(req, targetUrl);

    // Build the proxied path
    let path = req.path;
    if (route.stripPrefix) {
      const prefix = route.path.replace(/\/\*$/, "");
      path = req.path.replace(prefix, "") || "/";
    }

    const options: http.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80),
      path: path + (req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : ""),
      method: req.method,
      headers,
      agent,
      timeout: route.timeout,
    };

    const proto = targetUrl.protocol === "https:" ? https : http;
    const proxyReq = proto.request(options, (proxyRes) => {
      const latency = Date.now() - startTime;
      const success = proxyRes.statusCode! < 500;

      // Record result in circuit breaker
      cb.record(success, latency);
      proxyMetrics.latency.observe({ route: route.path, status: String(proxyRes.statusCode) }, latency);
      proxyMetrics.requestsTotal.inc({ route: route.path, method: req.method, status: String(proxyRes.statusCode) });

      // Handle keep-alive
      res.writeHead(proxyRes.statusCode!, stripHopByHop(proxyRes.headers as any));
      proxyRes.pipe(res);
    });

    proxyReq.on("timeout", () => {
      proxyReq.destroy(new Error("Request timeout"));
    });

    proxyReq.on("error", (err: NodeJS.ErrnoException) => {
      const latency = Date.now() - startTime;
      cb.record(false, latency);
      proxyMetrics.errors.inc({ route: route.path, error: err.code ?? "UNKNOWN" });

      // Passive failure detection
      serviceRegistry.getAllInstances().forEach((inst) => {
        if (route.target.includes(inst.url)) {
          healthChecker.recordPassiveFailure(inst.id, inst.serviceName);
        }
      });

      if (remainingRetries > 0) {
        const delay = exponentialBackoffWithJitter(
          maxRetries - remainingRetries,
          route.retry.baseDelayMs,
          route.retry.maxDelayMs
        );
        logger.warn({ traceId, route: route.path, retryDelay: delay, remainingRetries }, "Retrying proxy request");
        setTimeout(() => attempt(remainingRetries - 1), delay);
      } else {
        if (!res.headersSent) {
          res.status(502).json({
            error: "Bad Gateway",
            message: `Upstream request failed: ${err.message}`,
          });
        }
      }
    });

    // Stream request body without buffering
    if (req.body && typeof req.body === "object") {
      proxyReq.end(JSON.stringify(req.body));
    } else {
      req.pipe(proxyReq);
    }
  }

  attempt(maxRetries).catch((err) => {
    logger.error({ traceId, route: route.path, err }, "Unhandled proxy error");
    if (!res.headersSent) {
      res.status(502).json({ error: "Bad Gateway", message: "Upstream proxy error" });
    }
  });
}
