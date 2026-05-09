import { Request, Response, NextFunction } from "express";
import { logger } from "../metrics/logger";

interface PendingRequest {
  resolve: (result: CoalescedResponse) => void;
  reject: (err: Error) => void;
  createdAt: number;
}

interface CoalescedResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
}

class RequestCoalescer {
  private pending = new Map<string, PendingRequest>();
  private readonly MAX_WAIT_MS = 30000;

  private getCoalesceKey(req: Request): string | null {
    const method = req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") return null;

    const tenant = (req.headers["x-tenant-id"] as string) ?? "default";
    return `${method}:${tenant}:${req.path}:${req.url.split("?").slice(1).join("?")}`;
  }

  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction): void => {
      const key = this.getCoalesceKey(req);
      if (!key) {
        next();
        return;
      }

      const existing = this.pending.get(key);
      if (existing) {
        (req as any).__coalesced = true;

        existing.promise
          .then((cached) => {
            res.status(cached.statusCode);
            for (const [name, value] of Object.entries(cached.headers)) {
              res.setHeader(name, value);
            }
            res.end(cached.body);
          })
          .catch((err) => {
            logger.error({ err, key }, "Coalesced request failed, proxying");
            next();
          });
        return;
      }

      let resolve: (result: CoalescedResponse) => void;
      let reject: (err: Error) => void;
      const promise = new Promise<CoalescedResponse>((res, rej) => {
        resolve = res;
        reject = rej;
      });

      this.pending.set(key, {
        promise,
        resolve: resolve!,
        reject: reject!,
        createdAt: Date.now(),
      });

      const chunks: Buffer[] = [];

      const originalWrite = res.write.bind(res);
      res.write = (chunk: any, ...args: any[]) => {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return originalWrite(chunk, ...args);
      };

      const originalEnd = res.end.bind(res);
      res.end = (...args: any[]) => {
        if (args[0]) chunks.push(Buffer.isBuffer(args[0]) ? args[0] : Buffer.from(args[0]));
        res.end = originalEnd;

        const body = Buffer.concat(chunks);
        const headers: Record<string, string | string[]> = {};
        for (const [name, value] of Object.entries(res.getHeaders())) {
          if (value !== undefined) headers[name] = value as string | string[];
        }

        this.pending.delete(key);
        this.cleanup();
        resolve!({ statusCode: res.statusCode, headers, body });

        return originalEnd(...args);
      };

      const originalDestroy = res.destroy.bind(res);
      res.destroy = (error?: Error) => {
        this.pending.delete(key);
        reject!(error ?? new Error("Response destroyed"));
        return originalDestroy(error);
      };

      next();
    };
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, pending] of this.pending) {
      if (now - pending.createdAt > this.MAX_WAIT_MS) {
        pending.reject(new Error("Coalesced request timed out"));
        this.pending.delete(key);
      }
    }
  }
}

export const requestCoalescer = new RequestCoalescer();
