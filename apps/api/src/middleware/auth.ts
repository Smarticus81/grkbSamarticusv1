import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthedRequest extends Request {
  user?: { sub: string; tenantId: string; roles: string[] };
}

export function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    if (process.env.NODE_ENV === 'development') {
      req.user = { sub: 'dev', tenantId: 'dev', roles: ['admin'] };
      return next();
    }
    return res.status(401).json({ error: 'missing bearer token' });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET ?? 'change-me') as any;
    req.user = { sub: decoded.sub, tenantId: decoded.tenantId, roles: decoded.roles ?? [] };
    next();
  } catch (e: any) {
    return res.status(401).json({ error: 'invalid token', detail: e.message });
  }
}
