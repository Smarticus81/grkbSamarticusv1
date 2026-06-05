/**
 * Managed Agents routes — deploy Builder agents to Claude Managed Agents,
 * start sessions, stream events, and track runs.
 *
 * Mounted under /api/builder alongside the existing builder routes.
 *
 * - POST   /agents/:id/deploy            deploy to Claude Managed Agents
 * - POST   /agents/:id/runs              start a new managed session
 * - GET    /agents/:id/runs              list runs for this agent
 * - GET    /agents/:id/runs/:runId       get run status
 * - GET    /agents/:id/runs/:runId/stream  SSE event stream for a run
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  getDB,
  schema,
  eq,
  and,
  desc,
  ManagedAgentClient,
  ManagedAgentError,
} from '@regground/core';
import { buildPromptManifest } from '../services/ManagedAgentPromptManifest.js';

const { builderAgents, managedAgentRuns } = schema;

const router: Router = Router();

function requireTenantId(req: Request): string {
  const tenantId = (req as unknown as { tenantId?: string }).tenantId;
  if (!tenantId) throw new Error('Missing tenantId on request');
  return tenantId;
}

/** Lazily created client — fails early if ANTHROPIC_API_KEY is missing. */
let _client: ManagedAgentClient | null = null;
function getClient(): ManagedAgentClient {
  if (!_client) _client = ManagedAgentClient.fromEnv();
  return _client;
}

// ─────────────────────────────────────────────────────────────────────────
// POST /agents/:id/deploy
// Creates (or re-creates) the Claude agent + environment for this builder
// agent and stores the provider ids on the row.
// ─────────────────────────────────────────────────────────────────────────

const DeploySchema = z.object({
  model: z.string().max(64).optional(),
  networking: z.enum(['none', 'restricted', 'unrestricted']).default('unrestricted'),
});

