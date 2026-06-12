/**
 * Type-safe API client for the throttleGate backend.
 * All requests are proxied through Vite's dev server to http://localhost:3000.
 *
 * @module api
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricPoint {
  timestamp: number
  value: number
}

export interface TrafficMetrics {
  requestsPerSecond: MetricPoint[]
  latencyP50: MetricPoint[]
  latencyP95: MetricPoint[]
  latencyP99: MetricPoint[]
}

export interface RateLimitConfig {
  id: string
  routePattern: string
  maxRequests: number
  windowDuration: number // seconds
  burstAllowance: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CircuitBreakerStatus {
  id: string
  name: string
  state: 'closed' | 'open' | 'half-open'
  failureCount: number
  lastFailureTime: string | null
  recoveryTimeout: number // ms
  healthScore: number // 0-100
}

export interface ApiKey {
  id: string
  name: string
  key: string
  permissions: string[]
  expiresAt: string | null
  active: boolean
  rateLimitUsage: number
  createdAt: string
}

export interface CreateApiKeyRequest {
  name: string
  permissions: string[]
  expiresAt?: string
}

export interface Settings {
  gatewayName: string
  defaultRateLimit: number
  alertWebhooks: string[]
  alertThresholds: {
    errorRate: number
    latencyP99: number
  }
  loggingLevel: 'debug' | 'info' | 'warn' | 'error'
}

export interface RedisStatus {
  connected: boolean
  latency: number
  memoryUsage: number
  uptime: number
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

const BASE_URL = '/api'

/**
 * Generic fetch wrapper with error handling and typing.
 * @template T - The expected response type
 * @param endpoint - API endpoint path (e.g. "/metrics")
 * @param options - Fetch options (method, body, etc.)
 * @returns Parsed response of type T
 */
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(error.message || `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

/** Fetches real-time traffic metrics. */
export function fetchMetrics(): Promise<TrafficMetrics> {
  return request<TrafficMetrics>('/metrics')
}

/** Fetches all rate limit configurations. */
export function fetchRateLimits(): Promise<RateLimitConfig[]> {
  return request<RateLimitConfig[]>('/rate-limits')
}

/** Creates or updates a rate limit configuration. */
export function updateRateLimit(config: Partial<RateLimitConfig> & { id?: string }): Promise<RateLimitConfig> {
  return request<RateLimitConfig>('/rate-limits', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

/** Deletes a rate limit configuration by ID. */
export function deleteRateLimit(id: string): Promise<void> {
  return request<void>(`/rate-limits/${id}`, { method: 'DELETE' })
}

/** Fetches circuit breaker statuses. */
export function fetchCircuitBreakers(): Promise<CircuitBreakerStatus[]> {
  return request<CircuitBreakerStatus[]>('/circuit-breakers')
}

/** Resets a specific circuit breaker by ID. */
export function resetCircuitBreaker(id: string): Promise<CircuitBreakerStatus> {
  return request<CircuitBreakerStatus>(`/circuit-breakers/${id}/reset`, { method: 'POST' })
}

/** Fetches all API keys. */
export function fetchApiKeys(): Promise<ApiKey[]> {
  return request<ApiKey[]>('/keys')
}

/** Creates a new API key. */
export function createApiKey(data: CreateApiKeyRequest): Promise<ApiKey> {
  return request<ApiKey>('/keys', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** Revokes an API key by ID. */
export function revokeApiKey(id: string): Promise<void> {
  return request<void>(`/keys/${id}`, { method: 'DELETE' })
}

/** Fetches current gateway settings. */
export function fetchSettings(): Promise<Settings> {
  return request<Settings>('/settings')
}

/** Updates gateway settings. */
export function updateSettings(settings: Partial<Settings>): Promise<Settings> {
  return request<Settings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

/** Fetches Redis connection status. */
export function fetchRedisStatus(): Promise<RedisStatus> {
  return request<RedisStatus>('/redis-status')
}
