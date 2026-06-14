import { Router, type Router as ExpressRouter } from 'express';
import type { Request, Response } from 'express';
import { getDB, schema, eq, and } from '@regground/core';

// ---------------------------------------------------------------------------
// Clerk Webhook Handler
// ---------------------------------------------------------------------------
//
// Mount this router BEFORE the global JSON body parser so that the raw body
// is available for Svix signature verification:
//
//   app.use(
//     '/api/clerk-webhook',
//     express.raw({ type: 'application/json' }),
//     clerkWebhook,
//   );
//
// Required env vars:
//   CLERK_WEBHOOK_SIGNING_SECRET — the Svix signing secret from the Clerk dashboard
// ---------------------------------------------------------------------------

const router: ExpressRouter = Router();

/** Svix header names used for webhook signature verification. */
const SVIX_ID_HEADER = 'svix-id';
const SVIX_TIMESTAMP_HEADER = 'svix-timestamp';
const SVIX_SIGNATURE_HEADER = 'svix-signature';

/**
 * Verify the Svix webhook signature.
 *
 * Uses the `svix` npm package when available. If `svix` is not installed
 * (e.g., in early development), logs a warning and skips verification
 * in non-production environments.
 */
async function verifyWebhookSignature(
  payload: Buffer | string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CLERK_WEBHOOK_SIGNING_SECRET is required in production');
    }
    console.warn('[clerk-webhook] CLERK_WEBHOOK_SIGNING_SECRET not set — skipping verification (dev only)');
    return JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf-8'));
  }

  // Dynamic import so the app still boots if svix is not yet installed.
  let Webhook: any;
  try {
    // @ts-expect-error - svix is an optional runtime dependency
    const svix = await import('svix');
    Webhook = svix.Webhook;
  } catch {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('svix package is required in production for webhook verification');
    }
    console.warn('[clerk-webhook] svix package not installed — skipping verification (dev only)');
    return JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf-8'));
  }

  const wh = new Webhook(secret);
  const verified = wh.verify(
    typeof payload === 'string' ? payload : payload.toString('utf-8'),
    {
      'svix-id': headers[SVIX_ID_HEADER],
      'svix-timestamp': headers[SVIX_TIMESTAMP_HEADER],
      'svix-signature': headers[SVIX_SIGNATURE_HEADER],
    },
  ) as Record<string, unknown>;

  return verified;
}

// ---------------------------------------------------------------------------
// Event handlers — idempotent upserts into Postgres.
// ---------------------------------------------------------------------------

type TenantPlan = 'free' | 'starter' | 'professional' | 'enterprise';

function normalizePlan(raw: unknown): TenantPlan {
  if (typeof raw === 'string' && ['free', 'starter', 'professional', 'enterprise'].includes(raw)) {
    return raw as TenantPlan;
  }
  return 'free';
}

function organizationName(data: Record<string, unknown>): string {
  return (data.name as string | undefined) ?? (data.slug as string | undefined) ?? 'Unnamed organization';
}

function userEmail(data: Record<string, unknown>): string {
  const primaryEmailAddressId = data.primary_email_address_id as string | undefined;
  const emailAddresses = data.email_addresses as Array<Record<string, unknown>> | undefined;
  const primary = emailAddresses?.find((email) => email.id === primaryEmailAddressId);
  const firstEmail = primary ?? emailAddresses?.[0];
  const email =
    (firstEmail?.email_address as string | undefined) ??
    (data.email_address as string | undefined) ??
    (typeof data.identifier === 'string' && data.identifier.includes('@') ? data.identifier : undefined);
  return email ?? 'unknown@unknown.local';
}

async function upsertOrganization(clerkOrgId: string, orgName: string, plan: TenantPlan): Promise<void> {
  const db = getDB();
  await db
    .insert(schema.tenants)
    .values({ tenantKey: clerkOrgId, clerkOrgId, name: orgName, plan, deletedAt: null })
    .onConflictDoUpdate({
      target: schema.tenants.tenantKey,
      set: { clerkOrgId, name: orgName, plan, deletedAt: null },
    });
}

async function upsertUser(clerkUserId: string, email: string): Promise<void> {
  const db = getDB();
  await db
    .insert(schema.users)
    .values({ clerkUserId, email })
    .onConflictDoUpdate({
      target: schema.users.clerkUserId,
      set: { email },
    });
}

async function upsertPersonalTenant(clerkUserId: string, email: string): Promise<void> {
  const db = getDB();
  await db
    .insert(schema.tenants)
    .values({
      tenantKey: clerkUserId,
      clerkOrgId: null,
      name: email ? `Personal workspace (${email})` : 'Personal workspace',
      plan: 'free',
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: schema.tenants.tenantKey,
      set: {
        name: email ? `Personal workspace (${email})` : 'Personal workspace',
        deletedAt: null,
      },
    });
}

async function handleOrganizationCreated(data: Record<string, unknown>): Promise<void> {
  const clerkOrgId = data.id as string | undefined;
  const orgName = organizationName(data);
  const plan = normalizePlan((data.public_metadata as Record<string, unknown> | undefined)?.plan);

  if (!clerkOrgId) {
    console.warn('[clerk-webhook] organization.created missing id', data);
    return;
  }

  await upsertOrganization(clerkOrgId, orgName, plan);
  console.log('[clerk-webhook] organization upserted', { clerkOrgId, orgName, plan });
}

async function handleOrganizationUpdated(data: Record<string, unknown>): Promise<void> {
  await handleOrganizationCreated(data);
}