router.post('/agents/:id/deploy', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    const parsed = DeploySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });

    const db = getDB();
    const [agent] = await db
      .select()
      .from(builderAgents)
      .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
      .limit(1);
    if (!agent) return res.status(404).json({ error: 'agent not found' });

    const client = getClient();
    const manifest = buildPromptManifest(agent, { model: parsed.data.model });

    let providerAgent: Awaited<ReturnType<ManagedAgentClient['createAgent']>> | null = null;
    try {
      // Create the provider agent
      providerAgent = await client.createAgent({
        name: manifest.agentName,
        model: manifest.model,
        system: manifest.system,
        tools: client.config.defaultTools,
      });
    } catch (e) {
      throw e;
    }

    let providerEnv: Awaited<ReturnType<ManagedAgentClient['createEnvironment']>>;
    try {
      // Create the environment
      providerEnv = await client.createEnvironment({
        name: `${manifest.agentName}-env`,
        config: {
          type: 'cloud',
          networking: { type: parsed.data.networking },
        },
      });
    } catch (e) {
      // Avoid leaving orphaned provider agents when environment creation fails.
      await client.deleteAgent(providerAgent.id).catch(() => undefined);
      throw e;
    }

    // Persist runtime metadata
    const runtime = {
      provider: 'claude-managed-agents' as const,
      agentId: providerAgent.id,
      agentVersion: providerAgent.version,
      environmentId: providerEnv.id,
      deployedAt: new Date().toISOString(),
    };

    const [updated] = await db
      .update(builderAgents)
      .set({
        deployTarget: 'claude-managed-agents',
        providerRuntime: runtime,
        updatedAt: new Date(),
      })
      .where(eq(builderAgents.id, id))
      .returning();

    res.json({
      agent: updated,
      deployment: {
        externalAgentId: providerAgent.id,
        externalAgentVersion: providerAgent.version,
        externalEnvironmentId: providerEnv.id,
        model: manifest.model,
        systemPromptLength: manifest.system.length,
      },
    });
  } catch (e) {
    if (e instanceof ManagedAgentError) {
      return res.status(e.statusCode >= 400 ? e.statusCode : 502).json({
        error: 'managed_agent_api_error',
        message: e.message,
        statusCode: e.statusCode,
      });
    }
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /agents/:id/runs
// Start a new managed agent session. Creates a session on Anthropic,
// sends the initial user message, and returns the run record.
// ─────────────────────────────────────────────────────────────────────────

const RunSchema = z.object({
  message: z.string().min(1).max(32000),
});

router.post('/agents/:id/runs', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    const parsed = RunSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });

    const db = getDB();
    const [agent] = await db
      .select()
      .from(builderAgents)
      .where(and(eq(builderAgents.id, id), eq(builderAgents.tenantId, tenantId)))
      .limit(1);
    if (!agent) return res.status(404).json({ error: 'agent not found' });

    const runtime = agent.providerRuntime as {
      agentId: string;
      agentVersion?: number;
      environmentId: string;
    } | null;

    if (!runtime?.agentId || !runtime?.environmentId) {
      return res.status(409).json({
        error: 'not_deployed',
        message: 'Agent has not been deployed. Call POST /agents/:id/deploy first.',
      });
    }

    const client = getClient();

    // Create session
    const session = await client.createSession({
      agent: runtime.agentId,
      environment_id: runtime.environmentId,
      title: `${agent.name} run`,
    });

    // Create run record
    const [run] = await db
      .insert(managedAgentRuns)
      .values({
        tenantId,
        builderAgentId: id,
        provider: 'claude-managed-agents',
        externalAgentId: runtime.agentId,
        externalAgentVersion: runtime.agentVersion ?? null,
        externalEnvironmentId: runtime.environmentId,
        externalSessionId: session.id,
        status: 'running',
        inputSnapshot: { message: parsed.data.message },
      })
      .returning();

    // Send the user message
    await client.sendEvents(session.id, {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text: parsed.data.message }],
        },
      ],
    });

    res.status(201).json(run);
  } catch (e) {
    if (e instanceof ManagedAgentError) {
      return res.status(e.statusCode >= 400 ? e.statusCode : 502).json({
        error: 'managed_agent_api_error',
        message: e.message,
      });
    }
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /agents/:id/runs
// ─────────────────────────────────────────────────────────────────────────

router.get('/agents/:id/runs', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    const rows = await getDB()
      .select()
      .from(managedAgentRuns)
      .where(
        and(
          eq(managedAgentRuns.builderAgentId, id),
          eq(managedAgentRuns.tenantId, tenantId),
        ),
      )
      .orderBy(desc(managedAgentRuns.createdAt))
      .limit(50);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /agents/:id/runs/:runId
// ─────────────────────────────────────────────────────────────────────────

router.get('/agents/:id/runs/:runId', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const runId = req.params.runId;
    if (!runId) return res.status(400).json({ error: 'runId required' });

    const [run] = await getDB()
      .select()
      .from(managedAgentRuns)
      .where(
        and(
          eq(managedAgentRuns.id, runId),
          eq(managedAgentRuns.builderAgentId, req.params.id ?? ''),
          eq(managedAgentRuns.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!run) return res.status(404).json({ error: 'run not found' });
    res.json(run);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /agents/:id/runs/:runId/stream
// SSE event stream — proxies the Managed Agents session stream and
// persists events/output to the run record when the session goes idle.
// ─────────────────────────────────────────────────────────────────────────

router.get('/agents/:id/runs/:runId/stream', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req);
    const runId = req.params.runId;
    if (!runId) return res.status(400).json({ error: 'runId required' });

    const db = getDB();
    const [run] = await db
      .select()
      .from(managedAgentRuns)
      .where(
        and(
          eq(managedAgentRuns.id, runId),
          eq(managedAgentRuns.builderAgentId, req.params.id ?? ''),
          eq(managedAgentRuns.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!run) return res.status(404).json({ error: 'run not found' });
    if (!run.externalSessionId) {
      return res.status(409).json({ error: 'no_session', message: 'Run has no external session.' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const client = getClient();
    const eventLog: unknown[] = [];
    let outputText = '';

    try {
      for await (const event of client.streamEvents(run.externalSessionId)) {
        eventLog.push(event);

        // Forward every event to the SSE client
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);

        // Accumulate text output
        if (event.type === 'agent.message' && Array.isArray(event.content)) {
          for (const block of event.content) {
            if (block.type === 'text') outputText += block.text;
          }
        }

        // Session finished
        if (event.type === 'session.status_idle' || event.type === 'session.status_failed') {
          const status = event.type === 'session.status_idle' ? 'completed' : 'failed';
          await db
            .update(managedAgentRuns)
            .set({
              status,
              outputSnapshot: { text: outputText },
              eventLog,
              finishedAt: new Date(),
            })
            .where(eq(managedAgentRuns.id, runId));

          res.write(`event: stream.end\ndata: ${JSON.stringify({ status })}\n\n`);
          break;
        }
      }
    } catch (streamErr) {
      // If the upstream stream errors, persist what we have and notify the client
      await db
        .update(managedAgentRuns)
        .set({
          status: 'failed',
          outputSnapshot: { text: outputText, error: String(streamErr) },
          eventLog,
          finishedAt: new Date(),
        })
        .where(eq(managedAgentRuns.id, runId));

      const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
      res.write(`event: stream.error\ndata: ${JSON.stringify({ error: errMsg })}\n\n`);
    }

    res.end();
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  }
});

export default router;
