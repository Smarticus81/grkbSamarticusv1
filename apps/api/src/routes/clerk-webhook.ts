import { Router } from 'express';
import type { Request, Response } from 'express';

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

const router = Router();

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
// Event handlers
// ---------------------------------------------------------------------------

function handleOrganizationCreated(data: Record<string, unknown>): void {
  const orgId = data.id as string | undefined;
  const orgName = data.name as string | undefined;
  const orgSlug = data.slug as string | undefined;

  console.log('[clerk-webhook] organization.created', { orgId, orgName, orgSlug });

  // Phase 2 TODO: insert tenant row into the tenants table.
  // For now we log so the event is observable in server output.
  //
  // Example future implementation:
  // await db.insert(tenants).values({
  //   id: orgId,
  //   name: orgName,
  //   slug: orgSlug,
  //   plan: 'free',
  //   createdAt: new Date(),
  // });
}

function handleUserCreated(data: Record<string, unknown>): void {
  const userId = data.id as string | undefined;
  const email =
    ((data.email_addresses as Array<Record<string, unknown>> | undefined)?.[0]
      ?.email_address as string | undefined) ?? 'unknown';

  console.log('[clerk-webhook] user.created', { userId, email });
}

function handleOrganizationMembershipCreated(data: Record<string, unknown>): void {
  const orgId = (data.organization as Record<string, unknown> | undefined)?.id as string | undefined;
  const userId = (data.public_user_data as Record<string, unknown> | undefined)?.user_id as string | undefined;
  const role = data.role as string | undefined;

  console.log('[clerk-webhook] organizationMembership.created', { orgId, userId, role });
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
        handleOrganizationCreated(eventData);
        break;

      case 'user.created':
        handleUserCreated(eventData);
        break;

      case 'organizationMembership.created':
        handleOrganizationMembershipCreated(eventData);
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
