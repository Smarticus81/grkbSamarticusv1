import { Router } from 'express';
import {
  getDB,
  schema,
  eq,
  and,
  desc,
  withTenant,
  type TenantTransaction,
} from '@regground/core';

const { tenants, users, tenantMemberships, tenantQuotas } = schema;

const router: Router = Router();

type WorkspaceKind = 'organization' | 'personal' | 'custom';

function requireTenantId(req: Express.Request): string {
  const tenantId = req.tenantId;
  if (!tenantId) throw new Error('Missing tenantId on request');
  return tenantId;
}

function requireUser(req: Express.Request): { sub: string; roles: string[] } {
  const user = req.user;
  if (!user?.sub) throw new Error('Missing user on request');
  return user;
}

function tenantDb<T>(tenantId: string, fn: (db: TenantTransaction) => Promise<T>): Promise<T> {
  return withTenant(getDB(), tenantId, fn);
}

function inferWorkspaceKind(input: {
  tenantKey: string;
  userSub: string;
  clerkOrgId?: string | null;
}): WorkspaceKind {
  if (input.clerkOrgId || input.tenantKey.startsWith('org_')) return 'organization';
  if (input.tenantKey === input.userSub || input.tenantKey.startsWith('user_')) return 'personal';
  return 'custom';
}

router.get('/me', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const user = requireUser(req);

    const [tenant] = await tenantDb(tenantId, (db) => db
      .select({
        id: tenants.id,
        tenantKey: tenants.tenantKey,
        clerkOrgId: tenants.clerkOrgId,
        name: tenants.name,
        plan: tenants.plan,
        createdAt: tenants.createdAt,
        deletedAt: tenants.deletedAt,
      })
      .from(tenants)
      .where(eq(tenants.tenantKey, tenantId))
      .limit(1));

    const [account] = await tenantDb(tenantId, (db) => db
      .select({
        id: users.id,
        clerkUserId: users.clerkUserId,
        email: users.email,
      })
      .from(users)
      .where(eq(users.clerkUserId, user.sub))
      .limit(1));

    const [membership] = tenant?.id && account?.id
      ? await tenantDb(tenantId, (db) => db
        .select({
          role: tenantMemberships.role,
          createdAt: tenantMemberships.createdAt,
        })
        .from(tenantMemberships)
        .where(and(
          eq(tenantMemberships.tenantId, tenant.id),
          eq(tenantMemberships.userId, account.id),
        ))
        .limit(1))
      : [];

    const [quota] = tenant?.id
      ? await tenantDb(tenantId, (db) => db
        .select({
          monthlyRequestLimit: tenantQuotas.monthlyRequestLimit,
          monthlyTokenLimit: tenantQuotas.monthlyTokenLimit,
          currentMonthRequests: tenantQuotas.currentMonthRequests,
          currentMonthTokens: tenantQuotas.currentMonthTokens,
          periodStart: tenantQuotas.periodStart,
          updatedAt: tenantQuotas.updatedAt,
        })
        .from(tenantQuotas)
        .where(eq(tenantQuotas.tenantId, tenant.id))
        .orderBy(desc(tenantQuotas.periodStart))
        .limit(1))
      : [];

    const tenantKey = tenant?.tenantKey ?? tenantId;
    const kind = inferWorkspaceKind({
      tenantKey,
      userSub: user.sub,
      clerkOrgId: tenant?.clerkOrgId,
    });

    res.json({
      tenant: {
        key: tenantKey,
        id: tenant?.id ?? null,
        name:
          tenant?.name ??
          (kind === 'organization' ? 'Organization workspace' :
            kind === 'personal' ? 'Personal workspace' :
            'Workspace'),
        kind,
        plan: tenant?.plan ?? 'free',
        clerkOrgId: tenant?.clerkOrgId ?? null,
        active: tenant?.deletedAt ? false : true,
        createdAt: tenant?.createdAt ?? null,
      },
      user: {
        id: account?.id ?? null,
        subject: user.sub,
        email: account?.email ?? null,
        roles: user.roles,
      },
      membership: {
        role: membership?.role ?? (kind === 'personal' ? 'owner' : user.roles[0] ?? 'member'),
        createdAt: membership?.createdAt ?? null,
      },
      quota: quota ? {
        monthlyRequestLimit: quota.monthlyRequestLimit,
        monthlyTokenLimit: quota.monthlyTokenLimit,
        currentMonthRequests: quota.currentMonthRequests,
        currentMonthTokens: quota.currentMonthTokens,
        periodStart: quota.periodStart,
        updatedAt: quota.updatedAt,
      } : null,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
