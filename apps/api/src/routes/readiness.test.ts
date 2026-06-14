import { describe, expect, it, vi } from 'vitest';
import {
  evaluateDeepProductionReadiness,
  evaluateProductionReadiness,
  type DeepReadinessDeps,
} from './readiness.js';

const productionEnv = {
  NODE_ENV: 'production',
  JWT_SECRET: 'prod-secret-that-is-long-enough-for-production',
  AUTH_BYPASS_DEV: 'false',
  ALLOWED_ORIGINS: 'https://app.example.com,https://admin.example.com',
  DATABASE_URL: 'postgres://example',
  NEO4J_URI: 'neo4j+s://example.databases.neo4j.io',
  NEO4J_USER: 'neo4j',
  NEO4J_PASSWORD: 'secret',
  CLERK_SECRET_KEY: 'sk_live_example',
  CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_example',
  PSUR_SERVICE_URL: 'https://psur.example.com',
  OPENAI_API_KEY: 'sk-example',
} satisfies NodeJS.ProcessEnv;

describe('evaluateProductionReadiness', () => {
  it('returns ready when production-critical services are configured', () => {
    const report = evaluateProductionReadiness(productionEnv);

    expect(report.status).toBe('ready');
    expect(report.production).toBe(true);
    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it('returns not_ready for missing production-critical services', () => {
    const report = evaluateProductionReadiness({
      ...productionEnv,
      CLERK_SECRET_KEY: '',
      PSUR_SERVICE_URL: '',
      OPENAI_API_KEY: '',
    });

    expect(report.status).toBe('not_ready');
    expect(report.checks.filter((check) => !check.ok).map((check) => check.id)).toEqual([
      'clerk-api',
      'psur-service',
      'llm-provider',
    ]);
  });

  it('rejects weak secrets, insecure production origins, and auth bypass', () => {
    const report = evaluateProductionReadiness({
      ...productionEnv,
      JWT_SECRET: 'change-me',
      AUTH_BYPASS_DEV: 'true',
      ALLOWED_ORIGINS: 'http://app.example.com',
    });

    expect(report.status).toBe('not_ready');
    expect(report.checks.filter((check) => !check.ok).map((check) => check.id)).toEqual([
      'jwt-secret',
      'auth-bypass',
      'cors',
    ]);
  });

  it('rejects local or development-shaped production service configuration', () => {
    const report = evaluateProductionReadiness({
      ...productionEnv,
      ALLOWED_ORIGINS: 'https://localhost:5173',
      NEO4J_URI: 'neo4j://localhost:7687',
      CLERK_SECRET_KEY: 'sk_test_example',
      PSUR_SERVICE_URL: 'http://localhost:8000',
    });

    expect(report.status).toBe('not_ready');
    expect(report.checks.filter((check) => !check.ok).map((check) => check.id)).toEqual([
      'cors',
      'neo4j-tls',
      'clerk-api',
      'psur-service',
    ]);
  });

  it('reports development mode as degraded when critical configuration is present', () => {
    const report = evaluateProductionReadiness({
      ...productionEnv,
      NODE_ENV: 'development',
      ALLOWED_ORIGINS: 'http://localhost:5173',
    });

    expect(report.status).toBe('degraded');
    expect(report.production).toBe(false);
    expect(report.checks.find((check) => check.id === 'node-env')?.ok).toBe(false);
  });

  it('adds live Postgres/RLS and Neo4j checks in deep mode', async () => {
    const session = {
      run: vi.fn().mockResolvedValue({
        records: [{ get: () => ({ toNumber: () => 303 }) }],
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const deps: DeepReadinessDeps = {
      db: {
        execute: vi.fn()
          .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
          .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
          .mockResolvedValueOnce({ rows: [{ enabled_count: 11 }] }),
      },
      neo4j: {
        verifyConnectivity: vi.fn().mockResolvedValue(undefined),
        session: vi.fn(() => session),
      },
      fetchImpl: vi.fn().mockResolvedValue(Response.json({ status: 'healthy' })),
    };

    const report = await evaluateDeepProductionReadiness(productionEnv, deps);

    expect(report.mode).toBe('deep');
    expect(report.status).toBe('ready');
    expect(report.checks.find((check) => check.id === 'postgres-live')?.ok).toBe(true);
    expect(report.checks.find((check) => check.id === 'postgres-tenant-key')?.ok).toBe(true);
    expect(report.checks.find((check) => check.id === 'postgres-rls')?.ok).toBe(true);
    expect(report.checks.find((check) => check.id === 'neo4j-live')?.ok).toBe(true);
    expect(report.checks.find((check) => check.id === 'neo4j-obligations')?.ok).toBe(true);
    expect(report.checks.find((check) => check.id === 'psur-service-live')?.ok).toBe(true);
    expect(deps.fetchImpl).toHaveBeenCalledWith(new URL('https://psur.example.com/health'), {
      headers: { Accept: 'application/json' },
    });
    expect(session.close).toHaveBeenCalledOnce();
  });

  it('accepts PSUR services that expose /healthz instead of /health', async () => {
    const deps: DeepReadinessDeps = {
      db: {
        execute: vi.fn()
          .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
          .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
          .mockResolvedValueOnce({ rows: [{ enabled_count: 11 }] }),
      },
      neo4j: {
        verifyConnectivity: vi.fn().mockResolvedValue(undefined),
        session: vi.fn(() => ({
          run: vi.fn().mockResolvedValue({
            records: [{ get: () => ({ toNumber: () => 303 }) }],
          }),
          close: vi.fn().mockResolvedValue(undefined),
        })),
      },
      fetchImpl: vi.fn()
        .mockResolvedValueOnce(Response.json({ detail: 'not found' }, { status: 404 }))
        .mockResolvedValueOnce(Response.json({ status: 'ok' })),
    };

    const report = await evaluateDeepProductionReadiness(productionEnv, deps);

    expect(report.status).toBe('ready');
    expect(report.checks.find((check) => check.id === 'psur-service-live')?.message).toContain('/healthz');
    expect(deps.fetchImpl).toHaveBeenNthCalledWith(1, new URL('https://psur.example.com/health'), {
      headers: { Accept: 'application/json' },
    });
    expect(deps.fetchImpl).toHaveBeenNthCalledWith(2, new URL('https://psur.example.com/healthz'), {
      headers: { Accept: 'application/json' },
    });
  });

  it('reports deep mode failures when tenant schema, RLS, or graph seed are missing', async () => {
    const deps: DeepReadinessDeps = {
      db: {
        execute: vi.fn()
          .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ enabled_count: 5 }] }),
      },
      neo4j: {
        verifyConnectivity: vi.fn().mockResolvedValue(undefined),
        session: vi.fn(() => ({
          run: vi.fn().mockResolvedValue({
            records: [{ get: () => ({ toNumber: () => 0 }) }],
          }),
          close: vi.fn().mockResolvedValue(undefined),
        })),
      },
      fetchImpl: vi.fn().mockResolvedValue(Response.json({ detail: 'down' }, { status: 503 })),
    };

    const report = await evaluateDeepProductionReadiness(productionEnv, deps);

    expect(report.status).toBe('not_ready');
    expect(report.checks.filter((check) => !check.ok).map((check) => check.id)).toEqual([
      'postgres-tenant-key',
      'postgres-rls',
      'neo4j-obligations',
      'psur-service-live',
    ]);
  });
});
