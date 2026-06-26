import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";
import { securityMetrics } from "../metrics/prometheus";

const SCHEMAS = new Map<string, ZodSchema>();

export function registerSchema(name: string, schema: ZodSchema): void {
  SCHEMAS.set(name, schema);
}

/**
 * Validates request body against a registered Zod schema
 */
export function validateBody(schemaName: string): (req: Request, res: Response, next: NextFunction) => void {
  const schema = SCHEMAS.get(schemaName);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!schema) {
      next();
      return;
    }

    try {
      const result = schema.parse(req.body);
      req.body = result; // Replace with parsed (and transformed) data
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        securityMetrics.validationErrors.inc({ schema: schemaName });
        res.status(400).json({
          error: "Validation Error",
          details: err.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
            code: e.code,
          })),
        });
        return;
      }
      next(err);
    }
  };
}

/**
 * Validates request query parameters
 */
export function validateQuery(schema: ZodSchema): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        securityMetrics.validationErrors.inc({ schema: "query" });
        res.status(400).json({
          error: "Validation Error",
          details: err.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
            code: e.code,
          })),
        });
        return;
      }
      next(err);
    }
  };
}

const HEADER_BLACKLIST = /[<>"'%;()&+]|script|alert|prompt/i;

/**
 * Sanitize inputs at the edge — strip XSS, SQL injection patterns
 */
export function inputSanitizer(req: Request, res: Response, next: NextFunction): void {
  // Check headers for injection patterns
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string" && HEADER_BLACKLIST.test(value)) {
      securityMetrics.validationErrors.inc({ schema: "headers" });
      res.status(400).json({ error: "Bad Request", message: `Malformed header: ${key}` });
      return;
    }
  }

  // Check URL params
  if (req.url && HEADER_BLACKLIST.test(req.url)) {
    securityMetrics.validationErrors.inc({ schema: "url" });
    res.status(400).json({ error: "Bad Request", message: "Malformed URL" });
    return;
  }

  next();
}
