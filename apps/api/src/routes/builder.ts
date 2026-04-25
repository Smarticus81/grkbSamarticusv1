/**
 * Builder routes — persist agent configurations composed in the low-code
 * Builder. Every row is scoped to req.tenantId. The builder agent is a
 * configuration record only; execution still goes through the sandbox.
 */

import { Router } from 'express';
import { z } from 'zod';
import { getDB, schema, eq, desc, and } from '@regground/core';

const { builderAgents } = schema;

const router: Router = Router();

function requireTenantId(req: Express.Request): string {
  const tenantId = req.tenantId;
  if (!tenantId) throw new Error('Missing tenantId on request');
  return tenantId;
}

const SaveSchema = z.object({
  name: z.string().min(1).max(200),
  jobId: z.string().min(1).max(64),
  jobTitle: z.string().min(1).max(200),
  regulations: z.array(z.string()).default([]),
  evidenceStatus: z.record(z.string()).default({}),
  guardrails: z.record(z.boolean()).default({}),
  outputFormat: z.string().max(64).optional().nullable(),
  deployTarget: z.string().max(64).optional().nullable(),
  riskBand: z.enum(['low', 'medium', 'high']).default('medium'),
  description: z.string().max(2000).optional().nullable(),
});

/* ── GET / — list every builder agent for the tenant ────────────────── */
router.get('/', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const rows = await getDB()
      .select()
      .from(builderAgents)
      .where(eq(builderAgents.tenantId, tenantId))
      .orderBy(desc(builderAgents.updatedAt));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── GET /:id ──────────────────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const [row] = await getDB()
      .select()
      .from(builderAgents)
      .where(and(eq(builderAgents.id, req.params.id!), eq(builderAgents.tenantId, tenantId)))
      .limit(1);
    if (!row) return res.status(404).json({ error: 'agent not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── POST / — create or upsert ─────────────────────────────────────── */
router.post('/', async (req, res) => {
  const parsed = SaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
  try {
    const tenantId = requireTenantId(req);
    const db = getDB();

    // Upsert by (tenantId, name) — same name = update.
    const [existing] = await db
      .select()
      .from(builderAgents)
      .where(and(eq(builderAgents.tenantId, tenantId), eq(builderAgents.name, parsed.data.name)))
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(builderAgents)
        .set({
          jobId: parsed.data.jobId,
          jobTitle: parsed.data.jobTitle,
          regulations: parsed.data.regulations,
          evidenceStatus: parsed.data.evidenceStatus,
          guardrails: parsed.data.guardrails,
          outputFormat: parsed.data.outputFormat ?? null,
          deployTarget: parsed.data.deployTarget ?? null,
          riskBand: parsed.data.riskBand,
          description: parsed.data.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(builderAgents.id, existing.id))
        .returning();
      return res.json(row);
    }

    const [row] = await db
      .insert(builderAgents)
      .values({
        tenantId,
        createdBy: req.user?.sub ?? null,
        name: parsed.data.name,
        jobId: parsed.data.jobId,
        jobTitle: parsed.data.jobTitle,
        regulations: parsed.data.regulations,
        evidenceStatus: parsed.data.evidenceStatus,
        guardrails: parsed.data.guardrails,
        outputFormat: parsed.data.outputFormat ?? null,
        deployTarget: parsed.data.deployTarget ?? null,
        riskBand: parsed.data.riskBand,
        description: parsed.data.description ?? null,
      })
      .returning();
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── DELETE /:id ───────────────────────────────────────────────────── */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const [row] = await getDB()
      .delete(builderAgents)
      .where(and(eq(builderAgents.id, req.params.id!), eq(builderAgents.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'agent not found' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
