import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AuthedRequest extends Request {
  user?: { sub: string; tenantId: string; roles: string[] };
}

// ---------------------------------------------------------------------------
// JWT claim shape
// ---------------------------------------------------------------------------

interface JwtClaims {
  sub: string;
  tenantId: string;
  roles?: string[];
  iss?: string;
  aud?: string | string[];
}

// ---------------------------------------------------------------------------
// Weak-secret blocklist
// ---------------------------------------------------------------------------

const WEAK_SECRETS = new Set(['change-me', 'change-me-in-production']);

// ---------------------------------------------------------------------------
// Boot-time validation (call once from index.ts before listen)
// ---------------------------------------------------------------------------

/**
 * Validates that `JWT_SECRET` meets production requirements.
 * Throws synchronously so the process never starts in an insecure state.
 */
export function validateJwtSecret(): void {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!secret) {
      throw new Error(
        '[auth] FATAL: JWT_SECRET is not set. The API refuses to start in production without a secret.',
      );
    }
    if (WEAK_SECRETS.has(secret)) {
      throw new Error(
        `[auth] FATAL: JWT_SECRET is set to a well-known insecure value ("${secret}"). Use a strong random secret.`,
      );
    }
    if (secret.length < 32) {
      throw new Error(
        `[auth] FATAL: JWT_SECRET is too short (${secret.length} chars). Minimum 32 characters required in production.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Token verification helpers
// ---------------------------------------------------------------------------

const VERIFY_OPTIONS: jwt.VerifyOptions = {
  issuer: 'regground',
  audience: 'regground-api',
};

/**
 * Try to verify a token against `secret`. Returns the decoded claims on
 * success or `null` on any failure.
 */
function tryVerify(token: string, secret: string): JwtClaims | null {
  try {
    return jwt.verify(token, secret, VERIFY_OPTIONS) as JwtClaims;
  } catch {
    return null;
  }
}

/**
 * Verify a token with key-rotation support.
 *
 * 1. Try `JWT_SECRET` (current key).
 * 2. If that fails and `JWT_SECRET_PREVIOUS` is set, try the previous key
 *    to allow a grace period during rotation.
 * 3. If both fail, throw so the caller can return 401.
 */
function verifyToken(token: string): JwtClaims {
  const currentSecret = process.env.JWT_SECRET;
  if (!currentSecret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const decoded = tryVerify(token, currentSecret);
  if (decoded) return decoded;

  // Key rotation: fall back to previous secret during grace period.
  const previousSecret = process.env.JWT_SECRET_PREVIOUS;
  if (previousSecret) {
    const fallback = tryVerify(token, previousSecret);
    if (fallback) return fallback;
  }

  // Neither key worked — verify once more with the current key so we get the
  // original error message to surface to the caller.
  return jwt.verify(token, currentSecret, VERIFY_OPTIONS) as JwtClaims;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization');

  // ------------------------------------------------------------------
  // No Bearer token → check dev bypass
  // ------------------------------------------------------------------
  if (!header?.startsWith('Bearer ')) {
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.AUTH_BYPASS_DEV === 'true'
    ) {
      console.warn(
        `[auth] WARN: dev bypass active — request ${req.method} ${req.originalUrl} authed as dev/admin`,
      );
      req.user = { sub: 'dev', tenantId: 'dev', roles: ['admin'] };
      return next();
    }
    return res.status(401).json({ error: 'missing bearer token' });
  }

  // ------------------------------------------------------------------
  // Verify JWT (with key rotation support)
  // ------------------------------------------------------------------
  const token = header.slice(7);
  try {
    const decoded = verifyToken(token);
    req.user = {
      sub: decoded.sub,
      tenantId: decoded.tenantId,
      roles: decoded.roles ?? [],
    };
    next();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return res.status(401).json({ error: 'invalid token', detail: message });
  }
}
