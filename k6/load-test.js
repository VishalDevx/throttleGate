import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

export const options = {
  stages: [
    { duration: "30s", target: 50 },   // Ramp up to 50 users
    { duration: "1m", target: 100 },   // Ramp to 100 users
    { duration: "1m", target: 200 },   // Ramp to 200 users
    { duration: "30s", target: 300 },  // Peak at 300 users
    { duration: "30s", target: 100 },  // Scale down
    { duration: "30s", target: 0 },    // Cool down
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
    http_req_failed: ["rate<0.05"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

const requestRate = new Rate("request_rate");
const errorRate = new Rate("error_rate");
const latencyP95 = new Trend("latency_p95");
const rateLimitHit = new Counter("rate_limit_hits");

const endpoints = [
  { path: "/health", method: "GET" },
  { path: "/ready", method: "GET" },
  { path: "/metrics", method: "GET" },
];

export default function () {
  group("Gateway Requests", () => {
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

    const params = {
      headers: {
        "X-API-Key": "sk-pro-456",
        "X-Tenant-Id": "test-tenant",
        "Content-Type": "application/json",
      },
      timeout: "5000",
    };

    const res = http.get(`${BASE_URL}${endpoint.path}`, params);

    // Track metrics
    requestRate.add(1);
    const isError = res.status >= 400;
    if (isError) {
      errorRate.add(1);
    }

    if (res.status === 429) {
      rateLimitHit.add(1);
    }

    // Check responses
    check(res, {
      "status is 2xx": (r) => r.status >= 200 && r.status < 300,
      "status not 5xx": (r) => r.status < 500,
      "response time < 2s": (r) => r.timings.duration < 2000,
      "has trace header": (r) => r.headers["X-Trace-Id"] !== undefined,
    });

    latencyP95.add(res.timings.duration);

    // Simulate realistic wait between requests
    sleep(Math.random() * 0.5 + 0.1);
  });
}

export function handleSummary(data) {
  return {
    "stdout": JSON.stringify({
      throughput: data.metrics.http_reqs ? data.metrics.http_reqs.values : null,
      latency: {
        avg: data.metrics.http_req_duration ? data.metrics.http_req_duration.values.avg : null,
        p50: data.metrics.http_req_duration ? data.metrics.http_req_duration.values.med : null,
        p95: data.metrics.http_req_duration ? data.metrics.http_req_duration.values["p(95)"] : null,
        p99: data.metrics.http_req_duration ? data.metrics.http_req_duration.values["p(99)"] : null,
      },
      errorRate: data.metrics.http_req_failed ? data.metrics.http_req_failed.values.rate : null,
      rateLimitHits: data.metrics.rate_limit_hits ? data.metrics.rate_limit_hits.values.count : null,
    }),
  };
}
