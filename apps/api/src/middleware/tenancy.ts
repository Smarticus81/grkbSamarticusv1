import type { Response, NextFunction } from 'express';
import type { AuthedRequest } from './auth.js';

export function tenancy(req: AuthedRequest, res: Response, next: NextFunction) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'no tenant context' });
  // Attach tenant to request scope for downstream handlers.
  (req as any).tenantId = tenantId;
  next();
}
