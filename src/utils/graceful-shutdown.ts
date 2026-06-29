import { Server } from "http";
import { closeRedis } from "../services/redis";
import { getLogger } from "../metrics/logger";
import { stopConfigPolling } from "../config";
import { healthChecker } from "../services/health-checker";

const logger = getLogger();

export function setupGracefulShutdown(server: Server): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "Graceful shutdown initiated");

    // 1. Stop accepting new connections
    server.close(async () => {
      logger.info("HTTP server closed, no longer accepting connections");

      // 2. Stop background tasks
      stopConfigPolling();
      healthChecker.stop();

      // 3. Close Redis connections
      await closeRedis();

      logger.info("Graceful shutdown complete");
      process.exit(0);
    });

    // 2. Force shutdown after timeout (drain in-flight requests)
    setTimeout(() => {
      logger.error("Forced shutdown after drain timeout");
      process.exit(1);
    }, 30000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Prevent unhandled rejections from crashing the process
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled rejection");
  });

  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception");
    // Give logger time to flush
    setTimeout(() => process.exit(1), 1000).unref();
  });
}
