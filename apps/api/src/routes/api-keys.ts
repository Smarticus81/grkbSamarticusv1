import { Router } from 'express';
import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import { getDB, schema, eq, desc } from '@regground/core';

const { apiKeys } = schema;

const router: Router = Router();

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateApiKey(): string {
  const prefix = 'rg_';
  const body = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  return prefix + body;
}

// List all API keys (hash hidden, prefix shown)
router.get('/', async (_req, res) => {
  try {
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
      .orderBy(desc(apiKeys.createdAt));
    res.json(rows);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

const CreateKeySchema = z.object({
  name: z.string().min(1).max(128),
  scopes: z.array(z.string()).default(['graph:read']),
  rateLimit: z.number().int().min(1).max(100000).default(1000),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  metadata: z.record(z.unknown()).default({}),
});

// Create new API key — returns the raw key ONCE
router.post('/', async (req, res) => {
  const parsed = CreateKeySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });

  try {
    const rawKey = generateApiKey();
    const db = getDB();
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 86400000)
      : null;

    const [row] = await db
      .insert(apiKeys)
      .values({
        name: parsed.data.name,
        keyHash: hashKey(rawKey),
        keyPrefix: rawKey.slice(0, 10),
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
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// Revoke (deactivate) a key
router.patch('/:id/revoke', async (req, res) => {
  try {
    const db = getDB();
    const [row] = await db
      .update(apiKeys)
      .set({ active: false })
      .where(eq(apiKeys.id, req.params.id!))
      .returning();
    if (!row) return res.status(404).json({ error: 'API key not found' });
    res.json({ id: row.id, active: false });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// Re-activate a key
router.patch('/:id/activate', async (req, res) => {
  try {
    const db = getDB();
    const [row] = await db
      .update(apiKeys)
      .set({ active: true })
      .where(eq(apiKeys.id, req.params.id!))
      .returning();
    if (!row) return res.status(404).json({ error: 'API key not found' });
    res.json({ id: row.id, active: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// Delete a key permanently
router.delete('/:id', async (req, res) => {
  try {
    const db = getDB();
    const [row] = await db
      .delete(apiKeys)
      .where(eq(apiKeys.id, req.params.id!))
      .returning();
    if (!row) return res.status(404).json({ error: 'API key not found' });
    res.status(204).end();
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
