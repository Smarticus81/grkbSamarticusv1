/**
 * Builder routes — persist agent configurations composed in the low-code
 * Builder. Every row is scoped to req.tenantId.
 *
 * - GET    /agents                 list this tenant's saved agents
 * - GET    /agents/:id             fetch one
 * - POST   /agents                 create or upsert by (tenantId, name)
 * - PATCH  /agents/:id             rename a saved agent
 * - PATCH  /agents/:id/attach      attach data to a slot on this agent
 * - DELETE /agents/:id/attach/:slot remove a slot's attached data
 * - POST   /agents/:id/launch      resolve agent → sandbox task + merged input
 * - DELETE /agents/:id             delete an agent
 * - GET    /processes              list QMS processes runnable on the live graph
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  getDB,
  schema,
  eq,
  desc,
  and,
  ObligationGraph,
  KBCatalog,
  ProcessBuilderAgent,
  LLMAbstraction,
  EmbeddingClient,
  SemanticContextBroker,
  templateToWorkflowDraft,
  summarizeTemplate,
  withTenant,
  type TenantTransaction,
} from '@regground/core';
import { listTasks, getTask, ProcessRegistry, registerAllProcesses } from '@regground/sandbox';
import { synthesizeAgentContext } from '../services/AgentContextSynthesizer.js';
import { getGroundedRunManifest } from './sandbox.js';

const { builderAgents, processWorkflows } = schema;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

function isUserAttachmentSlot(slot: string): boolean {
  return !slot.startsWith('__');
}

const router: Router = Router();

function requireTenantId(req: Express.Request): string {
  const tenantId = req.tenantId;
  if (!tenantId) throw new Error('Missing tenantId on request');
  return tenantId;
}

function tenantDb<T>(tenantId: string, fn: (db: TenantTransaction) => Promise<T>): Promise<T> {
  return withTenant(getDB(), tenantId, fn);
}

const SaveSchema = z.object({
  name: z.string().min(1).max(200),
  processId: z.string().min(1).max(64),
  processTitle: z.string().min(1).max(200),
  taskId: z.string().min(1).max(64).optional().nullable(),
  regulations: z.array(z.string()).default([]),
  evidenceStatus: z.record(z.string()).default({}),
  guardrails: z.record(z.boolean()).default({}),
  outputFormat: z.string().max(64).optional().nullable(),
  deployTarget: z.string().max(64).optional().nullable(),
  riskBand: z.enum(['low', 'medium', 'high']).default('medium'),
  description: z.string().max(2000).optional().nullable(),
  sourceRunId: z.string().min(1).max(128).optional().nullable(),
});

const AttachSchema = z.object({
  slot: z.string().min(1).max(200).refine(isUserAttachmentSlot, {
    message: 'slot names starting with "__" are reserved for system metadata',
  }),
  filename: z.string().min(1).max(256),
  content: z.string().max(2_000_000), // ~2MB cap on raw text/JSON
  contentType: z.string().max(128).default('text/plain'),
});

/* ── GET /agents ──────────────────────────────────────────────────── */
router.get('/agents', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const rows = await tenantDb(tenantId, (db) => db
      .select()
      .from(builderAgents)
      .where(eq(builderAgents.tenantId, tenantId))
      .orderBy(desc(builderAgents.updatedAt)));
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

/* ── GET /agents/:id ──────────────────────────────────────────────── */
router.get('/agents/:id', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const [row] = await tenantDb(tenantId, (db) => db
      .select()
      .from(builderAgents)
      .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
      .limit(1));
    if (!row) return res.status(404).json({ error: 'agent not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── POST /agents ─ create or upsert ──────────────────────────────── */
router.post('/agents', async (req, res) => {
  const parsed = SaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
  try {
    const tenantId = requireTenantId(req);
    const requiresGroundedRun = parsed.data.deployTarget === 'claude-managed-agents';
    const groundedRunManifest = parsed.data.sourceRunId
      ? await getGroundedRunManifest(parsed.data.sourceRunId, tenantId)
      : null;

    if (requiresGroundedRun && !groundedRunManifest) {
      return res.status(409).json({
        error: 'grounded_run_required',
        message:
          parsed.data.sourceRunId
            ? 'This run is not available for promotion. Re-run the template, wait for it to finish, then create the managed agent from that passing run.'
            : 'Run a template to completion before creating a managed agent. Managed agents are created only from passing grounded runs.',
      });
    }
    if (groundedRunManifest && !groundedRunManifest.validation.strictGatePass) {
      return res.status(409).json({
        error: 'grounded_run_failed_gate',
        message: 'The grounded run did not pass its strict compliance gate. Resolve violations before creating a managed agent.',
        violations: groundedRunManifest.validation.violations,
      });
    }

    const result = await tenantDb(tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(builderAgents)
        .where(and(eq(builderAgents.tenantId, tenantId), eq(builderAgents.name, parsed.data.name)))
        .limit(1);

      if (existing) {
        // Re-synthesise context only when the user changed something material
        // (regulations, role, description, riskBand) or never synthesised one.
        const existingCtx = (existing.attachedData as Record<string, unknown> | null)?.__context as
          | { generatedAt?: string }
          | undefined;
        const materialChanged =
          JSON.stringify(existing.regulations ?? []) !== JSON.stringify(parsed.data.regulations)
          || existing.processId !== parsed.data.processId
          || existing.riskBand !== parsed.data.riskBand
          || (existing.description ?? null) !== (parsed.data.description ?? null);
        let nextAttachedData: typeof existing.attachedData = existing.attachedData ?? {};
        if (!existingCtx || materialChanged) {
          const ctx = await synthesizeAgentContext({
            processId: parsed.data.processId,
            processTitle: parsed.data.processTitle,
            taskId: parsed.data.taskId ?? null,
            regulations: parsed.data.regulations,
            description: parsed.data.description ?? null,
            riskBand: parsed.data.riskBand,
          });
          nextAttachedData = { ...nextAttachedData, __context: ctx };
        }
        if (groundedRunManifest) {
          nextAttachedData = {
            ...nextAttachedData,
            __groundedRunManifest: groundedRunManifest,
            __input: {
              filename: 'input.json',
              sizeBytes: JSON.stringify(groundedRunManifest.inputSnapshot).length,
              content: JSON.stringify(groundedRunManifest.inputSnapshot, null, 2),
              contentType: 'application/json',
              attachedAt: new Date().toISOString(),
            },
          };
        }
        const [row] = await db
          .update(builderAgents)
          .set({
            processId: parsed.data.processId,
            processTitle: parsed.data.processTitle,
            taskId: parsed.data.taskId ?? null,
            regulations: parsed.data.regulations,
            evidenceStatus: parsed.data.evidenceStatus,
            guardrails: parsed.data.guardrails,
            outputFormat: parsed.data.outputFormat ?? null,
            deployTarget: parsed.data.deployTarget ?? null,
            riskBand: parsed.data.riskBand,
            description: parsed.data.description ?? null,
            attachedData: nextAttachedData,
            updatedAt: new Date(),
          })
          .where(and(eq(builderAgents.id, existing.id), eq(builderAgents.tenantId, tenantId)))
          .returning();
        return { status: 200, row };
      }

      const initialCtx = await synthesizeAgentContext({
        processId: parsed.data.processId,
        processTitle: parsed.data.processTitle,
        taskId: parsed.data.taskId ?? null,
        regulations: parsed.data.regulations,
        description: parsed.data.description ?? null,
        riskBand: parsed.data.riskBand,
      });

      const [row] = await db
        .insert(builderAgents)
        .values({
          tenantId,
          createdBy: isUuid(req.user?.sub) ? req.user!.sub : null,
          name: parsed.data.name,
          processId: parsed.data.processId,
          processTitle: parsed.data.processTitle,
          taskId: parsed.data.taskId ?? null,
          regulations: parsed.data.regulations,
          evidenceStatus: parsed.data.evidenceStatus,
          guardrails: parsed.data.guardrails,
          outputFormat: parsed.data.outputFormat ?? null,
          deployTarget: parsed.data.deployTarget ?? null,
          riskBand: parsed.data.riskBand,
          description: parsed.data.description ?? null,
          attachedData: groundedRunManifest
            ? {
                __context: initialCtx,
                __groundedRunManifest: groundedRunManifest,
                __input: {
                  filename: 'input.json',
                  sizeBytes: JSON.stringify(groundedRunManifest.inputSnapshot).length,
                  content: JSON.stringify(groundedRunManifest.inputSnapshot, null, 2),
                  contentType: 'application/json',
                  attachedAt: new Date().toISOString(),
                },
              }
            : { __context: initialCtx },
        })
        .returning();
      return { status: 201, row };
    });
    res.status(result.status).json(result.row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── PATCH /agents/:id ─ rename ───────────────────────────────────── */
const RenameSchema = z.object({ name: z.string().min(1).max(200) });
router.patch('/agents/:id', async (req, res) => {
  const parsed = RenameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const [row] = await tenantDb(tenantId, (db) => db
      .update(builderAgents)
      .set({ name: parsed.data.name.trim(), updatedAt: new Date() })
      .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
      .returning());
    if (!row) return res.status(404).json({ error: 'agent not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── PATCH /agents/:id/attach ─ attach data to a slot ─────────────── */
router.patch('/agents/:id/attach', async (req, res) => {
  const parsed = AttachSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    const row = await tenantDb(tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(builderAgents)
        .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
        .limit(1);
      if (!existing) return null;

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

      const [updated] = await db
        .update(builderAgents)
        .set({ attachedData: next, evidenceStatus, updatedAt: new Date() })
        .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
        .returning();
      return updated;
    });
    if (!row) return res.status(404).json({ error: 'agent not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── DELETE /agents/:id/attach/:slot ──────────────────────────────── */
router.delete('/agents/:id/attach/:slot', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    const slot = req.params.slot;
    if (!id || !slot) return res.status(400).json({ error: 'id and slot required' });
    if (!isUserAttachmentSlot(slot)) {
      return res.status(400).json({ error: 'slot names starting with "__" are reserved for system metadata' });
    }

    const row = await tenantDb(tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(builderAgents)
        .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
        .limit(1);
      if (!existing) return null;

      const nextAttached = { ...(existing.attachedData ?? {}) };
      delete nextAttached[slot];
      const nextStatus = { ...(existing.evidenceStatus ?? {}) };
      if (nextStatus[slot] === 'connected') nextStatus[slot] = 'missing';

      const [updated] = await db
        .update(builderAgents)
        .set({ attachedData: nextAttached, evidenceStatus: nextStatus, updatedAt: new Date() })
        .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
        .returning();
      return updated;
    });
    if (!row) return res.status(404).json({ error: 'agent not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── POST /agents/:id/launch ─ resolve agent → sandbox task + merged input ── */
router.post('/agents/:id/launch', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    const [agent] = await tenantDb(tenantId, (db) => db
      .select()
      .from(builderAgents)
      .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
      .limit(1));
    if (!agent) return res.status(404).json({ error: 'agent not found' });
    if (!agent.taskId) {
      return res.status(409).json({
        error: 'no_runner',
        message: 'This agent has no sandbox runner mapped. Pick a process that has one.',
      });
    }
    const def = getTask(agent.taskId);
    if (!def) {
      return res.status(409).json({
        error: 'unknown_task',
        message: `Sandbox task '${agent.taskId}' is not registered.`,
      });
    }

    // Merge attached data over the base input. Attached data is keyed by
    // slot label; we expose it under input.attachments so the task agent
    // can opt to consume it.
    //
    // Two reserved slots are handled specially:
    //   __context — the synthesised agent persona (surfaced separately).
    //   __input   — a full input snapshot saved from the Sandbox run screen.
    //               When present it becomes the base input (instead of the
    //               task's sample data), so the agent replays exactly what the
    //               user ran.
    const attachments: Record<string, unknown> = {};
    let agentContext: string | null = null;
    let savedInput: unknown = undefined;
    for (const [slot, payload] of Object.entries(agent.attachedData ?? {})) {
      if (slot === '__context') {
        const ctx = payload as unknown as { systemPrompt?: string } | null | undefined;
        if (ctx && typeof ctx.systemPrompt === 'string') agentContext = ctx.systemPrompt;
        continue;
      }
      if (slot === '__input') {
        if (payload && typeof payload === 'object' && 'content' in payload) {
          try { savedInput = JSON.parse((payload as { content: string }).content); } catch { /* ignore */ }
        }
        continue;
      }
      if (!payload || typeof payload !== 'object' || !('content' in payload)) continue;
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

    const baseInput = savedInput !== undefined ? savedInput : def.sampleData;
    const hasAttachments = Object.keys(attachments).length > 0;
    const mergedInput =
      typeof baseInput === 'object' && baseInput !== null && !Array.isArray(baseInput)
        ? (hasAttachments
            ? { ...(baseInput as Record<string, unknown>), attachments }
            : (baseInput as Record<string, unknown>))
        : baseInput;

    res.json({
      taskId: def.id,
      taskName: def.name,
      input: mergedInput,
      hasAttachments,
      attachmentSlots: Object.keys(attachments),
      agentContext,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/* ── DELETE /agents/:id ───────────────────────────────────────────── */
router.delete('/agents/:id', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const [row] = await tenantDb(tenantId, (db) => db
      .delete(builderAgents)
      .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
      .returning());
    if (!row) return res.status(404).json({ error: 'agent not found' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Process Designer (chat → KB-grounded workflow)
// ─────────────────────────────────────────────────────────────────────────

let _graph: ObligationGraph | null = null;
let _catalog: KBCatalog | null = null;
let _agent: ProcessBuilderAgent | null = null;
let _broker: SemanticContextBroker | null = null;
function getGraph(): ObligationGraph {
  if (!_graph) _graph = new ObligationGraph();
  return _graph;
}
function getCatalog(): KBCatalog {
  if (!_catalog) _catalog = new KBCatalog(getGraph());
  return _catalog;
}
function getBroker(): SemanticContextBroker | null {
  if (_broker) return _broker;
  try {
    const llm = LLMAbstraction.fromEnv();
    let embeddings: EmbeddingClient | null = null;
    try {
      embeddings = EmbeddingClient.fromEnv();
    } catch {
      // Embeddings unavailable — broker will use structural-only fallback
    }
    _broker = new SemanticContextBroker(getGraph(), getCatalog(), llm, embeddings);
    return _broker;
  } catch {
    // LLM unavailable — no broker
    return null;
  }
}
function getBuilderAgent(): ProcessBuilderAgent {
  if (!_agent) {
    const agent = new ProcessBuilderAgent(LLMAbstraction.fromEnv(), getCatalog());
    const broker = getBroker();
    if (broker) agent.withBroker(broker);
    _agent = agent;
  }
  return _agent;
}

// GET /api/builder/catalog?jurisdiction=&processType=
router.get('/catalog', async (req, res) => {
  try {
    requireTenantId(req);
    const jurisdiction =
      typeof req.query.jurisdiction === 'string' ? req.query.jurisdiction : undefined;
    const processType =
      typeof req.query.processType === 'string' ? req.query.processType : undefined;
    const snapshot = await getCatalog().snapshot({ jurisdiction, processType });
    res.json({ snapshot, capturedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

const DraftSchema = z.object({
  description: z.string().min(10).max(4000),
  jurisdiction: z.string().min(1).max(64).optional(),
  processType: z.string().min(1).max(64).optional(),
  conversation: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .max(20)
    .optional(),
});

// POST /api/builder/draft  — KB-grounded LLM workflow draft (semantic-aware)
router.post('/draft', async (req, res) => {
  try {
    requireTenantId(req);
    const parsed = DraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });
    }
    const t0 = Date.now();
    console.log('[builder/draft] starting build…', {
      description: parsed.data.description.slice(0, 80),
      conversation: parsed.data.conversation?.length ?? 0,
    });
    const result = await getBuilderAgent().build(parsed.data);
    console.log('[builder/draft] done in %dms — %s via %s', Date.now() - t0, result.llmModel, result.llmProvider);
    res.json({ ...result, generatedAt: new Date().toISOString() });
  } catch (e) {
    const err = e as Error & {
      validation?: unknown;
      parseError?: { message: string; rawSnippet: string };
      attempts?: number;
    };
    console.error('[builder/draft] failed', {
      message: err.message,
      attempts: err.attempts,
      parseError: err.parseError,
    });
    res.status(422).json({
      error: err.message,
      validation: err.validation,
      parseError: err.parseError,
      attempts: err.attempts,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Process Templates — shipped boilerplate processes that can be loaded
// into the Process Designer canvas as a starting point.
// ─────────────────────────────────────────────────────────────────────────

let _templates: ProcessRegistry | null = null;
function getTemplateRegistry(): ProcessRegistry {
  if (!_templates) {
    _templates = registerAllProcesses(new ProcessRegistry());
  }
  return _templates;
}

// GET /api/builder/templates
router.get('/templates', (req, res) => {
  try {
    requireTenantId(req);
    const reg = getTemplateRegistry();
    res.json({
      templates: reg.list().map((d) => summarizeTemplate(d)),
      capturedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/builder/templates/:id  → full summary
router.get('/templates/:id', (req, res) => {
  try {
    requireTenantId(req);
    const def = getTemplateRegistry().get(req.params.id);
    if (!def) return res.status(404).json({ error: `Template not found: ${req.params.id}` });
    res.json(summarizeTemplate(def));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/builder/templates/:id/draft  → ready-to-edit WorkflowDraft
router.get('/templates/:id/draft', (req, res) => {
  try {
    requireTenantId(req);
    const def = getTemplateRegistry().get(req.params.id);
    if (!def) return res.status(404).json({ error: `Template not found: ${req.params.id}` });
    const draft = templateToWorkflowDraft(def);
    res.json({
      draft,
      template: summarizeTemplate(def),
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Process Workflows — persisted WorkflowDrafts from the Process Designer
// ─────────────────────────────────────────────────────────────────────────

const WorkflowSourceSchema = z.enum(['template', 'chat', 'manual', 'canvas']);

const WorkflowSaveSchema = z.object({
  name: z.string().min(1).max(200),
  processType: z.string().min(1).max(64),
  jurisdiction: z.string().min(1).max(64),
  description: z.string().max(2000).optional().nullable(),
  draft: z.record(z.unknown()),
  source: WorkflowSourceSchema.default('manual'),
  sourceTemplateId: z.string().max(64).optional().nullable(),
});

const WorkflowUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  processType: z.string().min(1).max(64).optional(),
  jurisdiction: z.string().min(1).max(64).optional(),
  description: z.string().max(2000).optional().nullable(),
  draft: z.record(z.unknown()).optional(),
  source: WorkflowSourceSchema.optional(),
  sourceTemplateId: z.string().max(64).optional().nullable(),
});

// GET /api/builder/workflows
router.get('/workflows', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const rows = await tenantDb(tenantId, (db) => db
      .select({
        id: processWorkflows.id,
        name: processWorkflows.name,
        processType: processWorkflows.processType,
        jurisdiction: processWorkflows.jurisdiction,
        description: processWorkflows.description,
        source: processWorkflows.source,
        sourceTemplateId: processWorkflows.sourceTemplateId,
        createdAt: processWorkflows.createdAt,
        updatedAt: processWorkflows.updatedAt,
      })
      .from(processWorkflows)
      .where(eq(processWorkflows.tenantId, tenantId))
      .orderBy(desc(processWorkflows.updatedAt)));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// GET /api/builder/workflows/:id
router.get('/workflows/:id', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const [row] = await tenantDb(tenantId, (db) => db
      .select()
      .from(processWorkflows)
      .where(and(eq(processWorkflows.id, id), eq(processWorkflows.tenantId, tenantId)))
      .limit(1));
    if (!row) return res.status(404).json({ error: 'workflow not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// PATCH /api/builder/workflows/:id — update an existing saved workflow
router.patch('/workflows/:id', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const parsed = WorkflowUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });
    }
    const v = parsed.data;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (v.name !== undefined) patch.name = v.name;
    if (v.processType !== undefined) patch.processType = v.processType;
    if (v.jurisdiction !== undefined) patch.jurisdiction = v.jurisdiction;
    if (v.description !== undefined) patch.description = v.description;
    if (v.draft !== undefined) patch.draft = v.draft;
    if (v.source !== undefined) patch.source = v.source;
    if (v.sourceTemplateId !== undefined) patch.sourceTemplateId = v.sourceTemplateId;

    const [row] = await tenantDb(tenantId, (db) => db
      .update(processWorkflows)
      .set(patch)
      .where(and(eq(processWorkflows.id, id), eq(processWorkflows.tenantId, tenantId)))
      .returning());
    if (!row) return res.status(404).json({ error: 'workflow not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// POST /api/builder/workflows — upsert by (tenantId, name)
router.post('/workflows', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const parsed = WorkflowSaveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });
    }
    const v = parsed.data;
    const [row] = await tenantDb(tenantId, (db) => db
      .insert(processWorkflows)
      .values({
        tenantId,
        name: v.name,
        processType: v.processType,
        jurisdiction: v.jurisdiction,
        description: v.description ?? null,
        draft: v.draft as Record<string, unknown>,
        source: v.source,
        sourceTemplateId: v.sourceTemplateId ?? null,
      })
      .onConflictDoUpdate({
        target: [processWorkflows.tenantId, processWorkflows.name],
        set: {
          processType: v.processType,
          jurisdiction: v.jurisdiction,
          description: v.description ?? null,
          draft: v.draft as Record<string, unknown>,
          source: v.source,
          sourceTemplateId: v.sourceTemplateId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning());
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// DELETE /api/builder/workflows/:id
router.delete('/workflows/:id', async (req, res) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const [row] = await tenantDb(tenantId, (db) => db
      .delete(processWorkflows)
      .where(and(eq(processWorkflows.id, id), eq(processWorkflows.tenantId, tenantId)))
      .returning());
    if (!row) return res.status(404).json({ error: 'workflow not found' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
