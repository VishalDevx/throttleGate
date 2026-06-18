import { z } from "zod";

export const RateLimitAlgorithm = z.enum(["token_bucket", "sliding_window"]);
export type RateLimitAlgorithm = z.infer<typeof RateLimitAlgorithm>;

export const RateLimitTier = z.enum(["free", "pro", "enterprise"]);
export type RateLimitTier = z.infer<typeof RateLimitTier>;

export const CircuitBreakerState = z.enum(["closed", "open", "half-open"]);
export type CircuitBreakerState = z.infer<typeof CircuitBreakerState>;

export const HttpMethod = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
export type HttpMethod = z.infer<typeof HttpMethod>;

export const IdempotentMethods: ReadonlySet<HttpMethod> = new Set(["GET", "PUT", "DELETE", "HEAD", "OPTIONS"]);

export const RateLimitRuleSchema = z.object({
  key: z.string(),
  algorithm: RateLimitAlgorithm.default("sliding_window"),
  tier: RateLimitTier.optional(),
  capacity: z.number().positive(),
  windowMs: z.number().positive(),
  refillRate: z.number().min(0).optional(),
  cost: z.number().positive().default(1),
});
export type RateLimitRule = z.infer<typeof RateLimitRuleSchema>;

export const ProxyRouteSchema = z.object({
  path: z.string(),
  target: z.string().url(),
  methods: z.array(HttpMethod).optional(),
  headers: z.record(z.string()).optional(),
  stripPrefix: z.boolean().default(false),
  rateLimitRules: z.array(RateLimitRuleSchema).optional(),
  timeout: z.number().positive().default(30000),
  retry: z.object({
    maxRetries: z.number().int().min(0).default(2),
    baseDelayMs: z.number().positive().default(200),
    maxDelayMs: z.number().positive().default(5000),
  }).default({}),
  circuitBreaker: z.object({
    enabled: z.boolean().default(true),
    errorThreshold: z.number().min(0).max(100).default(50),
    recoveryTimeoutMs: z.number().positive().default(30000),
    halfOpenMaxRequests: z.number().int().positive().default(5),
    windowSizeMs: z.number().positive().default(60000),
    minRequests: z.number().int().positive().default(10),
  }).default({}),
});
export type ProxyRoute = z.infer<typeof ProxyRouteSchema>;

export const GatewayConfigSchema = z.object({
  port: z.number().default(8080),
  host: z.string().default("0.0.0.0"),
  bodyLimit: z.string().default("1mb"),
  maxHeaderSize: z.number().default(16384),
  requestTimeoutMs: z.number().default(30000),
  keepAliveTimeout: z.number().default(5000),
  redisUrl: z.string().default("redis://localhost:6379"),
  redisFailOpen: z.boolean().default(true),
  jwtSecret: z.string().default("change-me"),
  jwtIssuer: z.string().default("throttlegate"),
  jwtAudience: z.string().default("api"),
  logLevel: z.string().default("info"),
  metricsPort: z.number().default(9464),
  configPollIntervalMs: z.number().default(30000),
  defaultRateLimit: RateLimitRuleSchema.default({
    key: "global",
    algorithm: "sliding_window",
    capacity: 1000,
    windowMs: 60000,
    cost: 1,
  }),
  tiers: z.record(RateLimitTier, z.object({
    rateLimitRules: z.array(RateLimitRuleSchema),
  })).default({
    free: { rateLimitRules: [{ key: "global", algorithm: "sliding_window", capacity: 100, windowMs: 60000, cost: 1 }] },
    pro: { rateLimitRules: [{ key: "global", algorithm: "sliding_window", capacity: 1000, windowMs: 60000, cost: 1 }] },
    enterprise: { rateLimitRules: [{ key: "global", algorithm: "sliding_window", capacity: 10000, windowMs: 60000, cost: 1 }] },
  }),
  upstreams: z.array(z.object({
    id: z.string(),
    url: z.string().url(),
    healthCheck: z.object({
      interval: z.number().default(10000),
      timeout: z.number().default(3000),
      path: z.string().default("/health"),
      healthyThreshold: z.number().int().default(2),
      unhealthyThreshold: z.number().int().default(3),
    }).default({}),
    weight: z.number().positive().default(1),
    maxConnections: z.number().positive().default(100),
  })),
  routes: z.array(ProxyRouteSchema).default([]),
  ipAllowlist: z.array(z.string()).default([]),
  ipDenylist: z.array(z.string()).default([]),
  cors: z.object({
    enabled: z.boolean().default(true),
    origins: z.array(z.string()).default(["*"]),
    methods: z.array(HttpMethod).default(["GET","POST","PUT","DELETE","PATCH","OPTIONS"]),
    credentials: z.boolean().default(true),
  }).default({}),
});
export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
