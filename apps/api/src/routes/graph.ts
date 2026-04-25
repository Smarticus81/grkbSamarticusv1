import { Router } from 'express';
import { z } from 'zod';
import { getContext } from '../context.js';

const router: Router = Router();

// ── Core CRUD ──────────────────────────────────────────────

router.get('/obligations', async (req, res) => {
  const processType = String(req.query.processType ?? '');
  const jurisdiction = String(req.query.jurisdiction ?? 'GLOBAL');
  if (!processType) return res.status(400).json({ error: 'processType required' });
  const obligations = await getContext().graph.getObligationsForProcess(processType, jurisdiction);
  res.json({ obligations });
});

router.get('/obligations/:id', async (req, res) => {
  const obl = await getContext().graph.getObligation(req.params.id!);
  if (!obl) return res.status(404).json({ error: 'not found' });
  res.json(obl);
});

router.get('/obligations/:id/explain', async (req, res) => {
  try {
    const explanation = await getContext().graph.explainObligation(req.params.id!);
    res.json(explanation);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

const UpsertSchema = z.object({
  obligationId: z.string(),
  jurisdiction: z.string(),
  artifactType: z.string(),
  processType: z.string(),
  kind: z.enum(['obligation', 'constraint', 'definition']),
  title: z.string(),
  text: z.string(),
  sourceCitation: z.string(),
  version: z.string(),
  mandatory: z.boolean().default(true),
  requiredEvidenceTypes: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

router.post('/obligations', async (req, res) => {
  const parsed = UpsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
  await getContext().graph.upsertObligation(parsed.data);
  res.status(201).json({ ok: true });
});

router.delete('/obligations/:id', async (req, res) => {
  await getContext().graph.deleteObligation(req.params.id!);
  res.status(204).end();
});

// ── External Agent API ─────────────────────────────────────
// These endpoints are designed for external agents/models to
// query the obligation graph for compliance guidance.

/**
 * POST /api/graph/query
 * General-purpose obligation query for external agents.
 * Returns obligations + constraints + evidence requirements for a process/jurisdiction.
 */
const QuerySchema = z.object({
  processType: z.string(),
  jurisdiction: z.string().default('GLOBAL'),
  mandatory_only: z.boolean().default(false),
  include_constraints: z.boolean().default(true),
  include_evidence: z.boolean().default(true),
});

router.post('/query', async (req, res) => {
  const parsed = QuerySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
  const { processType, jurisdiction, mandatory_only, include_constraints, include_evidence } = parsed.data;

  const ctx = getContext();
  let obligations = await ctx.graph.getObligationsForProcess(processType, jurisdiction);
  if (mandatory_only) {
    obligations = obligations.filter((o) => o.mandatory);
  }

  const result: Record<string, unknown> = {
    processType,
    jurisdiction,
    obligationCount: obligations.length,
    obligations: obligations.map((o) => ({
      obligationId: o.obligationId,
      title: o.title,
      text: o.text,
      sourceCitation: o.sourceCitation,
      mandatory: o.mandatory,
      requiredEvidenceTypes: o.requiredEvidenceTypes,
    })),
  };

  if (include_constraints) {
    const allConstraints: Array<Record<string, unknown>> = [];
    for (const o of obligations) {
      const constraints = await ctx.graph.getConstraints(o.obligationId);
      for (const c of constraints) {
        allConstraints.push({
          constraintId: c.constraintId,
          obligationId: o.obligationId,
          text: c.text,
          severity: c.severity,
          expression: c.expression,
        });
      }
    }
    result.constraints = allConstraints;
    result.constraintCount = allConstraints.length;
  }

  if (include_evidence) {
    const evidenceSet = new Set<string>();
    for (const o of obligations) {
      for (const et of o.requiredEvidenceTypes) evidenceSet.add(et);
      const more = await ctx.graph.getRequiredEvidence(o.obligationId);
      for (const et of more) evidenceSet.add(et);
    }
    result.requiredEvidenceTypes = Array.from(evidenceSet);
  }

  res.json(result);
});

/**
 * POST /api/graph/compliance-check
 * Check whether a proposed action or output covers required obligations.
 * External agents call this before/after performing QMS actions.
 */
const ComplianceCheckSchema = z.object({
  processType: z.string(),
  jurisdiction: z.string().default('GLOBAL'),
  addressedObligationIds: z.array(z.string()),
  providedEvidenceTypes: z.array(z.string()).default([]),
});

router.post('/compliance-check', async (req, res) => {
  const parsed = ComplianceCheckSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
  const { processType, jurisdiction, addressedObligationIds, providedEvidenceTypes } = parsed.data;

  const ctx = getContext();
  const allObligations = await ctx.graph.getObligationsForProcess(processType, jurisdiction);
  const mandatoryObligations = allObligations.filter((o) => o.mandatory);

  const addressedSet = new Set(addressedObligationIds);
  const providedEvidenceSet = new Set(providedEvidenceTypes);

  const coveredObligations = mandatoryObligations.filter((o) => addressedSet.has(o.obligationId));
  const missingObligations = mandatoryObligations.filter((o) => !addressedSet.has(o.obligationId));

  // Check evidence coverage
  const requiredEvidence = new Set<string>();
  for (const o of mandatoryObligations) {
    for (const et of o.requiredEvidenceTypes) requiredEvidence.add(et);
  }
  const missingEvidence = Array.from(requiredEvidence).filter((et) => !providedEvidenceSet.has(et));

  const coverage = mandatoryObligations.length > 0
    ? coveredObligations.length / mandatoryObligations.length
    : 1;

  res.json({
    compliant: missingObligations.length === 0 && missingEvidence.length === 0,
    coverage: Math.round(coverage * 100),
    totalMandatory: mandatoryObligations.length,
    covered: coveredObligations.length,
    missingObligations: missingObligations.map((o) => ({
      obligationId: o.obligationId,
      title: o.title,
      sourceCitation: o.sourceCitation,
    })),
    missingEvidence,
  });
});

/**
 * POST /api/graph/schedule-cadence
 * Get regulatory reporting cadence for a process type.
 * Useful for agents building PMS schedules, PSUR timelines, etc.
 */
const CadenceSchema = z.object({
  processType: z.string(),
  jurisdiction: z.string().default('GLOBAL'),
});

router.post('/schedule-cadence', async (req, res) => {
  const parsed = CadenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
  const { processType, jurisdiction } = parsed.data;

  const ctx = getContext();
  const obligations = await ctx.graph.getObligationsForProcess(processType, jurisdiction);

  // Extract cadence-related obligations (look for timing/schedule metadata)
  const cadenceItems = obligations
    .filter((o) => {
      const text = `${o.title} ${o.text}`.toLowerCase();
      return text.includes('period') || text.includes('interval') || text.includes('annual')
        || text.includes('report') || text.includes('review') || text.includes('schedule')
        || text.includes('timeframe') || text.includes('deadline') || text.includes('frequency');
    })
    .map((o) => ({
      obligationId: o.obligationId,
      title: o.title,
      text: o.text,
      sourceCitation: o.sourceCitation,
      mandatory: o.mandatory,
      metadata: o.metadata,
    }));

  res.json({
    processType,
    jurisdiction,
    cadenceObligations: cadenceItems,
    totalRelevant: cadenceItems.length,
    allObligationCount: obligations.length,
  });
});

/**
 * POST /api/graph/evidence-map
 * Map which evidence types satisfy which obligations for a process.
 * External agents use this to understand what evidence to collect.
 */
const EvidenceMapSchema = z.object({
  processType: z.string(),
  jurisdiction: z.string().default('GLOBAL'),
});

router.post('/evidence-map', async (req, res) => {
  const parsed = EvidenceMapSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });
  const { processType, jurisdiction } = parsed.data;

  const ctx = getContext();
  const obligations = await ctx.graph.getObligationsForProcess(processType, jurisdiction);

  const evidenceToObligations: Record<string, string[]> = {};
  const obligationToEvidence: Record<string, string[]> = {};

  for (const o of obligations) {
    const evidenceTypes = new Set(o.requiredEvidenceTypes);
    const moreEvidence = await ctx.graph.getRequiredEvidence(o.obligationId);
    for (const et of moreEvidence) evidenceTypes.add(et);

    obligationToEvidence[o.obligationId] = Array.from(evidenceTypes);
    for (const et of evidenceTypes) {
      if (!evidenceToObligations[et]) evidenceToObligations[et] = [];
      evidenceToObligations[et].push(o.obligationId);
    }
  }

  res.json({
    processType,
    jurisdiction,
    evidenceToObligations,
    obligationToEvidence,
    uniqueEvidenceTypes: Object.keys(evidenceToObligations),
    totalObligations: obligations.length,
  });
});

/**
 * POST /api/graph/explain-path
 * Find the relationship path between two obligations.
 * Helps agents understand regulatory cross-references.
 */
const PathSchema = z.object({
  fromObligationId: z.string(),
  toObligationId: z.string(),
});

router.post('/explain-path', async (req, res) => {
  const parsed = PathSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.errors });

  const ctx = getContext();
  const path = await ctx.graph.findPath(parsed.data.fromObligationId, parsed.data.toObligationId);
  res.json(path);
});

/**
 * GET /api/graph/process-types
 * List all distinct process types in the graph.
 */
router.get('/process-types', async (_req, res) => {
  const ctx = getContext();
  // Query all unique processType values from the graph
  const driver = (ctx.graph as any).driver;
  const database = (ctx.graph as any).database ?? 'neo4j';
  const session = driver.session({ database });
  try {
    const result = await session.run(
      `MATCH (o:Obligation) RETURN DISTINCT o.processType AS processType ORDER BY processType`,
    );
    const types = result.records.map((r: any) => r.get('processType') as string).filter(Boolean);
    res.json({ processTypes: types });
  } finally {
    await session.close();
  }
});

/**
 * GET /api/graph/stats
 * Graph statistics — obligation count, jurisdiction spread, etc.
 */
router.get('/stats', async (_req, res) => {
  const ctx = getContext();
  const driver = (ctx.graph as any).driver;
  const database = (ctx.graph as any).database ?? 'neo4j';
  const session = driver.session({ database });
  const toNum = (v: any) => v?.toNumber?.() ?? v ?? 0;
  try {
    const obligationRes = await session.run(
      `MATCH (o:Obligation) RETURN count(o) AS total`,
    );
    const obligations = toNum(obligationRes.records[0]?.get('total'));

    const regulationRes = await session.run(
      `MATCH (o:Obligation)
       WITH coalesce(o.regulation, o.artifactType, o.jurisdiction) AS reg
       WHERE reg IS NOT NULL
       RETURN count(DISTINCT reg) AS total`,
    );
    const regulations = toNum(regulationRes.records[0]?.get('total'));

    const evidenceRes = await session.run(
      `MATCH (e:EvidenceType) RETURN count(e) AS total`,
    );
    const evidenceTypes = toNum(evidenceRes.records[0]?.get('total'));

    const jurisdictionRes = await session.run(
      `MATCH (o:Obligation) RETURN o.jurisdiction AS jurisdiction, count(o) AS count ORDER BY count DESC`,
    );
    const jurisdictions = jurisdictionRes.records.map((r: any) => ({
      jurisdiction: r.get('jurisdiction'),
      count: toNum(r.get('count')),
    }));

    const processRes = await session.run(
      `MATCH (o:Obligation) RETURN o.processType AS processType, count(o) AS count ORDER BY count DESC`,
    );
    const processTypes = processRes.records.map((r: any) => ({
      processType: r.get('processType'),
      count: toNum(r.get('count')),
    }));

    res.json({
      regulations,
      obligations,
      evidenceTypes,
      // legacy aliases
      total: obligations,
      jurisdictions,
      processTypes,
    });
  } finally {
    await session.close();
  }
});

/**
 * GET /api/graph/obligations-by-regulation
 * Returns all obligations grouped by their source regulation (artifactType).
 */
router.get('/obligations-by-regulation', async (_req, res) => {
  const ctx = getContext();
  const driver = (ctx.graph as any).driver;
  const database = (ctx.graph as any).database ?? 'neo4j';
  const session = driver.session({ database });
  try {
    const result = await session.run(
      `MATCH (o:Obligation)
       RETURN o.obligationId AS id, o.title AS title, o.text AS text,
              o.sourceCitation AS citation, o.jurisdiction AS jurisdiction,
              o.processType AS processType, o.artifactType AS artifactType,
              o.kind AS kind, o.mandatory AS mandatory
       ORDER BY o.artifactType, o.obligationId`,
    );
    const obligations = result.records.map((r: any) => ({
      id: r.get('id'),
      title: r.get('title'),
      text: r.get('text'),
      citation: r.get('citation'),
      jurisdiction: r.get('jurisdiction'),
      processType: r.get('processType'),
      artifactType: r.get('artifactType'),
      kind: r.get('kind'),
      mandatory: r.get('mandatory') ?? true,
    }));

    // Group by regulation (artifactType)
    const grouped: Record<string, typeof obligations> = {};
    for (const o of obligations) {
      const key = o.artifactType || o.citation?.split(' ')[0] || 'Unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(o);
    }

    res.json({ regulations: grouped, total: obligations.length });
  } finally {
    await session.close();
  }
});

export default router;
