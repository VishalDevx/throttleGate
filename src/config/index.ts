import dotenv from "dotenv";
import { GatewayConfig, GatewayConfigSchema } from "./schema";
import { hotReloadConfig } from "./hot-reload";

dotenv.config();

const env = (key: string, fallback: string): string => process.env[key] ?? fallback;
const envInt = (key: string, fallback: number): number => {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
};
const envBool = (key: string, fallback: boolean): boolean => {
  const v = process.env[key];
  return v ? v === "true" || v === "1" : fallback;
};

function loadConfigFromEnv(): GatewayConfig {
  return GatewayConfigSchema.parse({
    port: envInt("PORT", 8080),
    host: env("GATEWAY_HOST", "0.0.0.0"),
    bodyLimit: env("BODY_LIMIT", "1mb"),
    maxHeaderSize: envInt("MAX_HEADER_SIZE", 16384),
    requestTimeoutMs: envInt("REQUEST_TIMEOUT_MS", 30000),
    keepAliveTimeout: envInt("KEEP_ALIVE_TIMEOUT", 5000),
    redisUrl: env("REDIS_URL", "redis://localhost:6379"),
    redisFailOpen: envBool("REDIS_FAIL_OPEN", true),
    jwtSecret: env("JWT_SECRET", "change-me"),
    jwtIssuer: env("JWT_ISSUER", "throttlegate"),
    jwtAudience: env("JWT_AUDIENCE", "api"),
    logLevel: env("LOG_LEVEL", "info"),
    metricsPort: envInt("OTEL_METRICS_PORT", 9464),
    configPollIntervalMs: envInt("CONFIG_POLL_INTERVAL_MS", 30000),
    upstreams: [],
    routes: [],
    ipAllowlist: [],
    ipDenylist: [],
  });
}

let currentConfig: GatewayConfig = loadConfigFromEnv();
let reloadSubscribers: Array<(config: GatewayConfig) => void> = [];
let reloadTimer: ReturnType<typeof setInterval> | null = null;

export function getConfig(): GatewayConfig {
  return currentConfig;
}

export function updateConfig(partial: Partial<GatewayConfig>): GatewayConfig {
  currentConfig = GatewayConfigSchema.parse({ ...currentConfig, ...partial });
  reloadSubscribers.forEach((fn) => fn(currentConfig));
  return currentConfig;
}

export function onConfigReload(fn: (config: GatewayConfig) => void): () => void {
  reloadSubscribers.push(fn);
  return () => {
    reloadSubscribers = reloadSubscribers.filter((s) => s !== fn);
  };
}

export function startConfigPolling(): void {
  if (reloadTimer) clearInterval(reloadTimer);
  reloadTimer = setInterval(async () => {
    try {
      await hotReloadConfig();
    } catch (err) {
      console.error("[config] Hot-reload failed:", err);
    }
  }, currentConfig.configPollIntervalMs);
  reloadTimer.unref();
}

export function stopConfigPolling(): void {
  if (reloadTimer) {
    clearInterval(reloadTimer);
    reloadTimer = null;
  }
}

export { GatewayConfig, GatewayConfigSchema, RateLimitAlgorithm, RateLimitTier, CircuitBreakerState, IdempotentMethods, RateLimitRule, RateLimitRuleSchema, ProxyRoute, ProxyRouteSchema } from "./schema";
