import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Assigns a unique request ID to every incoming request.
 *
 * - If the client sends an `X-Request-Id` header the value is reused (useful
 *   for distributed tracing), otherwise a new UUID v4 is generated.
 * - The ID is attached to `req.requestId` (globally augmented) and echoed
 *   back via the `X-Request-Id` response header.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
