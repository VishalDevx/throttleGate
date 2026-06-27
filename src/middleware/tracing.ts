import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { getLogger } from "../metrics/logger";

const logger = getLogger();

export function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const traceparent = req.headers["traceparent"] as string | undefined;
  let traceId: string;

  if (traceparent) {
    const parts = traceparent.split("-");
    traceId = parts[1] ?? uuidv4().replace(/-/g, "");
  } else {
    traceId = (req.headers["x-trace-id"] as string) ??
              (req.headers["x-request-id"] as string) ??
              uuidv4().replace(/-/g, "");
  }

  (req as any).traceId = traceId;
  const startTime = Date.now();

  const tracer = trace.getTracer("throttlegate");
  const span = tracer.startSpan(`${req.method} ${req.path}`, {
    attributes: {
      "http.method": req.method,
      "http.url": req.path,
      "http.host": req.hostname,
      "trace_id": traceId,
    },
  });

  res.setHeader("X-Trace-Id", traceId);
  res.setHeader("X-Request-Id", traceId);
  req.headers["x-trace-id"] = traceId;

  const originalEnd = res.end.bind(res);
  res.end = function (this: Response, ...args: any[]): any {
    const latency = Date.now() - startTime;

    span.setAttributes({
      "http.status_code": res.statusCode,
      "http.latency_ms": latency,
    });

    if (res.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }

    span.end();

    logger.info({
      traceId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      latency,
      route: (req as any).route?.path,
      tenant: req.headers["x-tenant-id"],
      userAgent: req.headers["user-agent"],
    }, "request completed");

    return originalEnd.apply(this, args as [any, BufferEncoding, (() => void) | undefined]);
  };

  next();
}
