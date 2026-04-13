import type { Request, Response, NextFunction } from 'express';

export function tracing(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    // eslint-disable-next-line no-console
    console.log(
      `[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`,
    );
  });
  next();
}
