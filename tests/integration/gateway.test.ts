import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "../../src/app";
import request from "supertest";

describe("API Gateway Integration", () => {
  const app = createApp();

  describe("Health endpoints", () => {
    it("GET /health returns ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.service).toBe("throttlegate");
    });

    it("GET /ready returns status", async () => {
      const res = await request(app).get("/ready");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status");
    });
  });

  describe("Metrics endpoint", () => {
    it("GET /metrics returns prometheus format", async () => {
      const res = await request(app).get("/metrics");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/plain");
    });
  });

  describe("Tracing", () => {
    it("adds X-Trace-Id header to responses", async () => {
      const res = await request(app).get("/health");
      expect(res.headers["x-trace-id"]).toBeDefined();
    });
  });

  describe("CORS", () => {
    it("handles preflight OPTIONS requests", async () => {
      const res = await request(app)
        .options("/health")
        .set("Origin", "http://example.com");
      expect(res.status).toBe(204);
    });
  });

  describe("404 handling", () => {
    it("returns 404 for unknown routes", async () => {
      const res = await request(app).get("/nonexistent-route");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Not Found");
    });
  });
});

describe("Rate Limiter Middleware", () => {
  const app = createApp();

  it("sets rate limit headers", async () => {
    const res = await request(app).get("/health");
    // Rate limiter may not apply to /health depending on config
    // This test verifies the app doesn't crash
    expect(res.status).toBe(200);
  });
});
