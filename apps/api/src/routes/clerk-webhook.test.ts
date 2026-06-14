import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleOrganizationMembershipCreated, handleUserCreated } from './clerk-webhook.js';

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
    tenants: makeTable('tenants', ['id', 'tenantKey', 'clerkOrgId', 'name', 'plan', 'deletedAt']),
    users: makeTable('users', ['id', 'clerkUserId', 'email']),
    tenantMemberships: makeTable('tenantMemberships', ['tenantId', 'userId', 'role']),
  };

  class FakeQuery {
    private table: Table | null = null;
    private predicate: Predicate | null = null;
    private maxRows: number | null = null;

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
    limit(n: number) {
      this.maxRows = n;
      return this;
    }
    private resolve(): Record<string, unknown>[] {
      if (!this.table) throw new Error('from(table) was not called');
      let rows = [...(this.data[this.table.__name] ?? [])];
      if (this.predicate) rows = rows.filter(this.predicate);
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

  class FakeInsert {
    private pendingValues: Record<string, unknown> = {};
    private conflictTarget: Field | Field[] | null = null;
    private conflictSet: Record<string, unknown> | null = null;

    constructor(private readonly table: Table, private readonly data: Record<string, Record<string, unknown>[]>) {}

    values(value: Record<string, unknown>) {
      this.pendingValues = value;
      return this;
    }
    onConflictDoUpdate(config: { target: Field | Field[]; set: Record<string, unknown> }) {
      this.conflictTarget = config.target;
      this.conflictSet = config.set;
      return this;
    }
    private resolve(): Record<string, unknown>[] {
      const rows = this.data[this.table.__name] ??= [];
      const targets = Array.isArray(this.conflictTarget) ? this.conflictTarget : this.conflictTarget ? [this.conflictTarget] : [];
      const existing = targets.length > 0
        ? rows.find((row) => targets.every((field) => row[field.__key] === this.pendingValues[field.__key]))
        : undefined;
      if (existing && this.conflictSet) {
        Object.assign(existing, this.conflictSet);
        return [{ ...existing }];
      }
      const row = {
        id: `${this.table.__name}-${rows.length + 1}`,
        ...this.pendingValues,
      };
      rows.push(row);
      return [{ ...row }];
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
    };
    select(projection?: Record<string, Field>) {
      return new FakeQuery(this.data, projection);
    }
    insert(table: Table) {
      return new FakeInsert(table, this.data);
    }
  }

  return { fakeDb: new FakeDb(), schema };
});

vi.mock('@regground/core', () => ({
  schema: fixtures.schema,
  getDB: () => fixtures.fakeDb,
  eq: (field: Field, value: unknown): Predicate => (row) => row[field.__key] === value,
  and: (...predicates: Predicate[]): Predicate => (row) => predicates.every((predicate) => predicate(row)),
}));

beforeEach(() => {
  fixtures.fakeDb.data = {
    tenants: [],
    users: [],
    tenantMemberships: [],
  };
});

describe('Clerk webhook workspace membership provisioning', () => {
  it('upserts the organization, user, and membership from an out-of-order membership event', async () => {
    await handleOrganizationMembershipCreated({
      role: 'org:admin',
      organization: {
        id: 'org_123',
        name: 'Meridian Medical',
        public_metadata: { plan: 'professional' },
      },
      public_user_data: {
        user_id: 'user_123',
        identifier: 'quality@example.com',
      },
    });

    expect(fixtures.fakeDb.data.tenants).toHaveLength(2);
    expect(fixtures.fakeDb.data.tenants).toEqual(expect.arrayContaining([
      {
        id: 'tenants-1',
        tenantKey: 'org_123',
        clerkOrgId: 'org_123',
        name: 'Meridian Medical',
        plan: 'professional',
        deletedAt: null,
      },
      {
        id: 'tenants-2',
        tenantKey: 'user_123',
        clerkOrgId: null,
        name: 'Personal workspace (quality@example.com)',
        plan: 'free',
        deletedAt: null,
      },
    ]));
    expect(fixtures.fakeDb.data.users).toMatchObject([
      {
        id: 'users-1',
        clerkUserId: 'user_123',
        email: 'quality@example.com',
      },
    ]);
    expect(fixtures.fakeDb.data.tenantMemberships).toEqual([
      {
        id: 'tenantMemberships-1',
        tenantId: 'tenants-1',
        userId: 'users-1',
        role: 'admin',
      },
    ]);
  });

  it('updates an existing membership role idempotently', async () => {
    await handleOrganizationMembershipCreated({
      role: 'org:viewer',
      organization: { id: 'org_123', name: 'Meridian Medical' },
      public_user_data: { user_id: 'user_123', identifier: 'quality@example.com' },
    });
    await handleOrganizationMembershipCreated({
      role: 'org:owner',
      organization: { id: 'org_123', name: 'Meridian Medical' },
      public_user_data: { user_id: 'user_123', identifier: 'quality@example.com' },
    });

    expect(fixtures.fakeDb.data.tenantMemberships).toHaveLength(1);
    expect(fixtures.fakeDb.data.tenantMemberships?.[0]).toMatchObject({ role: 'owner' });
  });

  it('provisions a personal tenant keyed by the Clerk user id on user events', async () => {
    await handleUserCreated({
      id: 'user_personal',
      primary_email_address_id: 'email_1',
      email_addresses: [
        { id: 'email_1', email_address: 'solo@example.com' },
      ],
    });

    expect(fixtures.fakeDb.data.users).toMatchObject([
      {
        id: 'users-1',
        clerkUserId: 'user_personal',
        email: 'solo@example.com',
      },
    ]);
    expect(fixtures.fakeDb.data.tenants).toMatchObject([
      {
        id: 'tenants-1',
        tenantKey: 'user_personal',
        clerkOrgId: null,
        name: 'Personal workspace (solo@example.com)',
        plan: 'free',
        deletedAt: null,
      },
    ]);
  });
});