async function handleOrganizationDeleted(data: Record<string, unknown>): Promise<void> {
  const clerkOrgId = data.id as string | undefined;
  if (!clerkOrgId) return;
  const db = getDB();
  await db
    .update(schema.tenants)
    .set({ deletedAt: new Date() })
    .where(eq(schema.tenants.clerkOrgId, clerkOrgId));
  console.log('[clerk-webhook] organization soft-deleted', { clerkOrgId });
}

export async function handleUserCreated(data: Record<string, unknown>): Promise<void> {
  const clerkUserId = data.id as string | undefined;
  const email = userEmail(data);

  if (!clerkUserId) {
    console.warn('[clerk-webhook] user.created missing id', data);
    return;
  }

  await upsertUser(clerkUserId, email);
  await upsertPersonalTenant(clerkUserId, email);
  console.log('[clerk-webhook] user upserted', { clerkUserId, email });
}

export async function handleOrganizationMembershipCreated(data: Record<string, unknown>): Promise<void> {
  const organization = data.organization as Record<string, unknown> | undefined;
  const publicUserData = data.public_user_data as Record<string, unknown> | undefined;
  const clerkOrgId = organization?.id as string | undefined;
  const clerkUserId = publicUserData?.user_id as string | undefined;
  const rawRole = data.role as string | undefined;

  if (!clerkOrgId || !clerkUserId) {
    console.warn('[clerk-webhook] membership.created missing ids', data);
    return;
  }

  const role: 'owner' | 'admin' | 'member' | 'viewer' =
    rawRole === 'org:admin' ? 'admin' :
    rawRole === 'org:owner' ? 'owner' :
    rawRole === 'org:viewer' ? 'viewer' :
    'member';

  const db = getDB();
  await upsertOrganization(
    clerkOrgId,
    organizationName(organization ?? {}),
    normalizePlan((organization?.public_metadata as Record<string, unknown> | undefined)?.plan),
  );
  const email = userEmail(publicUserData ?? {});
  await upsertUser(clerkUserId, email);
  await upsertPersonalTenant(clerkUserId, email);

  const tenant = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.tenantKey, clerkOrgId))
    .limit(1);
  const user = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, clerkUserId))
    .limit(1);

  const tenantId = tenant[0]?.id;
  const userId = user[0]?.id;
  if (!tenantId || !userId) {
    console.warn('[clerk-webhook] membership.created — tenant or user not yet persisted', {
      clerkOrgId,
      clerkUserId,
    });
    return;
  }

  await db
    .insert(schema.tenantMemberships)
    .values({ tenantId, userId, role })
    .onConflictDoUpdate({
      target: [schema.tenantMemberships.tenantId, schema.tenantMemberships.userId],
      set: { role },
    });
  console.log('[clerk-webhook] membership upserted', { tenantId, userId, role });
}

async function handleOrganizationMembershipDeleted(data: Record<string, unknown>): Promise<void> {
  const clerkOrgId = (data.organization as Record<string, unknown> | undefined)?.id as string | undefined;
  const clerkUserId = (data.public_user_data as Record<string, unknown> | undefined)?.user_id as string | undefined;
  if (!clerkOrgId || !clerkUserId) return;

  const db = getDB();
  const tenant = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.tenantKey, clerkOrgId))
    .limit(1);
  const user = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, clerkUserId))
    .limit(1);
  const tenantId = tenant[0]?.id;
  const userId = user[0]?.id;
  if (!tenantId || !userId) return;

  await db
    .delete(schema.tenantMemberships)
    .where(
      and(
        eq(schema.tenantMemberships.tenantId, tenantId),
        eq(schema.tenantMemberships.userId, userId),
      ),
    );
  console.log('[clerk-webhook] membership removed', { tenantId, userId });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

router.post('/', async (req: Request, res: Response) => {
  try {
    // The body should be raw (Buffer) when mounted with express.raw().
    const payload = req.body as Buffer | string;

    const svixHeaders: Record<string, string> = {
      [SVIX_ID_HEADER]: req.headers[SVIX_ID_HEADER] as string ?? '',
      [SVIX_TIMESTAMP_HEADER]: req.headers[SVIX_TIMESTAMP_HEADER] as string ?? '',
      [SVIX_SIGNATURE_HEADER]: req.headers[SVIX_SIGNATURE_HEADER] as string ?? '',
    };

    const event = await verifyWebhookSignature(payload, svixHeaders);

    const eventType = event.type as string | undefined;
    const eventData = event.data as Record<string, unknown> | undefined;

    if (!eventType || !eventData) {
      console.warn('[clerk-webhook] Received event with missing type or data', event);
      res.status(400).json({ error: 'Missing event type or data' });
      return;
    }

    console.log(`[clerk-webhook] Received event: ${eventType}`);

    switch (eventType) {
      case 'organization.created':
        await handleOrganizationCreated(eventData);
        break;

      case 'organization.updated':
        await handleOrganizationUpdated(eventData);
        break;

      case 'organization.deleted':
        await handleOrganizationDeleted(eventData);
        break;

      case 'user.created':
      case 'user.updated':
        await handleUserCreated(eventData);
        break;

      case 'organizationMembership.created':
      case 'organizationMembership.updated':
        await handleOrganizationMembershipCreated(eventData);
        break;

      case 'organizationMembership.deleted':
        await handleOrganizationMembershipDeleted(eventData);
        break;

      default:
        console.log(`[clerk-webhook] Unhandled event type: ${eventType}`);
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[clerk-webhook] Verification or processing failed:', message);
    res.status(400).json({ error: 'Webhook verification failed' });
  }
});

export default router;
