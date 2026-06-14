import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Predicate = (row: Record<string, unknown>) => boolean;
type Field = { __table: string; __key: string };
type Table = { __name: string } & Record<string, Field | string>;

const fixtures = vi.hoisted(() => {
  function makeTable(name: string, keys: string[]): Table {
    const table: Record<string, Field | string> = { __name: name };
    for (const key of keys) table[key] = { __table: name, __key: key };
    return table as Table;
  }

  const schema = {
    tenants: makeTable('tenants', [
      'id',
      'tenantKey',
      'clerkOrgId',
      'name',
      'plan',
      'createdAt',
      'deletedAt',
    ]),
    users: makeTable('users', ['id', 'clerkUserId', 'email']),
    tenantMemberships: makeTable('tenantMemberships', ['tenantId', 'userId', 'role', 'createdAt']),
    tenantQuotas: makeTable('tenantQuotas', [
      'tenantId',
      'monthlyRequestLimit',
      'monthlyTokenLimit',
      'currentMonthRequests',
      'currentMonthTokens',
      'periodStart',
      'updatedAt',
    ]),
  };

  class FakeQuery {
    private table: Table | null = null;
    private predicate: Predicate | null = null;
    private maxRows: number | null = null;
    private ordering: { field: Field; direction: 'desc' } | null = null;

    constructor(
      private readonly data: Record<string, Record<string, unknown>[]>,
      private readonly projection?: Record<string, Field>,
    ) {}

    from(table: Table) {
      this.table = table;
      return this;
    }

    where(predicate: Predicate) {
      this.predicate = predicate;
      return this;
    }

    orderBy(ordering?: { field: Field; direction: 'desc' }) {
      this.ordering = ordering ?? null;
      return this;
    }

    limit(n: number) {
      this.maxRows = n;
      return this;
    }

    private resolve(): Record<string, unknown>[] {
      if (!this.table) throw new Error('from(table) was not called');
      let rows = [...(this.data[this.table.__name] ?? [])];
      if (this.predicate) rows = rows.filter(this.predicate);
      if (this.ordering) {
        const key = this.ordering.field.__key;
        rows.sort((a, b) => String(b[key] ?? '').localeCompare(String(a[key] ?? '')));
      }
      if (this.maxRows !== null) rows = rows.slice(0, this.maxRows);
      if (!this.projection) return rows.map((row) => ({ ...row }));
      return rows.map((row) => Object.fromEntries(
        Object.entries(this.projection!).map(([alias, field]) => [alias, row[field.__key]]),
      ));
    }

    then<TResult1 = Record<string, unknown>[], TResult2 = never>(
      onfulfilled?: ((value: Record<string, unknown>[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
    }
  }

  class FakeDb {
    data: Record<string, Record<string, unknown>[]> = {
      tenants: [],
      users: [],
      tenantMemberships: [],
      tenantQuotas: [],
    };

    select(projection?: Record<string, Field>) {
      return new FakeQuery(this.data, projection);
    }
  }

  const fakeDb = new FakeDb();
  const tenantScopes: string[] = [];

  return { schema, fakeDb, tenantScopes };
});

vi.mock('@regground/core', () => ({
  schema: fixtures.schema,
  getDB: () => fixtures.fakeDb,
  withTenant: async (
    db: typeof fixtures.fakeDb,
    tenantId: string,
    fn: (tx: typeof fixtures.fakeDb) => Promise<unknown>,
  ) => {
    fixtures.tenantScopes.push(tenantId);
    return fn(db);
  },
  eq: (field: Field, value: unknown) => (row: Record<string, unknown>) => row[field.__key] === value,
  and: (...predicates: Predicate[]) => (row: Record<string, unknown>) => predicates.every((predicate) => predicate(row)),
  desc: (field: Field) => ({ field, direction: 'desc' as const }),
}));

const { default: workspace } = await import('./workspace.js');

function resetFixtures() {
  fixtures.fakeDb.data = {
    tenants: [],
    users: [],
    tenantMemberships: [],
    tenantQuotas: [],
  };
  fixtures.tenantScopes.length = 0;
}

async function withServer<T>(
  auth: { tenantId?: string; sub?: string; roles?: string[] },
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const app = express();
  app.use((req, _res, next) => {
    req.tenantId = auth.tenantId;
    req.user = auth.sub
      ? { sub: auth.sub, tenantId: auth.tenantId ?? '', roles: auth.roles ?? [] }
      : undefined;
    next();
  });
  app.use('/api/workspace', workspace);

  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    });
  }
}

beforeEach(() => {
  resetFixtures();
});

describe('workspace route', () => {
  it('returns canonical organization workspace context for the signed-in user', async () => {
    fixtures.fakeDb.data.tenants!.push({
      id: 'tenant-uuid',
      tenantKey: 'org_acme',
      clerkOrgId: 'org_acme',
      name: 'Acme Devices',
      plan: 'professional',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
    });
    fixtures.fakeDb.data.users!.push(
      { id: 'user-owner', clerkUserId: 'user_owner', email: 'owner@example.com' },
      { id: 'user-current', clerkUserId: 'user_current', email: 'current@example.com' },
    );
    fixtures.fakeDb.data.tenantMemberships!.push(
      { tenantId: 'tenant-uuid', userId: 'user-owner', role: 'owner', createdAt: new Date('2026-01-01T00:00:00.000Z') },
      { tenantId: 'tenant-uuid', userId: 'user-current', role: 'viewer', createdAt: new Date('2026-01-02T00:00:00.000Z') },
    );
    fixtures.fakeDb.data.tenantQuotas!.push({
      tenantId: 'tenant-uuid',
      monthlyRequestLimit: 50000,
      monthlyTokenLimit: 5000000,
      currentMonthRequests: 123,
      currentMonthTokens: 4567,
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-12T00:00:00.000Z'),
    });

    await withServer({ tenantId: 'org_acme', sub: 'user_current', roles: ['viewer'] }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/workspace/me`);
      const body = await response.json() as Record<string, any>;

      expect(response.status).toBe(200);
      expect(body.tenant).toMatchObject({
        key: 'org_acme',
        id: 'tenant-uuid',
        name: 'Acme Devices',
        kind: 'organization',
        plan: 'professional',
        clerkOrgId: 'org_acme',
        active: true,
      });
      expect(body.user).toMatchObject({
        id: 'user-current',
        subject: 'user_current',
        email: 'current@example.com',
        roles: ['viewer'],
      });
      expect(body.membership.role).toBe('viewer');
      expect(body.quota).toMatchObject({
        monthlyRequestLimit: 50000,
        monthlyTokenLimit: 5000000,
        currentMonthRequests: 123,
        currentMonthTokens: 4567,
      });
    });

    expect(fixtures.tenantScopes).toEqual(['org_acme', 'org_acme', 'org_acme', 'org_acme']);
  });

  it('returns a personal workspace fallback before webhook rows exist', async () => {
    await withServer({ tenantId: 'user_solo', sub: 'user_solo', roles: [] }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/workspace/me`);
      const body = await response.json() as Record<string, any>;

      expect(response.status).toBe(200);
      expect(body.tenant).toMatchObject({
        key: 'user_solo',
        id: null,
        name: 'Personal workspace',
        kind: 'personal',
        plan: 'free',
        clerkOrgId: null,
        active: true,
      });
      expect(body.user).toMatchObject({
        id: null,
        subject: 'user_solo',
        email: null,
        roles: [],
      });
      expect(body.membership.role).toBe('owner');
      expect(body.quota).toBeNull();
    });
  });
});
