import { Router } from 'express';
import { getDB, getNeo4j, sql } from '@regground/core';

type ReadinessSeverity = 'critical' | 'warning';
type ReadinessStatus = 'ready' | 'degraded' | 'not_ready';

interface ReadinessCheck {
  id: string;
  label: string;
  ok: boolean;
  severity: ReadinessSeverity;
  message: string;
}

interface ReadinessReport {
  status: ReadinessStatus;
  service: 'regground-api';
  production: boolean;
  mode: 'config' | 'deep';
  checks: ReadinessCheck[];
}

const WEAK_SECRETS = new Set(['change-me', 'change-me-in-production', 'change-me-in-local-dev-only']);

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStrongJwtSecret(value: string | undefined): boolean {
  return hasValue(value) && !WEAK_SECRETS.has(value!.trim()) && value!.trim().length >= 32;
}

function hasHttpsOriginList(value: string | undefined): boolean {
  if (!hasValue(value)) return false;
  return value!
    .split(',')
    .map((origin) => origin.trim())
    .map(normalizeOrigin)
    .filter(Boolean)
    .every((origin) => isHttpsUrl(origin) && !isLocalUrl(origin));
}

function parseUrl(value: string | undefined): URL | null {
  if (!hasValue(value)) return null;
  try {
    return new URL(value!);
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.startsWith('127.');
}

function isLocalUrl(value: string | undefined): boolean {
  const url = parseUrl(value);
  return !!url && isLocalHostname(url.hostname);
}

function isHttpsUrl(value: string | undefined): boolean {
  return parseUrl(value)?.protocol === 'https:';
}

function normalizeOrigin(value: string): string {
  const url = parseUrl(value);
  if (!url) return value;
  const hostname = url.hostname.replace(/\.$/, '');
  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${hostname}${port}`;
}

function isNeo4jTlsUri(value: string | undefined): boolean {
  if (!hasValue(value)) return false;
  return /^(neo4j|bolt)\+(s|ssc):\/\//.test(value!.trim());
}

function isLiveClerkSecret(value: string | undefined): boolean {
  return hasValue(value) && value!.trim().startsWith('sk_live_');
}

function isNonLocalServiceUrl(value: string | undefined): boolean {
  return !!parseUrl(value) && !isLocalUrl(value);
}

function statusFromChecks(checks: ReadinessCheck[]): ReadinessStatus {
  const hasCriticalFailure = checks.some((check) => !check.ok && check.severity === 'critical');
  const hasWarningFailure = checks.some((check) => !check.ok && check.severity === 'warning');
  return hasCriticalFailure ? 'not_ready' : hasWarningFailure ? 'degraded' : 'ready';
}

export function evaluateProductionReadiness(env: NodeJS.ProcessEnv = process.env): ReadinessReport {
  const production = env.NODE_ENV === 'production';
  const hasProviderKey = [env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY, env.GOOGLE_API_KEY].some(hasValue);

  const checks: ReadinessCheck[] = [
    {
      id: 'node-env',
      label: 'Production runtime',
      ok: production,
      severity: 'warning',
      message: production ? 'NODE_ENV is production.' : 'NODE_ENV is not production.',
    },
    {
      id: 'jwt-secret',
      label: 'JWT signing secret',
      ok: isStrongJwtSecret(env.JWT_SECRET),
      severity: 'critical',
      message: isStrongJwtSecret(env.JWT_SECRET)
        ? 'JWT_SECRET is present and meets production strength requirements.'
        : 'JWT_SECRET must be a non-default value at least 32 characters long.',
    },
    {
      id: 'auth-bypass',
      label: 'Development auth bypass',
      ok: production ? env.AUTH_BYPASS_DEV !== 'true' : true,
      severity: 'critical',
      message: production
        ? env.AUTH_BYPASS_DEV === 'true'
          ? 'AUTH_BYPASS_DEV must be false or unset in production.'
          : 'AUTH_BYPASS_DEV is not enabled.'
        : env.AUTH_BYPASS_DEV === 'true'
          ? 'AUTH_BYPASS_DEV is enabled for local no-Clerk development.'
          : 'AUTH_BYPASS_DEV is not enabled; local protected routes require bearer tokens.',
    },
    {
      id: 'cors',
      label: 'Allowed origins',
      ok: production ? hasHttpsOriginList(env.ALLOWED_ORIGINS) : hasValue(env.ALLOWED_ORIGINS),
      severity: 'critical',
      message: production
        ? 'ALLOWED_ORIGINS must contain only HTTPS production origins.'
        : 'ALLOWED_ORIGINS is configured for local/development use.',
    },
    {
      id: 'neo4j-tls',
      label: 'Neo4j TLS scheme',
      ok: production ? isNeo4jTlsUri(env.NEO4J_URI) : hasValue(env.NEO4J_URI),
      severity: 'critical',
      message: production
        ? 'NEO4J_URI must use a TLS scheme such as neo4j+s:// for production.'
        : 'NEO4J_URI is configured for local/development use.',
    },
    {
      id: 'database',
      label: 'Postgres database',
      ok: hasValue(env.DATABASE_URL),
      severity: 'critical',
      message: hasValue(env.DATABASE_URL)
        ? 'DATABASE_URL is configured. Run pnpm db:secure against this database before traffic.'
        : 'DATABASE_URL is required.',
    },
    {
      id: 'neo4j',
      label: 'Neo4j obligation graph',
      ok: hasValue(env.NEO4J_URI) && hasValue(env.NEO4J_USER) && hasValue(env.NEO4J_PASSWORD),
      severity: 'critical',
      message: hasValue(env.NEO4J_URI) && hasValue(env.NEO4J_USER) && hasValue(env.NEO4J_PASSWORD)
        ? 'Neo4j connection variables are configured. Seed with pnpm seed:graph before traffic.'
        : 'NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD are required.',
    },
    {
      id: 'clerk-api',
      label: 'Clerk API verification',
      ok: production ? isLiveClerkSecret(env.CLERK_SECRET_KEY) : true,
      severity: 'critical',
      message: production
        ? 'CLERK_SECRET_KEY must be a production sk_live_ key for bearer token verification.'
        : hasValue(env.CLERK_SECRET_KEY)
          ? 'CLERK_SECRET_KEY is configured for local/development bearer token verification.'
          : 'CLERK_SECRET_KEY is optional when local development uses custom JWTs or AUTH_BYPASS_DEV.',
    },
    {
      id: 'clerk-webhook',
      label: 'Clerk webhook verification',
      ok: production ? hasValue(env.CLERK_WEBHOOK_SIGNING_SECRET) : true,
      severity: 'critical',
      message: production
        ? hasValue(env.CLERK_WEBHOOK_SIGNING_SECRET)
          ? 'CLERK_WEBHOOK_SIGNING_SECRET is configured for tenant/user provisioning.'
          : 'CLERK_WEBHOOK_SIGNING_SECRET is required for tenant and membership provisioning.'
        : hasValue(env.CLERK_WEBHOOK_SIGNING_SECRET)
          ? 'CLERK_WEBHOOK_SIGNING_SECRET is configured for local tenant/user provisioning tests.'
          : 'CLERK_WEBHOOK_SIGNING_SECRET is optional outside production.',
    },
    {
      id: 'psur-service',
      label: 'Signed-in PSUR service',
      ok: production ? isNonLocalServiceUrl(env.PSUR_SERVICE_URL) : hasValue(env.PSUR_SERVICE_URL),
      severity: 'critical',
      message: production
        ? 'PSUR_SERVICE_URL must point to a non-local deployed service. Signed-out simulation still works without it.'
        : 'PSUR_SERVICE_URL is configured for local/development signed-in PSUR runs.',
    },
    {
      id: 'llm-provider',
      label: 'LLM provider key',
      ok: hasProviderKey,
      severity: 'critical',
      message: hasProviderKey
        ? 'At least one LLM provider key is configured.'
        : 'Configure OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY for live agent generation.',
    },
  ];

  return {
    status: statusFromChecks(checks),
    service: 'regground-api',
    production,
    mode: 'config',
    checks,
  };
}

type QueryResultLike = { rows?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
type DeepDb = { execute: (query: unknown) => Promise<QueryResultLike> };
type DeepNeo4jSession = {
  run: (query: string) => Promise<{ records?: Array<{ get: (key: string) => unknown }> }>;
  close: () => Promise<void>;
};
type DeepNeo4j = {
  verifyConnectivity: () => Promise<void>;
  session: (options?: { database?: string }) => DeepNeo4jSession;
};

export interface DeepReadinessDeps {
  db?: DeepDb;
  neo4j?: DeepNeo4j;
  fetchImpl?: typeof fetch;
}

function rowsOf(result: QueryResultLike): Array<Record<string, unknown>> {
  return Array.isArray(result) ? result : result.rows ?? [];
}

function firstNumeric(result: QueryResultLike, key: string): number {
  const value = rowsOf(result)[0]?.[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function neo4jNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value && 'toNumber' in value && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  return 0;
}

async function checkPostgres(env: NodeJS.ProcessEnv, deps: DeepReadinessDeps): Promise<ReadinessCheck[]> {
  if (!hasValue(env.DATABASE_URL)) {
    return [{
      id: 'postgres-live',
      label: 'Postgres live connectivity',
      ok: false,
      severity: 'critical',
      message: 'DATABASE_URL is not configured.',
    }];
  }

  try {
    const db = deps.db ?? getDB();
    await db.execute(sql`SELECT 1 AS ok`);

    const tenantKey = await db.execute(sql`
      SELECT 1 AS ok
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tenants'
        AND column_name = 'tenant_key'
      LIMIT 1
    `);

    const rls = await db.execute(sql`
      SELECT COUNT(*)::int AS enabled_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'workspaces',
          'process_instances',
          'trace_events',
          'workspace_files',
          'builder_agents',
          'process_workflows',
          'grounded_runs',
          'managed_agent_runs',
          'api_keys',
          'psur_runs',
          'usage_events'
        )
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    `);
    const rlsEnabledCount = firstNumeric(rls, 'enabled_count');

    return [
      {
        id: 'postgres-live',
        label: 'Postgres live connectivity',
        ok: true,
        severity: 'critical',
        message: 'Postgres accepted a live query.',
      },
      {
        id: 'postgres-tenant-key',
        label: 'Tenant key schema',
        ok: rowsOf(tenantKey).length > 0,
        severity: 'critical',
        message: rowsOf(tenantKey).length > 0
          ? 'tenants.tenant_key exists.'
          : 'tenants.tenant_key is missing. Run pnpm db:secure.',
      },
      {
        id: 'postgres-rls',
        label: 'Tenant row-level security',
        ok: rlsEnabledCount >= 11,
        severity: 'critical',
        message: rlsEnabledCount >= 11
          ? 'Tenant-owned tables have forced row-level security enabled.'
          : `Only ${rlsEnabledCount}/11 tenant-owned tables have forced row-level security. Run pnpm db:secure.`,
      },
    ];
  } catch (error) {
    return [{
      id: 'postgres-live',
      label: 'Postgres live connectivity',
      ok: false,
      severity: 'critical',
      message: error instanceof Error ? `Postgres check failed: ${error.message}` : 'Postgres check failed.',
    }];
  }
}

async function checkNeo4j(env: NodeJS.ProcessEnv, deps: DeepReadinessDeps): Promise<ReadinessCheck[]> {
  if (!hasValue(env.NEO4J_URI) || !hasValue(env.NEO4J_USER) || !hasValue(env.NEO4J_PASSWORD)) {
    return [{
      id: 'neo4j-live',
      label: 'Neo4j live connectivity',
      ok: false,
      severity: 'critical',
      message: 'NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD are required.',
    }];
  }

  const driver = deps.neo4j ?? getNeo4j();
  let session: DeepNeo4jSession | null = null;
  try {
    await driver.verifyConnectivity();
    session = driver.session({ database: env.NEO4J_DATABASE ?? 'neo4j' });
    const result = await session.run('MATCH (o:Obligation) RETURN count(o) AS count');
    const obligationCount = neo4jNumber(result.records?.[0]?.get('count'));

    return [
      {
        id: 'neo4j-live',
        label: 'Neo4j live connectivity',
        ok: true,
        severity: 'critical',
        message: 'Neo4j accepted a live connection.',
      },
      {
        id: 'neo4j-obligations',
        label: 'Obligation graph seed',
        ok: obligationCount > 0,
        severity: 'critical',
        message: obligationCount > 0
          ? `Neo4j contains ${obligationCount} obligation nodes.`
          : 'Neo4j has no obligation nodes. Run pnpm seed:graph.',
      },
    ];
  } catch (error) {
    return [{
      id: 'neo4j-live',
      label: 'Neo4j live connectivity',
      ok: false,
      severity: 'critical',
      message: error instanceof Error ? `Neo4j check failed: ${error.message}` : 'Neo4j check failed.',
    }];
  } finally {
    await session?.close();
  }
}

async function checkPsurService(env: NodeJS.ProcessEnv, deps: DeepReadinessDeps): Promise<ReadinessCheck[]> {
  const baseUrl = parseUrl(env.PSUR_SERVICE_URL);
  if (!baseUrl || isLocalUrl(env.PSUR_SERVICE_URL)) {
    return [{
      id: 'psur-service-live',
      label: 'Signed-in PSUR live connectivity',
      ok: false,
      severity: 'critical',
      message: 'PSUR_SERVICE_URL must point to a deployed service before signed-in PSUR runs are enabled.',
    }];
  }

  const healthUrls = [new URL('/health', baseUrl), new URL('/healthz', baseUrl)];
  try {
    const doFetch = deps.fetchImpl ?? fetch;
    const failures: string[] = [];
    for (const healthUrl of healthUrls) {
      const response = await doFetch(healthUrl, { headers: { Accept: 'application/json' } });
      if (response.ok) {
        return [{
          id: 'psur-service-live',
          label: 'Signed-in PSUR live connectivity',
          ok: true,
          severity: 'critical',
          message: `PSUR service responded to ${healthUrl.pathname}.`,
        }];
      }
      failures.push(`${healthUrl.pathname} returned HTTP ${response.status}`);
    }

    return [{
      id: 'psur-service-live',
      label: 'Signed-in PSUR live connectivity',
      ok: false,
      severity: 'critical',
      message: `PSUR service health checks failed: ${failures.join('; ')}.`,
    }];
  } catch (error) {
    return [{
      id: 'psur-service-live',
      label: 'Signed-in PSUR live connectivity',
      ok: false,
      severity: 'critical',
      message: error instanceof Error ? `PSUR service health check failed: ${error.message}` : 'PSUR service health check failed.',
    }];
  }
}

export async function evaluateDeepProductionReadiness(
  env: NodeJS.ProcessEnv = process.env,
  deps: DeepReadinessDeps = {},
): Promise<ReadinessReport> {
  const base = evaluateProductionReadiness(env);
  const checks = [
    ...base.checks,
    ...(await checkPostgres(env, deps)),
    ...(await checkNeo4j(env, deps)),
    ...(await checkPsurService(env, deps)),
  ];

  return {
    ...base,
    mode: 'deep',
    status: statusFromChecks(checks),
    checks,
  };
}

const router: Router = Router();

router.get('/', async (req, res) => {
  const deep = req.query.deep === '1' || req.query.deep === 'true';
  const report = deep
    ? await evaluateDeepProductionReadiness()
    : evaluateProductionReadiness();
  res.status(report.status === 'not_ready' ? 503 : 200).json(report);
});

export default router;
