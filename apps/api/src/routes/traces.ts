import { Router } from 'express';
import { z } from 'zod';
import {
  ChainVerifier,
  renderAuditPackMarkdown,
  type DecisionTraceEntry,
  type ObligationLookup,
} from '@regground/core';
import { getContext, type AppContext } from '../context.js';

// Plain UUIDs (sandbox/process runs) plus the PSUR demo's prefixed form
// ("psur-demo-<uuid>") so demo chains are viewable/exportable via the same
// trace surface (TraceExplorer, audit-pack export) for signed-in users.
const UUID_RE =
  /^(psur-demo-)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function emptyVerification() {
  return {
    valid: true,
    verifiedEntries: 0,
    totalEntries: 0,
    signatureHash: '',
  };
}

function requestTenantId(req: Express.Request): string | null {
  return req.tenantId ?? req.user?.tenantId ?? null;
}

function sameTenant(chain: DecisionTraceEntry[], tenantId: string): boolean {
  return chain.length > 0 && chain.every((entry) => entry.tenantId === tenantId);
}

const auditPackQuerySchema = z.object({
  format: z.enum(['json', 'markdown']).default('json'),
  include: z.enum(['markdown']).optional(),
  download: z.enum(['1', 'true']).optional(),
});

export interface TraceRouterOptions {
  context?: AppContext;
}

/** Graph-backed obligation enrichment; assembleAuditPack downgrades to a note if it throws. */
export function graphObligationLookup(context: AppContext = getContext()): ObligationLookup {
  return async (obligationId: string) => {
    const node = await context.graph.getObligation(obligationId);
    if (!node) return null;
    return {
      title: node.title,
      sourceCitation: node.sourceCitation,
      jurisdiction: node.jurisdiction,
      mandatory: node.mandatory,
    };
  };
}

export function createTracesRouter(opts: TraceRouterOptions = {}): Router {
  const router: Router = Router();
  const ctx = () => opts.context ?? getContext();

  async function authorizedChain(
    req: Express.Request,
    processInstanceId: string,
  ): Promise<{ status: 200; chain: DecisionTraceEntry[] } | { status: 403 | 404; error: string }> {
    if (!isUuid(processInstanceId)) return { status: 404, error: 'trace not found' };
    const tenantId = requestTenantId(req);
    if (!tenantId) return { status: 403, error: 'no tenant context' };
    const chain = await ctx().traceService.getTraceChain(processInstanceId);
    if (!sameTenant(chain, tenantId)) return { status: 404, error: 'trace not found' };
    return { status: 200, chain };
  }

  router.get('/:processInstanceId', async (req, res) => {
    const processInstanceId = req.params.processInstanceId!;
    if (!isUuid(processInstanceId)) return res.json([]);
    try {
      const auth = await authorizedChain(req, processInstanceId);
      if (auth.status !== 200) return res.status(auth.status).json({ error: auth.error });
      res.json(auth.chain);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Could not load trace.' });
    }
  });

  router.get('/:processInstanceId/verify', async (req, res) => {
    const processInstanceId = req.params.processInstanceId!;
    if (!isUuid(processInstanceId)) return res.json(emptyVerification());
    try {
      const auth = await authorizedChain(req, processInstanceId);
      if (auth.status !== 200) return res.status(auth.status).json({ error: auth.error });
      res.json(new ChainVerifier().verifyEntries(auth.chain));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Could not verify trace.' });
    }
  });

  router.get('/:processInstanceId/export.jsonl', async (req, res) => {
    const processInstanceId = req.params.processInstanceId!;
    try {
      const auth = await authorizedChain(req, processInstanceId);
      if (auth.status !== 200) return res.status(auth.status).json({ error: auth.error });
      const jsonl = await ctx().traceExporter.toJSONL(processInstanceId);
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.send(jsonl);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Could not export trace.' });
    }
  });

  router.get('/:processInstanceId/export.dot', async (req, res) => {
    const processInstanceId = req.params.processInstanceId!;
    try {
      const auth = await authorizedChain(req, processInstanceId);
      if (auth.status !== 200) return res.status(auth.status).json({ error: auth.error });
      const dot = await ctx().traceExporter.toDOT(processInstanceId);
      res.setHeader('Content-Type', 'text/vnd.graphviz');
      res.send(dot);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Could not export trace.' });
    }
  });

  router.get('/:processInstanceId/audit-report', async (req, res) => {
    const processInstanceId = req.params.processInstanceId!;
    try {
      const auth = await authorizedChain(req, processInstanceId);
      if (auth.status !== 200) return res.status(auth.status).json({ error: auth.error });
      const report = await ctx().traceExporter.toAuditReport(processInstanceId);
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Could not build audit report.' });
    }
  });

  router.get('/:processInstanceId/audit-pack', async (req, res) => {
    const processInstanceId = req.params.processInstanceId!;

    const query = auditPackQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({ error: 'Invalid query', issues: query.error.issues });
    }
    const { format, include, download } = query.data;

    try {
      const auth = await authorizedChain(req, processInstanceId);
      if (auth.status !== 200) return res.status(auth.status).json({ error: auth.error });

      const pack = await ctx().traceExporter.toAuditPack(
        processInstanceId,
        graphObligationLookup(ctx()),
      );

      if (format === 'markdown') {
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        if (download) {
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="audit-pack-${processInstanceId}.md"`,
          );
        }
        return res.send(renderAuditPackMarkdown(pack));
      }

      if (download) {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="audit-pack-${processInstanceId}.json"`,
        );
      }
      if (include === 'markdown') {
        return res.json({ ...pack, markdown: renderAuditPackMarkdown(pack) });
      }
      return res.json(pack);
    } catch (err) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Could not build audit pack.' });
    }
  });

  return router;
}

export default createTracesRouter();
