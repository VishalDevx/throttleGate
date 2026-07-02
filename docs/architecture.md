# Architecture Overview

## Component Diagram

```ascii
                                   ┌─────────────────────────────────────────────────────────────────────────────┐
                                   │                              CLIENT                                        │
                                   └───────────────────────────┬─────────────────────────────────────────────────┘
                                                               │
                                                               ▼
                               ┌─────────────────────────────────────────────────────────────────────────────────┐
                               │                          throttleGate API Gateway                              │
                               │                                                                               │
                               │  ┌─────────────────────────────────────────────────────────────────────────┐   │
                               │  │                     Connection Layer (HTTP/1.1 Keep-Alive)               │   │
                               │  │                     Keep-Alive: 5s, Max Headers: 100                    │   │
                               │  └─────────────────────────────────────────────────────────────────────────┘   │
                               │                                     │                                          │
                               │  ┌─────────────────────────────────────────────────────────────────────────┐   │
                               │  │                   Security Middleware Stack                               │   │
                               │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐   │   │
                               │  │  │ IP Filter│  │  CORS    │  │ Input    │  │ Request Size Limiter  │   │   │
                               │  │  │          │  │ Handler  │  │ Sanitize │  │ (1MB default)         │   │   │
                               │  │  └──────────┘  └──────────┘  └──────────┘  └───────────────────────┘   │   │
                               │  └─────────────────────────────────────────────────────────────────────────┘   │
                               │                                     │                                          │
                               │  ┌─────────────────────────────────────────────────────────────────────────┐   │
                               │  │                   Observability Middleware                               │   │
                               │  │  ┌──────────────────────┐  ┌──────────────────────┐                     │   │
                               │  │  │  Tracing (OpenTelemetry)│  │  Structured Logging  │                     │   │
                               │  │  │  - Span per request    │  │  - pino JSON output  │                     │   │
                               │  │  │  - Trace ID propagation│  │  - Trace ID, latency │                     │   │
                               │  │  └──────────────────────┘  └──────────────────────┘                     │   │
                               │  └─────────────────────────────────────────────────────────────────────────┘   │
                               │                                     │                                          │
                               │  ┌─────────────────────────────────────────────────────────────────────────┐   │
                               │  │                   Rate Limiting Layer                                   │   │
                               │  │  ┌─────────────────────────────────────────────┐                         │   │
                               │  │  │  Lua Scripts (EVALSHA via Redis)            │                         │   │
                               │  │  │  ┌────────────────┐  ┌───────────────────┐ │                         │   │
                               │  │  │  │ Token Bucket   │  │ Sliding Window Log│ │                         │   │
                               │  │  │  │ (burst control) │  │ (smooth shaping)  │ │                         │   │
                               │  │  │  └────────────────┘  └───────────────────┘ │                         │   │
                               │  │  │  Stacked: IP + API Key + Tenant + Endpoint  │                         │   │
                               │  │  └─────────────────────────────────────────────┘                         │   │
                               │  └─────────────────────────────────────────────────────────────────────────┘   │
                               │                                     │                                          │
                               │  ┌─────────────────────────────────────────────────────────────────────────┐   │
                               │  │                   Auth Layer                                            │   │
                               │  │  ┌──────────────────────┐  ┌──────────────────────┐                     │   │
                               │  │  │  API Key Auth        │  │  JWT Auth            │                     │   │
                               │  │  │  (x-api-key header)  │  │  (Bearer token)      │                     │   │
                               │  │  └──────────────────────┘  └──────────────────────┘                     │   │
                               │  └─────────────────────────────────────────────────────────────────────────┘   │
                               │                                     │                                          │
                               │  ┌─────────────────────────────────────────────────────────────────────────┐   │
                               │  │                   Request Processing                                    │   │
                               │  │  ┌──────────────────────┐  ┌──────────────────────┐                     │   │
                               │  │  │  Request Coalescer   │  │  Circuit Breaker     │                     │   │
                               │  │  │  (dedup GET/HEAD)    │  │  (per-route SM)      │                     │   │
                               │  │  └──────────────────────┘  └──────────────────────┘                     │   │
                               │  └─────────────────────────────────────────────────────────────────────────┘   │
                               │                                     │                                          │
                               │  ┌─────────────────────────────────────────────────────────────────────────┐   │
                               │  │                   Proxy Layer                                          │   │
                               │  │  ┌──────────────────────┐  ┌──────────────────────┐                     │   │
                               │  │  │  Router (path/header) │  │  Proxy (http-proxy)  │                     │   │
                               │  │  │  Service Discovery    │  │  Retry + Backoff     │                     │   │
                               │  │  │  Load Balancer (WRR/LC)│  │  Connection Pool    │                     │   │
                               │  │  └──────────────────────┘  └──────────────────────┘                     │   │
                               │  └─────────────────────────────────────────────────────────────────────────┘   │
                               └─────────────────────────────────────────────────────────────────────────────────┘
                                                               │
                                                               ▼
                               ┌─────────────────────────────────────────────────────────────────────────────────┐
                               │                          UPSTREAM BACKENDS                                      │
                               │                                                                               │
                               │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
                               │  │ User Service │  │Billing Service│  │ Order Service │  │  ...         │      │
                               │  │ :3001        │  │ :3002         │  │ :3003         │  │              │      │
                               │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘      │
                               └─────────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. Request arrives → HTTP keep-alive connection
2. IP filter (allow/deny check)
3. CORS handler (origin validation, preflight)
4. Input sanitizer (strip XSS/SQLi patterns)
5. Request size check (reject oversized payloads)
6. Slow request timer starts (header + body timeout)
7. Tracing middleware generates/propagates trace ID
8. Rate limiter (Lua EVALSHA against Redis):
   a. If Redis available → atomic rate check
   b. If Redis down → fail-open/closed per config
   c. If rate exceeded → 429 with Retry-After
9. Authentication (API key or JWT)
10. Request coalescing (dedup identical GETs)
11. Circuit breaker check:
    a. If OPEN → 503 Service Unavailable
    b. If CLOSED/HALF-OPEN → allow through
12. Route matching → service discovery → load balancer
13. Proxy request with retry (idempotent only):
    a. Select connection from pool
    b. Forward with hop-by-hop headers stripped
    c. Stream response back
    d. Record result in circuit breaker
14. Response → trace ID header → structured log → done
```

