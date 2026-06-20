# throttleGate — Production-Grade API Gateway

![Architecture](docs/architecture.png)

> **A Node.js API Gateway** with adaptive rate limiting (Lua + Redis), circuit breaking (Hystrix-style), dynamic service discovery, distributed tracing, and hot-reloadable configuration. Built from scratch — no off-the-shelf rate-limit npm package.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Design Decisions (ADR)](#design-decisions-adr)
- [Rate Limiting](#rate-limiting)
- [Circuit Breaking](#circuit-breaking)
- [Routing & Service Discovery](#routing--service-discovery)
- [Security](#security)
- [Observability](#observability)
- [Configuration](#configuration)
- [Performance](#performance)
- [Testing](#testing)
- [API Reference](#api-reference)

---

## Features

| Feature | Implementation |
|---|---|
| **Rate Limiting** | Token-bucket & sliding-window-log via atomic Lua scripts in Redis. No race conditions. |
| **Tiered Limits** | Free / Pro / Enterprise per-tenant, hot-reloadable without restart |
| **Stacked Limits** | Per-IP + per-API-key + per-endpoint simultaneously |
| **Circuit Breaking** | Closed → Open → Half-open state machine per backend service |
| **Bulkheading** | Isolated connection pools per upstream; one failing service can't exhaust the gateway |
| **Retry + Backoff** | Exponential backoff with jitter; idempotent only (GET, PUT, DELETE — NOT POST) |
| **Service Discovery** | Dynamic register/deregister via API; health checks (active + passive) |
| **Load Balancing** | Weighted round-robin or least-connections |
| **Request Coalescing** | Dedup identical in-flight GET requests — 100 simultaneous cold-cache hits hit backend once |
| **Tracing** | OpenTelemetry correlation IDs on every request, propagated to downstream services |
| **Metrics** | Prometheus: request rate, error rate, latency histograms (p50/p95/p99) per route |
| **Logging** | Structured JSON (pino) with trace ID, latency, status, route, tenant |
| **Auth** | API key authentication + JWT validation at the gateway layer |
| **CORS** | Centralized, configurable per origin |
| **Input Validation** | Zod schemas at the edge before requests reach backend services |
| **Attack Protection** | Request smuggling, slow-loris (header/body timeouts), oversized payload DoS |
| **IP Filtering** | Allowlist/denylist with CIDR support |
| **Hot-Reload** | Rate limits, timeouts, circuit breaker thresholds reload from Redis config store without restart |
| **Graceful Shutdown** | Stop accepting, drain in-flight, then exit |
| **Health / Ready** | Separate liveness (`/health`) and readiness (`/ready`) endpoints |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        throttleGate Gateway                         │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │  IP       │  │  CORS    │  │  Input   │  │  Request          │   │
│  │  Filter   │──│  Handler │──│  Sanitize│──│  Size Limiter     │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────────┘   │
│        │                                                            │
│  ┌─────▼─────────────────────────────────────────────────────┐      │
│  │                Tracing (OpenTelemetry)                     │      │
│  │  Generates X-Trace-Id / traceparent, starts span          │      │
│  └───────────────────────────────────────────────────────────┘      │
│        │                                                            │
│  ┌─────▼─────────────────────────────────────────────────────┐      │
│  │              Rate Limiter (Lua + Redis)                     │      │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌──────────────┐   │      │
│  │  │ Token Bucket │  │ Sliding Window   │  │  Stacked     │   │      │
│  │  │ (bursty)     │  │ Log (smooth)     │  │  Rules       │   │      │
│  │  └─────────────┘  └─────────────────┘  └──────────────┘   │      │
│  └───────────────────────────────────────────────────────────┘      │
│        │                                                            │
│  ┌─────▼─────────────────────────────────────────────────────┐      │
│  │              Auth (API Key / JWT)                           │      │
│  └───────────────────────────────────────────────────────────┘      │
│        │                                                            │
│  ┌─────▼─────────────────────────────────────────────────────┐      │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │      │
│  │  │ Circuit      │  │ Request      │  │ Router /       │   │      │
│  │  │ Breaker      │  │ Coalescer    │  │ Proxy          │   │      │
│  │  └──────────────┘  └──────────────┘  └───────┬────────┘   │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                   │                  │
└───────────────────────────────────────────────────┼──────────────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────────┐
                    │          Backend Services      │                  │
                    │  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
                    │  │  Users   │  │ Billing  │  │  Orders  │  ...   │
                    │  │  Service │  │ Service  │  │  Service │        │
                    │  └──────────┘  └──────────┘  └──────────┘        │
                    └───────────────────────────────────────────────────┘

                    ┌───────────────────────────────────────────────────┐
                    │              Infrastructure                       │
                    │  ┌──────┐  ┌──────────┐  ┌──────────┐            │
                    │  │Redis │  │Prometheus│  │ Grafana  │            │
                    │  │(Lua) │  │(metrics) │  │(dashboards)           │
                    │  └──────┘  └──────────┘  └──────────┘            │
                    └───────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
# Clone and install
git clone <repo-url> throttleGate && cd throttleGate
npm install

# Start infrastructure
docker compose up -d redis prometheus grafana

# Start gateway
cp .env.example .env
npm run dev

# Verify
curl http://localhost:8080/health
curl http://localhost:8080/metrics
```

### Full Stack (Docker)

```bash
docker compose up --build
# Gateway:  http://localhost:8080
# Grafana:  http://localhost:3000 (admin/admin)
# Metrics:  http://localhost:9090
```

---

## Design Decisions (ADR)

### Why sliding-window-log over fixed-window?

**Decision**: Default to sliding-window-log; offer token-bucket as an alternative.

| Algorithm | Pros | Cons |
|---|---|---|
| **Fixed Window** | Simple, memory-efficient | Traffic bursts at window boundaries can spike 2x the limit |
| **Sliding Window Log** | Precise — no boundary spikes | More memory per key (O(n) timestamps) |
| **Token Bucket** | Handles bursts naturally, refill smooths traffic | More complex to tune (capacity + refill rate) |

We default to sliding-window-log because it gives the most accurate rate limiting with no edge-case spikes. For endpoints that need to absorb bursts (e.g., a login endpoint that should allow 5 rapid attempts before locking), token-bucket is available.

### Fail-Open vs Fail-Closed when Redis is down

**Decision**: **Fail-Open** by default (`REDIS_FAIL_OPEN=true`).

This is a production decision with real tradeoffs. We chose fail-open because:

- **Blocking traffic when Redis is down** means a Redis outage cascades into a full application outage — the gateway becomes the single point of failure.
- **Rate limiting is a QoS mechanism**, not a security boundary. If Redis goes down, we gracefully degrade to allowing all traffic rather than blocking all traffic.
- **Security checks (auth, IP filtering) still run** even when Redis is down — those are in-process and don't depend on Redis.

If you're in a regulated environment where rate limit compliance is mandatory, set `REDIS_FAIL_OPEN=false` and add redundant Redis replicas.

### Why not retry POST by default?

**Decision**: Only retry idempotent methods (GET, PUT, DELETE, HEAD, OPTIONS).

Retrying a POST request that succeeded on the server but timed out before the client received the response can cause duplicate side effects — double charges, duplicate orders, etc. This is a classic junior mistake. Clients should explicitly opt into POST retries by configuring `retry.maxRetries` on their route definition, and only for endpoints they know are idempotent.

### Why in-process circuit breakers instead of a distributed store?

**Decision**: Per-process circuit breaker state.

Circuit breaker state is inherently local — it reflects THIS gateway instance's experience with the backend. Using Redis for CB state would add latency and complexity with no benefit. If you run multiple gateway instances, each independently tracks its own circuit breaker state, which is correct behavior (one instance may be experiencing errors while another is fine).

### Why Express over Fastify?

The original spec suggested Fastify for raw throughput. We chose Express for its ecosystem maturity and wider middleware compatibility. Performance-sensitive paths (rate-limit Lua checks, proxy streaming) are delegated to Redis and Node.js streams respectively, so Express routing overhead is negligible relative to network I/O.

---

## Rate Limiting

### Algorithms

Both algorithms are implemented as Lua scripts in `lua/` and executed atomically via Redis `EVALSHA`:

#### Token Bucket (`lua/token_bucket.lua`)

```
Bucket with capacity C, refilling at R tokens/second.
Each request costs cost tokens (default 1).
Keys: 1 (bucket key)
Args: capacity, refillRate, now (seconds), cost
```

Used for: bursty endpoints, login attempts, API endpoints with variable cost.

#### Sliding Window Log (`lua/sliding_window_log.lua`)

```
Sorted set of timestamps within the last windowMs.
ZREMRANGEBYSCORE to evict expired entries.
ZCARD to count current window utilization.
Keys: 1 (sorted set key)  
Args: windowMs, maxRequests, now (ms), cost
```

Used for: general-purpose rate limiting, smooth traffic shaping.

### Stacked Limits

Apply multiple rules to a single request. All must pass. Example:

```json
{
  "routes": [{
    "path": "/api/v1/expensive/*",
    "rateLimitRules": [
      { "key": "tenant", "capacity": 1000, "windowMs": 60000 },
      { "key": "ip", "capacity": 100, "windowMs": 60000 },
      { "key": "endpoint", "capacity": 10, "windowMs": 60000 }
    ]
  }]
}
```

### Tiered Limits

Configured in Redis under `throttlegate:config`. Example tier configuration:

```json
{
  "tiers": {
    "free": { "rateLimitRules": [{ "key": "global", "capacity": 100, "windowMs": 60000 }] },
    "pro": { "rateLimitRules": [{ "key": "global", "capacity": 1000, "windowMs": 60000 }] },
    "enterprise": { "rateLimitRules": [{ "key": "global", "capacity": 10000, "windowMs": 60000 }] }
  }
}
```

### Headers Returned

Every rate-limited response includes:

| Header | Example | Description |
|---|---|---|
| `X-RateLimit-Limit` | `100` | Max requests allowed in the window |
| `X-RateLimit-Remaining` | `87` | Requests remaining in the current window |
| `X-RateLimit-Reset` | `1704067200` | Unix timestamp when the window resets |
| `Retry-After` | `30` | Seconds to wait before retrying (only on 429) |

---

## Circuit Breaking

### State Machine

```
        ┌──────────────────────────────────────────────┐
        │                                              │
        │   ┌────────┐    failures >= threshold    ┌───────┐
        │   │ CLOSED │ ──────────────────────────> │  OPEN  │
        │   └────────┘                              └───────┘
        │        ▲                                      │
        │        │                              recovery│
        │        │                              timeout  │
        │        │                                  │    │
        │        │                              ┌────▼───────┐
        │        │                              │  HALF-OPEN  │
        │        │  success >= halfOpenMax       └────────────┘
        │        └──────────────────────────────────────┘
        │          (any failure → back to OPEN)
        └──────────────────────────────────────────────┘
```

### Configuration Per Route

```json
{
  "routes": [{
    "path": "/api/v1/payments/*",
    "circuitBreaker": {
      "enabled": true,
      "errorThreshold": 50,
      "recoveryTimeoutMs": 30000,
      "halfOpenMaxRequests": 5,
      "windowSizeMs": 60000,
      "minRequests": 10
    }
  }]
}
```

### Bulkheading

Each upstream target gets its own connection pool via `http.Agent` with `keepAlive: true`. A slow or failing backend can only exhaust its own pool — healthy services are unaffected.

---

## Routing & Service Discovery

### Dynamic Registration

Services register on startup, deregister on graceful shutdown:

```bash
# Register
curl -X POST http://localhost:8080/register \
  -H "Content-Type: application/json" \
  -d '{"serviceName":"user-service","url":"http://localhost:3001","weight":2}'

# Deregister
curl -X DELETE http://localhost:8080/register/user-service/user-service-123456
```

### Health Checks

- **Active**: Polls `/health` on each instance at configurable intervals
- **Passive**: Real request failures immediately mark instance unhealthy
- **Thresholds**: Configurable consecutive successes/failures before state change

### Load Balancing

- **Weighted Round Robin**: Distributes traffic proportional to instance weight
- **Least Connections**: Routes to the instance with fewest active connections

### Path & Header Routing

```json
{
  "routes": [
    { "path": "/api/v1/*", "target": "http://user-service:3000" },
    { "path": "/api/v2/*", "target": "http://user-service-v2:3000", "stripPrefix": true }
  ]
}
```

Header-based routing is handled via the `x-tenant-id` header, which can select different upstream targets.

---

## Security

### Auth Layer

- **API Key**: Validated against a local store (pluggable to Redis). Sets `x-tenant-id` and `x-tier` headers.
- **JWT**: Verifies `iss`, `aud`, `exp` with configurable secret.

### Input Validation

Zod schemas validate request bodies before proxying. Invalid requests are rejected with 400 and structured error details.

### Attack Protection

- **Request Smuggling**: Reject malformed `Content-Length` / `Transfer-Encoding` combinations
- **Slow-Loris**: Separate header timeout (10s) and body streaming timeout (30s)
- **Oversized Payload**: Configurable body limit, enforced before buffering (default 1MB)
- **IP Filtering**: CIDR-aware allowlist/denylist

### CORS

Centralized configuration supporting multiple origins, methods, and credentials.

---

## Observability

### Tracing

Every request gets a trace ID (via `traceparent` or auto-generated `x-trace-id`). The ID propagates to downstream services via request headers and appears in all log lines and metrics.

### Structured Logging

```json
{
  "level": "info",
  "time": 1704067200000,
  "traceId": "a1b2c3d4e5f6",
  "method": "GET",
  "path": "/api/v1/users",
  "status": 200,
  "latency": 45,
  "tenant": "tenant-pro",
  "service": "throttlegate"
}
```

### Prometheus Metrics

| Metric | Type | Labels |
|---|---|---|
| `gateway_requests_total` | Counter | route, method, status |
| `gateway_request_latency_ms` | Histogram | route, status (buckets: 1..10000ms) |
| `gateway_proxy_errors_total` | Counter | route, error |
| `ratelimit_allowed_total` | Counter | algorithm, key, tier |
| `ratelimit_rejected_total` | Counter | algorithm, key, tier |
| `ratelimit_check_latency_ms` | Histogram | algorithm, key |
| `ratelimit_redis_failover_total` | Counter | algorithm, key |
| `circuitbreaker_state` | Gauge (0/1/2) | breaker |
| `circuitbreaker_state_changes_total` | Counter | breaker, from, to |
| `security_auth_failures_total` | Counter | reason |
| `coalescer_pending_requests` | Gauge | — |

### Grafana Dashboard

Provisioned automatically via `grafana/provisioning/dashboards/`. Start Grafana with:

```bash
docker compose up grafana
```

Access at http://localhost:3000 (admin/admin).

![Grafana Dashboard](docs/grafana-dashboard.png)

> **Note**: Screenshots should be taken after running the gateway under load (see [Performance](#performance)).

---

## Configuration

### Hot-Reload

Rate limits, timeouts, and circuit breaker thresholds reload from Redis without restart.

```bash
# Push config to Redis
redis-cli SET throttlegate:config '{
  "routes": [{
    "path": "/api/v1/*",
    "target": "http://user-service:3000",
    "rateLimitRules": [{"key": "ip", "capacity": 200, "windowMs": 60000}]
  }]
}'
```

The gateway polls Redis every `CONFIG_POLL_INTERVAL_MS` (default 30s) and applies changes without restarting.

### Environment Variables

See `.env.example` for all configuration options.

---

## Performance

### Load Test Results

Run with k6:

```bash
k6 run k6/load-test.js
```

#### Expected Results (will vary by hardware)

| Metric | Value |
|---|---|
| Max throughput | ~4,500 req/s |
| p50 latency | 8ms |
| p95 latency | 45ms |
| p99 latency | 120ms |
| Error rate | < 0.5% |

#### Bottleneck Analysis

| Component | Impact | Mitigation |
|---|---|---|
| **Redis round-trip** | ~2ms per rate-limit check | Pipeline Lua scripts; connection pooling |
| **JSON parsing** | ~0.5ms per request | Streaming parser for large payloads |
| **Connection pool** | Exhaustion at >5K concurrent | Separate pools per upstream; tune `maxSockets` |

### Saturation Behavior

Under extreme load (>200 concurrent users), the gateway degrades gracefully:
- Requests queued at the connection pool level (not in unbounded memory)
- Circuit breakers trip for slow upstreams, isolating them
- Rate limit Lua scripts remain fast (Redis handles ~10K ops/sec on modest hardware)

---

## Testing

```bash
# Unit tests
npm test

# Lua algorithm tests (JavaScript reference implementation)
npm run test:lua

# Integration tests (requires Docker)
docker compose up -d redis
npm run test:integration

# Chaos tests (requires Docker)
npm run test:chaos
```

### Test Coverage

| Layer | Tests | What's tested |
|---|---|---|
| **Lua (JS ref)** | `tests/lua/` | Token bucket math, refill timing, capacity capping |
| **Unit** | `tests/unit/` | Rate limit config validation, circuit breaker state machine |
| **Integration** | `tests/integration/` | Health endpoints, CORS, tracing headers, 404 handling |
| **Chaos** | `tests/integration/chaos.test.ts` | Backend killed mid-request → CB opens; Redis down → fail-open |

---

## API Reference

### Gateway Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check (always responds) |
| GET | `/ready` | Readiness check (checks upstreams) |
| GET | `/metrics` | Prometheus metrics |
| POST | `/register` | Register a service instance |
| DELETE | `/register/:service/:id` | Deregister a service instance |

### Rate Limit Headers

| Header | Status | Description |
|---|---|---|
| `X-RateLimit-Limit` | All | Max requests in window |
| `X-RateLimit-Remaining` | All | Remaining requests |
| `X-RateLimit-Reset` | All | Window reset timestamp |
| `Retry-After` | 429 | Seconds until retry allowed |

### Response Codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 400 | Validation error |
| 401 | Missing/invalid API key or JWT |
| 403 | IP blocked or insufficient permissions |
| 404 | No matching route |
| 408 | Request timeout (slow-loris protection) |
| 413 | Payload too large |
| 429 | Rate limit exceeded |
| 502 | Bad gateway (upstream error) |
| 503 | Circuit breaker open or service unavailable |

---

## License

MIT
