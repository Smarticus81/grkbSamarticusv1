import { Router } from 'express';
import { getContext } from '../context.js';

const router: Router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export default router;
