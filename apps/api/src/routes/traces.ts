import { Router } from 'express';
import { getContext } from '../context.js';

const router: Router = Router();

router.get('/:processInstanceId', async (req, res) => {
  const chain = await getContext().traceService.getTraceChain(req.params.processInstanceId!);
  res.json(chain);
});

router.get('/:processInstanceId/verify', async (req, res) => {
  const verification = await getContext().chainVerifier.verifyChain(req.params.processInstanceId!);
  res.json(verification);
});

router.get('/:processInstanceId/export.jsonl', async (req, res) => {
  const jsonl = await getContext().traceExporter.toJSONL(req.params.processInstanceId!);
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.send(jsonl);
});

router.get('/:processInstanceId/export.dot', async (req, res) => {
  const dot = await getContext().traceExporter.toDOT(req.params.processInstanceId!);
  res.setHeader('Content-Type', 'text/vnd.graphviz');
  res.send(dot);
});

router.get('/:processInstanceId/audit-report', async (req, res) => {
  const report = await getContext().traceExporter.toAuditReport(req.params.processInstanceId!);
  res.json(report);
});

export default router;
