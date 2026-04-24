/**
 * Global augmentation for Express.Request.
 *
 * This ensures `req.user` and `req.tenantId` are available on every request
 * without casting through `(req as any)`.  The `AuthedRequest` interface in
 * `middleware/auth.ts` still exists for explicit typing in route handlers that
 * want a narrower contract, but this augmentation removes the need for unsafe
 * casts everywhere else.
 */

declare namespace Express {
  interface Request {
    user?: {
      sub: string;
      tenantId: string;
      roles: string[];
    };
    tenantId?: string;
    /** UUIDv4 request identifier, set by the X-Request-Id middleware. */
    requestId?: string;
  }
}
