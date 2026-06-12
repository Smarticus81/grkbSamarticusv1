import { Router } from 'express';
import { z } from 'zod';
import { renderAuditPackMarkdown, type ObligationLookup } from '@regground/core';
import { getContext } from '../context.js';

const router: Router = Router();
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

router.get('/:processInstanceId', async (req, res) => {
  const processInstanceId = req.params.processInstanceId!;
  if (!isUuid(processInstanceId)) return res.json([]);
  try {
    const chain = await getContext().traceService.getTraceChain(processInstanceId);
    res.json(chain);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not load trace.' });
  }
});

router.get('/:processInstanceId/verify', async (req, res) => {
  const processInstanceId = req.params.processInstanceId!;
  if (!isUuid(processInstanceId)) return res.json(emptyVerification());
  try {
    const verification = await getContext().chainVerifier.verifyChain(processInstanceId);
    res.json(verification);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Could not verify trace.' });
  }
});

router.get('/:processInstanceId/export.jsonl', async (req, res) => {
  if (!isUuid(req.params.processInstanceId!)) return res.status(404).json({ error: 'trace not found' });
  const jsonl = await getContext().traceExporter.toJSONL(req.params.processInstanceId!);
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.send(jsonl);
});

router.get('/:processInstanceId/export.dot', async (req, res) => {
  if (!isUuid(req.params.processInstanceId!)) return res.status(404).json({ error: 'trace not found' });
  const dot = await getContext().traceExporter.toDOT(req.params.processInstanceId!);
  res.setHeader('Content-Type', 'text/vnd.graphviz');
  res.send(dot);
});

router.get('/:processInstanceId/audit-report', async (req, res) => {
  if (!isUuid(req.params.processInstanceId!)) return res.status(404).json({ error: 'trace not found' });
  const report = await getContext().traceExporter.toAuditReport(req.params.processInstanceId!);
  res.json(report);
});

const auditPackQuerySchema = z.object({
  format: z.enum(['json', 'markdown']).default('json'),
  include: z.enum(['markdown']).optional(),
  download: z.enum(['1', 'true']).optional(),
});

/** Graph-backed obligation enrichment; assembleAuditPack downgrades to a note if it throws. */
export function graphObligationLookup(): ObligationLookup {
  return async (obligationId: string) => {
    const node = await getContext().graph.getObligation(obligationId);
    if (!node) return null;
    return {
      title: node.title,
      sourceCitation: node.sourceCitation,
      jurisdiction: node.jurisdiction,
      mandatory: node.mandatory,
    };
  };
}

router.get('/:processInstanceId/audit-pack', async (req, res) => {
  const processInstanceId = req.params.processInstanceId!;
  if (!isUuid(processInstanceId)) return res.status(404).json({ error: 'trace not found' });

  const query = auditPackQuerySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: 'Invalid query', issues: query.error.issues });
  }
  const { format, include, download } = query.data;

  try {
    const pack = await getContext().traceExporter.toAuditPack(
      processInstanceId,
      graphObligationLookup(),
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

export default router;
