import { Router, Request, Response } from "express";
import { ProxyRoute } from "../config";
import { getConfig, onConfigReload } from "../config";
import { stackedRateLimiter } from "../middleware/rate-limiter";
import { proxyRequest } from "./proxy";

export function buildRouter(): Router {
  const router = Router();
  let currentRoutes: ProxyRoute[] = getConfig().routes;

  function applyRoutes(): void {
    // We clear and re-apply routes dynamically
    // Using a wildcard middleware approach for hot-reloadable routing
  }

  // Register a route
  function registerRoute(route: ProxyRoute): void {
    const middlewares: any[] = [];

    // Stack rate limit rules for this route
    if (route.rateLimitRules && route.rateLimitRules.length > 0) {
      middlewares.push(stackedRateLimiter(route.rateLimitRules));
    }

    // Convert path pattern to Express-compatible
    // e.g., /api/v1/* -> /api/v1/*
    const expressPath = route.path.replace(/\*$/, "*");

    middlewares.push((req: Request, res: Response) => {
      proxyRequest(req, res, route);
    });

    router.all(expressPath, ...middlewares);
  }

  // Initial registration
  currentRoutes.forEach(registerRoute);

  // Hot-reload: re-register when config changes
  onConfigReload((config) => {
    // Clear existing routes (remove all middleware from router)
    router.stack = [];
    currentRoutes = config.routes;
    currentRoutes.forEach(registerRoute);
  });

  // Service discovery: dynamically register route for each upstream
  getConfig().upstreams.forEach((upstream) => {
    const routePath = `/api/${upstream.id}/*`;
    const route: ProxyRoute = {
      path: routePath,
      target: upstream.url,
      stripPrefix: true,
      timeout: getConfig().requestTimeoutMs,
      rateLimitRules: [getConfig().defaultRateLimit],
      retry: { maxRetries: 2, baseDelayMs: 200, maxDelayMs: 5000 },
      circuitBreaker: {
        enabled: true,
        errorThreshold: 50,
        recoveryTimeoutMs: 30000,
        halfOpenMaxRequests: 5,
        windowSizeMs: 60000,
        minRequests: 10,
      },
    };
    registerRoute(route);
  });

  return router;
}
