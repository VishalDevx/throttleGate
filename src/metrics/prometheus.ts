import prometheus from "prom-client";

// Registry
export const register = new prometheus.Registry();
prometheus.collectDefaultMetrics({ register });

// ===== HTTP / Proxy Metrics =====
export const proxyMetrics = {
  requestsTotal: new prometheus.Counter({
    name: "gateway_requests_total",
    help: "Total requests proxied",
    labelNames: ["route", "method", "status"],
    registers: [register],
  }),
  latency: new prometheus.Histogram({
    name: "gateway_request_latency_ms",
    help: "Request latency in ms",
    labelNames: ["route", "status"],
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    registers: [register],
  }),
  errors: new prometheus.Counter({
    name: "gateway_proxy_errors_total",
    help: "Proxy errors",
    labelNames: ["route", "error"],
    registers: [register],
  }),
  rejected: new prometheus.Counter({
    name: "gateway_requests_rejected_total",
    help: "Requests rejected by circuit breaker",
    labelNames: ["route", "reason"],
    registers: [register],
  }),
};

// ===== Rate Limit Metrics =====
export const rateLimitMetrics = {
  allowed: new prometheus.Counter({
    name: "ratelimit_allowed_total",
    help: "Requests allowed by rate limiter",
    labelNames: ["algorithm", "key", "tier"],
    registers: [register],
  }),
  rejected: new prometheus.Counter({
    name: "ratelimit_rejected_total",
    help: "Requests rejected by rate limiter",
    labelNames: ["algorithm", "key", "tier"],
    registers: [register],
  }),
  latency: new prometheus.Histogram({
    name: "ratelimit_check_latency_ms",
    help: "Rate limit check latency",
    labelNames: ["algorithm", "key"],
    buckets: [1, 2, 5, 10, 20, 50, 100],
    registers: [register],
  }),
  errors: new prometheus.Counter({
    name: "ratelimit_errors_total",
    help: "Rate limit errors",
    labelNames: ["algorithm", "key"],
    registers: [register],
  }),
  redisFailover: new prometheus.Counter({
    name: "ratelimit_redis_failover_total",
    help: "Rate limit checks served by local fallback when Redis is down",
    labelNames: ["algorithm", "key"],
    registers: [register],
  }),
};

// ===== Circuit Breaker Metrics =====
export const circuitBreakerMetrics = {
  stateChanges: new prometheus.Counter({
    name: "circuitbreaker_state_changes_total",
    help: "Circuit breaker state transitions",
    labelNames: ["breaker", "from", "to"],
    registers: [register],
  }),
  currentState: new prometheus.Gauge({
    name: "circuitbreaker_state",
    help: "Current circuit breaker state (0=closed, 1=half-open, 2=open)",
    labelNames: ["breaker"],
    registers: [register],
  }),
  requestCount: new prometheus.Counter({
    name: "circuitbreaker_requests_total",
    help: "Requests evaluated by circuit breaker",
    labelNames: ["breaker", "result"],
    registers: [register],
  }),
};

// ===== Security Metrics =====
export const securityMetrics = {
  authSuccesses: new prometheus.Counter({
    name: "security_auth_successes_total",
    help: "Successful authentications",
    registers: [register],
  }),
  authFailures: new prometheus.Counter({
    name: "security_auth_failures_total",
    help: "Failed authentications",
    labelNames: ["reason"],
    registers: [register],
  }),
  validationErrors: new prometheus.Counter({
    name: "security_validation_errors_total",
    help: "Request validation errors",
    labelNames: ["schema"],
    registers: [register],
  }),
  ipBlocked: new prometheus.Counter({
    name: "security_ip_blocked_total",
    help: "Requests blocked by IP filter",
    labelNames: ["reason"],
    registers: [register],
  }),
  payloadRejected: new prometheus.Counter({
    name: "security_payload_rejected_total",
    help: "Oversized payloads rejected",
    registers: [register],
  }),
  slowRequestDetected: new prometheus.Counter({
    name: "security_slow_request_detected_total",
    help: "Slow requests (potential slow-loris) detected",
    labelNames: ["type"],
    registers: [register],
  }),
};

// ===== Service Discovery Metrics =====
export const serviceMetrics = {
  instanceCount: new prometheus.Gauge({
    name: "service_discovery_instances",
    help: "Number of registered service instances",
    labelNames: ["service"],
    registers: [register],
  }),
  healthyCount: new prometheus.Gauge({
    name: "service_discovery_healthy_instances",
    help: "Number of healthy instances per service",
    labelNames: ["service"],
    registers: [register],
  }),
};

// ===== Request Coalescing Metrics =====
export const coalescerMetrics = {
  pendingCount: new prometheus.Gauge({
    name: "coalescer_pending_requests",
    help: "Number of currently coalesced/duplicate in-flight requests",
    registers: [register],
  }),
};
