import { Request, Response, NextFunction } from "express";
import { getConfig } from "../config";
import { securityMetrics } from "../metrics/prometheus";
import net from "net";

/**
 * IP Allowlist/Denylist middleware
 */
export function ipFilter(req: Request, res: Response, next: NextFunction): void {
  const config = getConfig();
  const ip = req.ip ?? req.socket.remoteAddress ?? "";

  // Check denylist first (deny takes precedence over allow)
  if (config.ipDenylist.length > 0) {
    const denied = config.ipDenylist.some((rule) => ipMatchesRule(ip, rule));
    if (denied) {
      securityMetrics.ipBlocked.inc({ reason: "denylist" });
      res.status(403).json({ error: "Forbidden", message: "Your IP is blocked" });
      return;
    }
  }

  // If allowlist is configured, IP must be in it
  if (config.ipAllowlist.length > 0) {
    const allowed = config.ipAllowlist.some((rule) => ipMatchesRule(ip, rule));
    if (!allowed) {
      securityMetrics.ipBlocked.inc({ reason: "not_in_allowlist" });
      res.status(403).json({ error: "Forbidden", message: "Your IP is not allowed" });
      return;
    }
  }

  next();
}

function ipMatchesRule(ip: string, rule: string): boolean {
  if (rule.includes("/")) {
    // CIDR notation
    const [subnet, bitsStr] = rule.split("/");
    const bits = parseInt(bitsStr!, 10);
    if (bits <= 0 || bits > 32) return false;

    const ipNum = ipToNumber(ip);
    const subnetNum = ipToNumber(subnet!);
    if (ipNum === null || subnetNum === null) return false;

    const mask = ~(2 ** (32 - bits) - 1);
    return (ipNum & mask) === (subnetNum & mask);
  }

  // Exact match or wildcard
  if (rule.includes("*")) {
    const pattern = "^" + rule.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$";
    return new RegExp(pattern).test(ip);
  }

  return ip === rule;
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

/**
 * Request size limiter — rejects oversized payloads before they're buffered
 */
export function requestSizeLimiter(maxBytes: number): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers["content-length"] ?? "0", 10);
    if (contentLength > maxBytes) {
      securityMetrics.payloadRejected.inc();
      res.status(413).json({ error: "Payload Too Large", message: `Request body exceeds ${maxBytes} bytes` });
      return;
    }
    next();
  };
}

/**
 * Slow request protection — enforces header and body timeout
 */
export function slowRequestProtection(headerTimeoutMs = 10000, bodyTimeoutMs = 30000): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    let headerTimer: ReturnType<typeof setTimeout> | undefined;
    let bodyTimer: ReturnType<typeof setTimeout> | undefined;

    function clearTimers(): void {
      if (headerTimer) clearTimeout(headerTimer);
      if (bodyTimer) clearTimeout(bodyTimer);
    }

    // Header timeout: if headers haven't been fully received in time
    headerTimer = setTimeout(() => {
      clearTimers();
      if (!res.headersSent) {
        securityMetrics.slowRequestDetected.inc({ type: "header" });
        res.status(408).json({ error: "Request Timeout", message: "Headers took too long" });
      }
      req.destroy(new Error("Header timeout"));
    }, headerTimeoutMs);
    headerTimer.unref();

    // Body timeout: streaming body takes too long
    let bytesReceived = 0;
    req.on("data", (chunk: Buffer) => {
      bytesReceived += chunk.length;
      // Reset body timer on each data event
      if (bodyTimer) clearTimeout(bodyTimer);
      bodyTimer = setTimeout(() => {
        clearTimers();
        if (!res.headersSent) {
          securityMetrics.slowRequestDetected.inc({ type: "body" });
          res.status(408).json({ error: "Request Timeout", message: "Request body streaming took too long" });
        }
        req.destroy(new Error("Body timeout"));
      }, bodyTimeoutMs);
      bodyTimer.unref();
    });

    req.on("end", clearTimers);
    req.on("error", clearTimers);
    req.on("close", clearTimers);

    // Clear timers when response finishes
    res.on("finish", clearTimers);
    res.on("close", clearTimers);

    next();
  };
}
