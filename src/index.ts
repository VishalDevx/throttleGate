import http from "http";
import { createApp } from "./app";
import { getConfig, startConfigPolling } from "./config";
import { getRedisClient, loadAndRegisterScripts, setRedisAvailable } from "./services/redis";
import { setScriptShas } from "./middleware/rate-limiter";
import { setupGracefulShutdown } from "./utils/graceful-shutdown";
import { healthChecker } from "./services/health-checker";
import { requestCoalescer } from "./middleware/request-coalescer";
import { getLogger } from "./metrics/logger";
import { coalescerMetrics } from "./metrics/prometheus";

const logger = getLogger();

async function bootstrap(): Promise<void> {
  const config = getConfig();

  logger.info({
    port: config.port,
    redisUrl: config.redisUrl,
    redisFailOpen: config.redisFailOpen,
  }, "Starting throttleGate API Gateway");

  // 1. Connect to Redis and load Lua scripts
  try {
    const redis = getRedisClient();
    await redis.connect();
    await redis.ping();
    setRedisAvailable(true);
    logger.info("Connected to Redis");

    const shaMap = await loadAndRegisterScripts();
    setScriptShas(shaMap);
    logger.info("Rate limit Lua scripts loaded", { scripts: Array.from(shaMap.keys()) });
  } catch (err) {
    logger.warn({ err }, "Redis unavailable — running in fail-open mode");

    // Load scripts from disk for local evaluation if needed
    // (Redis-dependent scripts will use local fallback)
  }

  // 2. Create Express app
  const app = createApp();
  const server = http.createServer(app);

  // 3. Configure keep-alive
  server.keepAliveTimeout = config.keepAliveTimeout;
  server.headersTimeout = config.keepAliveTimeout + 1000;
  server.maxHeadersCount = 100;
  server.timeout = config.requestTimeoutMs;

  // 4. Start health checker
  healthChecker.start();

  // 5. Start config polling for hot-reload
  startConfigPolling();

  // 6. Periodic cleanup for request coalescer
  setInterval(() => {
    requestCoalescer.cleanup();
    coalescerMetrics.pendingCount.set(requestCoalescer.getPendingCount());
  }, 10000).unref();

  // 7. Graceful shutdown
  setupGracefulShutdown(server);

  // 8. Start listening
  server.listen(config.port, config.host, () => {
    logger.info({ host: config.host, port: config.port }, "Gateway listening");
    console.log(`\n  🚀 throttleGate running at http://${config.host}:${config.port}`);
    console.log(`  📊 Metrics: http://${config.host}:${config.metricsPort}/metrics`);
    console.log(`  ❤️  Health:  http://${config.host}:${config.port}/health`);
    console.log(`  ✅ Ready:   http://${config.host}:${config.port}/ready\n`);
  });

  // Start metrics server on separate port
  const metricsApp = (await import("express")).default();
  metricsApp.get("/metrics", async (_req: any, res: any) => {
    const { register } = await import("./metrics/prometheus");
    res.setHeader("Content-Type", register.contentType);
    res.end(await register.metrics());
  });
  metricsApp.listen(config.metricsPort, config.host, () => {
    logger.info({ port: config.metricsPort }, "Metrics server listening");
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start gateway:", err);
  process.exit(1);
});