## Redis Data Model

```
# Rate Limiting (Sliding Window Log)
rate_limit:sliding_window:<key_type>:<value>  →  Sorted Set (timestamps)

# Rate Limiting (Token Bucket)
rate_limit:token_bucket:<key_type>:<value>    →  Hash { tokens, lastRefillTime }

# Hot-Reloadable Config
throttlegate:config                            →  String (JSON)

# Service Instance Heartbeat (optional)
throttlegate:heartbeat:<service>:<instance>    →  String (timestamp)
```

## Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point, bootstrap, server setup |
| `src/app.ts` | Express app creation with middleware stack |
| `src/config/index.ts` | Configuration management + hot-reload |
| `src/config/schema.ts` | Zod schemas for all configuration |
| `src/config/hot-reload.ts` | Redis-based config polling |
| `src/middleware/rate-limiter.ts` | Rate limiting with Lua scripts |
| `src/middleware/auth.ts` | API key and JWT authentication |
| `src/middleware/cors.ts` | CORS handling |
| `src/middleware/security.ts` | IP filter, slow-loris protection |
| `src/middleware/request-coalescer.ts` | Request deduplication |
| `src/middleware/tracing.ts` | OpenTelemetry tracing |
| `src/middleware/request-validation.ts` | Zod validation + sanitization |
| `src/services/redis.ts` | Redis client, Lua script management |
| `src/services/circuit-breaker-manager.ts` | Circuit breaker state machine |
| `src/services/service-registry.ts` | Dynamic service registration |
| `src/services/load-balancer.ts` | WRR and least-connections |
| `src/services/health-checker.ts` | Active + passive health checks |
| `src/routing/proxy.ts` | HTTP proxy with retry + backoff |
| `src/routing/router.ts` | Dynamic route construction |
| `src/metrics/prometheus.ts` | Prometheus metric definitions |
| `src/metrics/logger.ts` | Structured pino logger |
| `src/utils/retry.ts` | Exponential backoff with jitter |
| `src/utils/graceful-shutdown.ts` | SIGTERM/SIGINT handling |
| `lua/token_bucket.lua` | Token bucket Redis Lua script |
| `lua/sliding_window_log.lua` | Sliding window log Redis Lua script |
| `tests/lua/token_bucket.test.ts` | Token bucket JS reference tests |
| `tests/unit/circuit-breaker.test.ts` | Circuit breaker unit tests |
| `tests/integration/gateway.test.ts` | Gateway integration tests |
| `tests/integration/chaos.test.ts` | Chaos monkey tests |
| `k6/load-test.js` | k6 load test script |
