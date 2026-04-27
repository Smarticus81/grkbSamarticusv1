/**
 * Builder routes — persist agent configurations composed in the low-code
 * Builder. Every row is scoped to req.tenantId.
 *
 * - GET    /                 list this tenant's saved agents
 * - GET    /:id              fetch one
 * - POST   /                 create or upsert by (tenantId, name)
 * - PATCH  /:id/attach       attach data to a slot on this agent
 * - DELETE /:id/attach/:slot remove a slot's attached data
 * - POST   /:id/launch       resolve agent → sandbox task + merged input
 * - DELETE /:id              delete an agent
 * - GET    /processes        list QMS processes runnable on the live graph
 */

import { Router } from 'express';
import { z } from 'zod';
import { getDB, schema, eq, desc, and } from '@regground/core';
import { listTasks, getTask } from '@regground/sandbox';

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
  taskId: z.string().min(1).max(64).optional().nullable(),
  regulations: z.array(z.string()).default([]),
  evidenceStatus: z.record(z.string()).default({}),
  guardrails: z.record(z.boolean()).default({}),
  outputFormat: z.string().max(64).optional().nullable(),
  deployTarget: z.string().max(64).optional().nullable(),
  riskBand: z.enum(['low', 'medium', 'high']).default('medium'),
  description: z.string().max(2000).optional().nullable(),
});

const AttachSchema = z.object({
  slot: z.string().min(1).max(200),
  filename: z.string().min(1).max(256),
  content: z.string().max(2_000_000), // ~2MB cap on raw text/JSON
  contentType: z.string().max(128).default('text/plain'),
});

/* ── GET / ─────────────────────────────────────────────────────────── */
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

/* ── GET /processes ─ runnable QMS processes ────────────────────────── */
router.get('/processes', (_req, res) => {
  // Tasks are the runnable agents in the sandbox. Group them by regulation.
  const tasks = listTasks();
  const byRegulation: Record<string, typeof tasks> = {};
  for (const t of tasks) {
    const key = t.regulation || 'Other';
    (byRegulation[key] ??= []).push(t);
  }
  res.json({
    total: tasks.length,
    tasks,
    byRegulation: Object.entries(byRegulation).map(([regulation, items]) => ({
      regulation,
      count: items.length,
      tasks: items,
    })),
  });
});

/* ── GET /:id ──────────────────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const [row] = await getDB()
      .select()
      .from(builderAgents)
      .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
      .limit(1);
    if (!row) return res.status(404).json({ error: 'agent not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── POST / ─ create or upsert ─────────────────────────────────────── */
router.post('/', async (req, res) => {
  const parsed = SaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
  try {
    const tenantId = requireTenantId(req);
    const db = getDB();

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
          taskId: parsed.data.taskId ?? null,
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
        taskId: parsed.data.taskId ?? null,
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

/* ── PATCH /:id/attach ─ attach data to a slot ─────────────────────── */
router.patch('/:id/attach', async (req, res) => {
  const parsed = AttachSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    const db = getDB();
    const [existing] = await db
      .select()
      .from(builderAgents)
      .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'agent not found' });

    const next = {
      ...(existing.attachedData ?? {}),
      [parsed.data.slot]: {
        filename: parsed.data.filename,
        sizeBytes: parsed.data.content.length,
        content: parsed.data.content,
        contentType: parsed.data.contentType,
        attachedAt: new Date().toISOString(),
      },
    };
    const evidenceStatus = { ...(existing.evidenceStatus ?? {}), [parsed.data.slot]: 'connected' };

    const [row] = await db
      .update(builderAgents)
      .set({ attachedData: next, evidenceStatus, updatedAt: new Date() })
      .where(eq(builderAgents.id, id))
      .returning();
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── DELETE /:id/attach/:slot ─────────────────────────────────────── */
router.delete('/:id/attach/:slot', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    const slot = req.params.slot;
    if (!id || !slot) return res.status(400).json({ error: 'id and slot required' });

    const db = getDB();
    const [existing] = await db
      .select()
      .from(builderAgents)
      .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'agent not found' });

    const nextAttached = { ...(existing.attachedData ?? {}) };
    delete nextAttached[slot];
    const nextStatus = { ...(existing.evidenceStatus ?? {}) };
    if (nextStatus[slot] === 'connected') nextStatus[slot] = 'missing';

    const [row] = await db
      .update(builderAgents)
      .set({ attachedData: nextAttached, evidenceStatus: nextStatus, updatedAt: new Date() })
      .where(eq(builderAgents.id, id))
      .returning();
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── POST /:id/launch ─ resolve agent → sandbox task + merged input ── */
router.post('/:id/launch', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    const [agent] = await getDB()
      .select()
      .from(builderAgents)
      .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
      .limit(1);
    if (!agent) return res.status(404).json({ error: 'agent not found' });
    if (!agent.taskId) {
      return res.status(409).json({
        error: 'no_runner',
        message: 'This agent has no sandbox runner mapped. Pick a job that has one.',
      });
    }
    const def = getTask(agent.taskId);
    if (!def) {
      return res.status(409).json({
        error: 'unknown_task',
        message: `Sandbox task '${agent.taskId}' is not registered.`,
      });
    }

    // Merge attached data over the sample data. Attached data is keyed by
    // slot label; we expose it under input.attachments so the task agent
    // can opt to consume it.
    const attachments: Record<string, unknown> = {};
    for (const [slot, payload] of Object.entries(agent.attachedData ?? {})) {
      let parsed: unknown = payload.content;
      if (payload.contentType.includes('json')) {
        try { parsed = JSON.parse(payload.content); } catch { /* fall back to string */ }
      }
      attachments[slot] = {
        filename: payload.filename,
        sizeBytes: payload.sizeBytes,
        contentType: payload.contentType,
        attachedAt: payload.attachedAt,
        data: parsed,
      };
    }

    const mergedInput =
      typeof def.sampleData === 'object' && def.sampleData !== null && !Array.isArray(def.sampleData)
        ? { ...(def.sampleData as Record<string, unknown>), attachments }
        : def.sampleData;

    res.json({
      taskId: def.id,
      taskName: def.name,
      input: mergedInput,
      hasAttachments: Object.keys(attachments).length > 0,
      attachmentSlots: Object.keys(attachments),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── DELETE /:id ───────────────────────────────────────────────────── */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const [row] = await getDB()
      .delete(builderAgents)
      .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'agent not found' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
