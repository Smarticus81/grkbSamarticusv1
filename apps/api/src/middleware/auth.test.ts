import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyToken as clerkVerifyToken } from '@clerk/backend';
import { auth, isPlatformAdmin, requirePlatformAdmin, type AuthedRequest } from './auth.js';

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

const mockedClerkVerifyToken = vi.mocked(clerkVerifyToken);

const ORIGINAL_ENV = { ...process.env };
const JWT_SECRET = 'test-secret-long-enough-for-auth-middleware-tests';

interface AuthResult {
  status?: number;
  body?: unknown;
  user?: AuthedRequest['user'];
  nextCalled: boolean;
}

function runAuth(authorization?: string): Promise<AuthResult> {
  return new Promise((resolve) => {
    const req = {
      method: 'GET',
      originalUrl: '/api/test',
      header(name: string) {
        return name.toLowerCase() === 'authorization' ? authorization : undefined;
      },
    } as AuthedRequest;

    let status: number | undefined;
    let body: unknown;

    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        resolve({ status, body, user: req.user, nextCalled: false });
        return this;
      },
    } as Response;

    const next: NextFunction = () => {
      resolve({ status, body, user: req.user, nextCalled: true });
    };

    auth(req, res, next);
  });
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  mockedClerkVerifyToken.mockReset();
});

describe('auth middleware workspace identity', () => {
  it('maps Clerk organization sessions to organization tenant workspaces', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_clerk';
    mockedClerkVerifyToken.mockResolvedValue({
      sub: 'user_1',
      org_id: 'org_1',
      org_role: 'org:admin',
    } as never);

    const result = await runAuth('Bearer clerk-token');

    expect(mockedClerkVerifyToken).toHaveBeenCalledWith('clerk-token', { secretKey: 'sk_test_clerk' });
    expect(result).toEqual({
      nextCalled: true,
      status: undefined,
      body: undefined,
      user: { sub: 'user_1', tenantId: 'org_1', roles: ['admin'] },
    });
  });

  it('keeps Clerk users without an active organization in a personal workspace', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_clerk';
    mockedClerkVerifyToken.mockResolvedValue({
      sub: 'user_personal',
    } as never);

    const result = await runAuth('Bearer personal-token');

    expect(result.nextCalled).toBe(true);
    expect(result.user).toEqual({ sub: 'user_personal', tenantId: 'user_personal', roles: [] });
  });

  it('falls back to first-party JWTs when the token is not a Clerk token', async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.CLERK_SECRET_KEY = 'sk_test_clerk';
    mockedClerkVerifyToken.mockRejectedValue(new Error('not clerk'));

    const token = jwt.sign(
      { sub: 'user_custom', tenantId: 'tenant_custom', roles: ['member'] },
      JWT_SECRET,
      { issuer: 'regground', audience: 'regground-api' },
    );

    const result = await runAuth(`Bearer ${token}`);

    expect(result.nextCalled).toBe(true);
    expect(result.user).toEqual({ sub: 'user_custom', tenantId: 'tenant_custom', roles: ['member'] });
  });

  it('allows the development bypass only when explicitly enabled', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH_BYPASS_DEV = 'true';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await runAuth();

    expect(result.nextCalled).toBe(true);
    expect(result.user).toEqual({ sub: 'dev', tenantId: 'dev', roles: ['admin'] });
    warn.mockRestore();
  });

  it('rejects missing bearer tokens outside the explicit development bypass', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_BYPASS_DEV = 'false';

    const result = await runAuth();

    expect(result.nextCalled).toBe(false);
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'missing bearer token' });
  });
});

describe('platform admin authorization', () => {
  it('does not treat tenant admins as platform admins', () => {
    expect(isPlatformAdmin({ sub: 'user_1', tenantId: 'org_1', roles: ['admin'] }, {})).toBe(false);
    expect(isPlatformAdmin({ sub: 'user_1', tenantId: 'org_1', roles: ['member'] }, {})).toBe(false);
  });

  it('allows explicit platform roles and configured user ids', () => {
    expect(isPlatformAdmin({ sub: 'user_1', tenantId: 'org_1', roles: ['platform_admin'] }, {})).toBe(true);
    expect(isPlatformAdmin({ sub: 'user_2', tenantId: 'org_1', roles: ['regground_admin'] }, {})).toBe(true);
    expect(
      isPlatformAdmin(
        { sub: 'user_3', tenantId: 'org_1', roles: ['admin'] },
        { PLATFORM_ADMIN_USER_IDS: 'user_3,user_4' },
      ),
    ).toBe(true);
  });

  it('blocks protected handlers for non-platform users', () => {
    const req = {
      user: { sub: 'tenant-admin', tenantId: 'org_1', roles: ['admin'] },
    } as AuthedRequest;
    let status: number | undefined;
    let body: unknown;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as Response;
    const next = vi.fn();

    requirePlatformAdmin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toBe(403);
    expect(body).toEqual({ error: 'platform admin role required' });
  });
});
