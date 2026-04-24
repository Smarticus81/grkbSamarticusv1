import { Router } from 'express';
import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import { getDB, schema, eq, desc, and, VALID_SCOPES, ScopeSchema } from '@regground/core';

const { apiKeys } = schema;

const router: Router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Generate a prefixed API key.
 * - `rg_live_` for production keys (default)
 * - `rg_test_` for dev / test keys
 */
function generateApiKey(mode: 'live' | 'test' = 'live'): string {
  const prefix = mode === 'test' ? 'rg_test_' : 'rg_live_';
  const body = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  return prefix + body;
}

/**
 * Extract the tenantId from the request.  The tenancy middleware guarantees
 * this is present for all authed routes — we throw early if it is somehow
 * missing so that queries never run without a tenant filter.
 */
function requireTenantId(req: Express.Request): string {
  const tenantId = req.tenantId;
  if (!tenantId) throw new Error('Missing tenantId on request');
  return tenantId;
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const CreateKeySchema = z.object({
  name: z.string().min(1).max(128),
  scopes: z.array(ScopeSchema).min(1).default(['graph:read']),
  rateLimit: z.number().int().min(1).max(100_000).default(1000),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  metadata: z.record(z.unknown()).default({}),
  mode: z.enum(['live', 'test']).default('live'),
});

// ---------------------------------------------------------------------------
// Routes — every query is scoped to req.tenantId
// ---------------------------------------------------------------------------

/**
 * GET / — List all API keys for the current tenant.
 * Key hashes are never returned; only the prefix is shown.
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const db = getDB();
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        rateLimit: apiKeys.rateLimit,
        expiresAt: apiKeys.expiresAt,
        lastUsedAt: apiKeys.lastUsedAt,
        usageCount: apiKeys.usageCount,
        active: apiKeys.active,
        metadata: apiKeys.metadata,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, tenantId))
      .orderBy(desc(apiKeys.createdAt));
    res.json(rows);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * POST / — Create a new API key for the current tenant.
 * Returns the raw key exactly once. Callers must store it securely.
 */
router.post('/', async (req, res) => {
  const parsed = CreateKeySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });

  try {
    const tenantId = requireTenantId(req);
    const rawKey = generateApiKey(parsed.data.mode);
    const db = getDB();
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000)
      : null;

    const [row] = await db
      .insert(apiKeys)
      .values({
        tenantId,
        createdBy: req.user?.sub ?? null,
        name: parsed.data.name,
        keyHash: hashKey(rawKey),
        keyPrefix: rawKey.slice(0, 12),
        scopes: parsed.data.scopes,
        rateLimit: parsed.data.rateLimit,
        expiresAt,
        metadata: parsed.data.metadata,
      })
      .returning();

    res.status(201).json({
      id: row!.id,
      name: row!.name,
      key: rawKey, // only time the raw key is shown
      keyPrefix: row!.keyPrefix,
      scopes: row!.scopes,
      rateLimit: row!.rateLimit,
      expiresAt: row!.expiresAt,
      createdAt: row!.createdAt,
    });
  } catch (e: unknown) {
    // Unique constraint on (tenant_id, name) — surface a friendly message.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('api_keys_tenant_name_idx')) {
      return res.status(409).json({ error: 'A key with that name already exists for this tenant' });
    }
    res.status(500).json({ error: msg });
  }
});

/**
 * PATCH /:id/revoke — Deactivate an API key (tenant-scoped).
 */
router.patch('/:id/revoke', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const db = getDB();
    const [row] = await db
      .update(apiKeys)
      .set({ active: false })
      .where(and(eq(apiKeys.id, req.params.id!), eq(apiKeys.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'API key not found' });
    res.json({ id: row.id, active: false });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * PATCH /:id/activate — Re-activate an API key (tenant-scoped).
 */
router.patch('/:id/activate', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const db = getDB();
    const [row] = await db
      .update(apiKeys)
      .set({ active: true })
      .where(and(eq(apiKeys.id, req.params.id!), eq(apiKeys.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'API key not found' });
    res.json({ id: row.id, active: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * DELETE /:id — Permanently delete an API key (tenant-scoped).
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const db = getDB();
    const [row] = await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, req.params.id!), eq(apiKeys.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'API key not found' });
    res.status(204).end();
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
