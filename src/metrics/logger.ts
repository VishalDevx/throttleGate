import pino from "pino";
import { getConfig } from "../config";

let logger: pino.Logger;

export function getLogger(): pino.Logger {
  if (!logger) {
    const config = getConfig();
    logger = pino({
      level: config.logLevel,
      transport: process.env.NODE_ENV !== "production" && config.logLevel === "info"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
      formatters: {
        level(label) {
          return { level: label };
        },
        bindings() {
          return { service: "throttlegate" };
        },
      },
      serializers: {
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", "req.headers['x-api-key']"],
        censor: "[REDACTED]",
      },
    });
  }
  return logger;
}
