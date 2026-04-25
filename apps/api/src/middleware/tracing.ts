import type { Request, Response, NextFunction } from 'express';
import { requestDuration } from '@regground/core';

export function tracing(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path ?? req.baseUrl ?? req.path ?? 'unknown';
    try {
      requestDuration.record(duration, {
        method: req.method,
        route,
        status: String(res.statusCode),
      });
    } catch {
      // metrics may be uninitialized in dev — never break a request because of it.
    }
    // eslint-disable-next-line no-console
    console.log(
      `[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
    );
  });
  next();
}
