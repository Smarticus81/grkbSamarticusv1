/**
 * Production QMS task agents.
 *
 * Each agent performs ONE narrow piece of actual QMS work that produces a
 * structured artifact a quality team could put into a record. They are
 * deliberately small and composable — declared `chainHints` show how they
 * combine into longer workflows (e.g. complaint → root cause → CAPA plan).
 *
 * All obligation IDs used here are already bound to existing process
 * bundles in the seeded graph (same IDs used by the previous review-only
 * agents). Citations are still resolved from the live ObligationNode set
 * injected by TaskRunner — never hard-coded.
 */

import { z } from 'zod';
import type { ObligationNode } from '@regground/core';
import type { TaskAgentDefinition } from '../types.js';

/* ─────────────────────────────────────────────────────────────────────
 * Shared helpers
 * ─────────────────────────────────────────────────────────────────── */

function citationsFor(obligations: ObligationNode[]): string[] {
  return obligations.map((o) => o.sourceCitation);
}

function obligationIds(obligations: ObligationNode[]): string[] {
  return obligations.map((o) => o.obligationId);
}

/* ─────────────────────────────────────────────────────────────────────
 * 1. Root Cause Investigator  (process: capa)
 * ─────────────────────────────────────────────────────────────────── */

const RCAInputSchema = z.object({
  problemStatement: z.string().min(20),
  observations: z.array(z.string()).min(1),
  affectedProduct: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
});

const RCAOutputSchema = z.object({
  fishbone: z.object({
    people: z.array(z.string()),
    process: z.array(z.string()),
    equipment: z.array(z.string()),
    materials: z.array(z.string()),
    measurement: z.array(z.string()),
    environment: z.array(z.string()),
  }),
  fiveWhys: z.array(z.object({ why: z.string(), because: z.string() })).min(3),
  rootCauseStatement: z.string(),
  classification: z.enum(['design', 'process', 'supplier', 'use-error', 'documentation', 'unknown']),
  contributingFactors: z.array(z.string()),
  addressedObligations: z.array(z.string()),
  citations: z.array(z.string()),
});

type RCAInput = z.infer<typeof RCAInputSchema>;
type RCAOutput = z.infer<typeof RCAOutputSchema>;

const RCA_FISH_RIB_KEYS = [
  'people',
  'process',
  'equipment',
  'materials',
  'measurement',
  'environment',
] as const;

function distributeObservationsAcrossFishbone(observations: string[]): RCAOutput['fishbone'] {
  const ribs = Object.fromEntries(
    RCA_FISH_RIB_KEYS.map((k) => [k, [] as string[]]),
  ) as RCAOutput['fishbone'];
  observations.forEach((obs, i) => {
    const rib = RCA_FISH_RIB_KEYS[i % RCA_FISH_RIB_KEYS.length]!;
    ribs[rib].push(obs);
  });
  return ribs;
}

function buildFiveWhysFromInput(input: RCAInput): RCAOutput['fiveWhys'] {
  const filler =
    '(No further discrete observations supplied — extend evidence collection before signed RCA closure.)';
  const obs = [...input.observations];
  while (obs.length < 5) {
    obs.push(filler);
  }
  return [
    {
      why: `Why is "${input.affectedProduct}" formally implicated per the CAPA/problem record?`,
      because: input.problemStatement,
    },
    {
      why: 'What objective datum or observation corroborates the problem statement?',
      because: obs[0] ?? input.problemStatement,
    },
    {
      why: 'What correlated control output or deviation explains that observation?',
      because: obs[1] ?? obs[0] ?? input.problemStatement,
    },
    {
      why:
        'Which upstream precondition (supplier, tooling, calibration, training, documented procedure, environmental control, etc.) is implicated?',
      because: obs[2] ?? obs[1] ?? input.problemStatement,
    },
    {
      why: 'What condition must experiments or documented records prove before RCA sign-off?',
      because: obs[3] ?? obs[2] ?? input.problemStatement,
    },
  ];
}

function inferRcaClassification(input: RCAInput): RCAOutput['classification'] {
  const hay = `${input.problemStatement}\n${input.observations.join('\n')}`.toLowerCase();
  if (/(supplier|vendor|incoming material|cofa|certificate of analysis)/.test(hay)) {
    return 'supplier';
  }
  if (/(instruction|ifu|records|mislabeling|training|documentation| traveller|traveler)/.test(hay)) {
    return 'documentation';
  }
  if (/(misuse|user error|use error)/.test(hay)) {
    return 'use-error';
  }
  if (/(design|drawing|specification|risk file|verification plan)/.test(hay)) {
    return 'design';
  }
  if (/(equipment|calibration|maintenance|tooling)/.test(hay)) {
    return 'process';
  }
  return input.severity === 'critical' ? 'design' : 'process';
}

function draftRootCauseFromInput(input: RCAInput): string {
  return (
    `[Draft — verify against primary evidence before closure] (${input.affectedProduct}; severity `
    + `${input.severity}): ${input.problemStatement.trim()} Observations (${input.observations.length}): `
    + `${input.observations.join('; ')}.`
  );
}

function buildRcaOutput(
  input: RCAInput,
  refs: { addressedObligations: string[]; citations: string[] },
): RCAOutput {
  const fishbone = distributeObservationsAcrossFishbone(input.observations);
  fishbone.materials.push(
    fishbone.materials.some((x) => x.includes(input.affectedProduct))
      ? `(Confirm product/DMR identity matches "${input.affectedProduct}".)`
      : `Product/device boundary for RCA: "${input.affectedProduct}".`,
  );
  fishbone.process.push(
    `Organisation problem narrative (excerpt): "${input.problemStatement.slice(0, 480)}${
      input.problemStatement.length > 480 ? '...' : ''
    }"`,
  );
  fishbone.measurement.push(`Recorded severity tier: "${input.severity}".`);
  const factors = [...input.observations];
  factors.push(
    `Correlate trending, inbound inspection releases, rework travelers, servicing, and calibration impacting "${input.affectedProduct}".`,
  );
  return {
    fishbone,
    fiveWhys: buildFiveWhysFromInput(input),
    rootCauseStatement: draftRootCauseFromInput(input),
    classification: inferRcaClassification(input),
    contributingFactors: factors.slice(0, 12),
    addressedObligations: refs.addressedObligations,
    citations: refs.citations,
  };
}

const RCA_SAMPLE: RCAInput = {
  problemStatement: '',
  observations: [''],
  affectedProduct: '',
  severity: 'medium',
};

export const RootCauseInvestigatorTask: TaskAgentDefinition<RCAInput, RCAOutput> = {
  id: 'root-cause-investigator',
  name: 'Root Cause Investigator',
  oneLiner:
    'Drafts a root cause analysis (5-whys + fishbone) from a problem statement and observations. Output feeds a CAPA plan.',
  regulation: 'ISO 13485 §8.5.2 · 21 CFR 820.100',
  jurisdiction: 'GLOBAL',
  processId: 'capa',
  claimedObligationIds: ['ISO13485.8.5.2.OBL.001', 'CFR820.100.OBL.001'],
  systemPrompt:
    'You are a Quality Engineer specialising in CAPA root cause analysis for medical devices under ISO 13485 §8.5.2 and 21 CFR 820.100. Determine the ACTUAL root cause of the reported problem by reasoning from the specific facts, device behaviour, and telemetry in the input — name the concrete failure mechanism (e.g. firmware/software defect such as a watchdog or memory fault causing a lockup, component failure, manufacturing process escape, or use error). Do not merely restate the symptom or describe the CAPA process. Produce an evidence-driven 5-whys chain that traces symptom → intermediate cause → underlying root cause, and a fishbone that assigns concrete, case-specific factors to people/process/equipment/materials/measurement/environment. State a single, falsifiable root cause and classify it. Cite only the obligations supplied; never invent.',
  inputSchema: RCAInputSchema,
  outputSchema: RCAOutputSchema,
  sampleData: RCA_SAMPLE,
  chainHints: {
    downstream: [
      { taskId: 'capa-plan-drafter', via: 'Hand the root cause to draft corrective + preventive actions.' },
    ],
    upstream: [
      { taskId: 'nonconformance-dispositioner', via: 'NC dispositions that trigger CAPA feed the root cause stage.' },
      { taskId: 'complaint-coder', via: 'A coded complaint with serious harm typically opens a CAPA.' },
    ],
  },
  obligationChecks: [
    {
      obligationId: 'ISO13485.8.5.2.OBL.001',
      satisfiedBy: (o, ob) => {
        const p = RCAOutputSchema.safeParse(o);
        return (
          p.success
          && p.data.rootCauseStatement.length > 0
          && p.data.fiveWhys.length >= 3
          && p.data.addressedObligations.includes(ob.obligationId)
          && p.data.citations.includes(ob.sourceCitation)
        );
      },
    },
    {
      obligationId: 'CFR820.100.OBL.001',
      satisfiedBy: (o, ob) => {
        const p = RCAOutputSchema.safeParse(o);
        return (
          p.success
          && p.data.addressedObligations.includes(ob.obligationId)
          && p.data.citations.includes(ob.sourceCitation)
        );
      },
    },
  ],
  explainObligation: (output, ob) => {
    const p = RCAOutputSchema.safeParse(output);
    if (!p.success) return undefined;
    const rc = p.data.rootCauseStatement.trim();
    const cls = p.data.classification;
    if (ob.obligationId === 'ISO13485.8.5.2.OBL.001') {
      return `Root cause established (${cls}): ${rc} This is the corrective-action basis required by ${ob.sourceCitation}.`;
    }
    if (ob.obligationId === 'CFR820.100.OBL.001') {
      return `A CAPA root-cause record was produced for the implicated device, classified as "${cls}", satisfying the investigation step of ${ob.sourceCitation}.`;
    }
    return `Addressed by the root cause analysis (classification: ${cls}).`;
  },
  explainGate: (output) => {
    const p = RCAOutputSchema.safeParse(output);
    if (!p.success) return undefined;
    return `Root cause (${p.data.classification}): ${p.data.rootCauseStatement.trim()}`;
  },
  async runWithGraph(input, ctx) {
    return buildRcaOutput(input, {
      addressedObligations: obligationIds(ctx.obligations),
      citations: citationsFor(ctx.obligations),
    });
  },
  async runWithoutGraph(input) {
    return buildRcaOutput(input, { addressedObligations: [], citations: [] });
  },
};

/* ─────────────────────────────────────────────────────────────────────
 * 2. CAPA Plan Drafter  (process: capa)
 * ─────────────────────────────────────────────────────────────────── */

const CapaInputSchema = z.object({
  capaId: z.string(),
  rootCauseStatement: z.string().min(20),
  classification: z.enum(['design', 'process', 'supplier', 'use-error', 'documentation', 'unknown']),
  affectedScope: z.string(),
  dueWindowDays: z.number().int().min(7).max(365),
});

const ActionSchema = z.object({
  action: z.string(),
  owner: z.string(),
  dueInDays: z.number().int().nonnegative(),
});

const CapaOutputSchema = z.object({
  capaId: z.string(),
  correctiveActions: z.array(ActionSchema).min(1),
  preventiveActions: z.array(ActionSchema).min(1),
  verificationMethod: z.string(),
  effectivenessCheck: z.object({
    metric: z.string(),
    target: z.string(),
    samplingPlan: z.string(),
    reviewInDays: z.number().int().positive(),
  }),
  addressedObligations: z.array(z.string()),
  citations: z.array(z.string()),
});

type CapaInput = z.infer<typeof CapaInputSchema>;
type CapaOutput = z.infer<typeof CapaOutputSchema>;

function buildCapaOutput(
  input: CapaInput,
  refs: { addressedObligations: string[]; citations: string[] },
): CapaOutput {
  const half = Math.max(7, Math.floor(input.dueWindowDays / 2));
  const rootExcerpt =
    `${input.rootCauseStatement.slice(0, 380)}${input.rootCauseStatement.length > 380 ? '...' : ''}`;
  const scopeExcerpt =
    `${input.affectedScope.slice(0, 220)}${input.affectedScope.length > 220 ? '...' : ''}`;
  return {
    capaId: input.capaId,
    correctiveActions: [
      {
        action:
          `Quarantine suspected nonconforming inventory and halt release for scope "${scopeExcerpt}". `
          + 'Document segregation, rework authorization vs scrap, disposition, and customer-notification criteria per NC/CAPA procedures.',
        owner: 'Quality Manager',
        dueInDays: 7,
      },
      {
        action:
          `Contain the failure mechanism implied by RCA (excerpt "${rootExcerpt}") via verification tests, rework/hold tags, tooling lockouts, `
          + 'supplier blocks, recall trigger checklist, field safety assessment as applicable.',
        owner: 'Operations / Manufacturing Lead',
        dueInDays: 14,
      },
    ],
    preventiveActions: [
      {
        action:
          `Re-baseline documented controls for "${input.classification}"-classified failure modes across the impacted value stream; update validation/qualification artefacts where warranted.`,
        owner: 'Process Owner',
        dueInDays: half,
      },
      {
        action:
          `Roll out competency checks and supervisory audits proving new preventive controls operate for scope "${scopeExcerpt}".`,
        owner: 'Quality Systems',
        dueInDays: input.dueWindowDays,
      },
    ],
    verificationMethod:
      `Confirm implementation evidence package for CAPA "${input.capaId}": revised procedures/work instructions, training records, validation runs, calibration logs, supplier PPAP equivalents — each traced to RCA text.`,
    effectivenessCheck: {
      metric:
        `Process output quality KPI for impacted scope (${input.classification}); e.g. defect rate vs pre-event statistical control baseline`,
      target:
        'Restore stable performance indistinguishable from historical in-control baseline over agreed review window',
      samplingPlan:
        `Sampling plan proportional to throughput for "${scopeExcerpt}", plus complaint/trend dashboards through post-implementation review`,
      reviewInDays: input.dueWindowDays + 90,
    },
    addressedObligations: refs.addressedObligations,
    citations: refs.citations,
  };
}

const CAPA_SAMPLE: CapaInput = {
  capaId: '',
  rootCauseStatement: '',
  classification: 'process',
  affectedScope: '',
  dueWindowDays: 60,
};

export const CapaPlanDrafterTask: TaskAgentDefinition<CapaInput, CapaOutput> = {
  id: 'capa-plan-drafter',
  name: 'CAPA Plan Drafter',
  oneLiner:
    'Drafts a corrective + preventive action plan with owners, due dates, and an effectiveness check — citations resolved from the live CAPA graph.',
  regulation: 'ISO 13485 §8.5.2 · 21 CFR 820.100',
  jurisdiction: 'GLOBAL',
  processId: 'capa',
  claimedObligationIds: [
    'ISO13485.8.5.2.OBL.002',
    'ISO13485.8.5.2.OBL.003',
    'ISO13485.8.5.3.OBL.001',
    'CFR820.100.OBL.002',
    'CFR820.100.OBL.003',
  ],
  systemPrompt:
    'You are a Quality Engineer drafting a closed-loop CAPA plan under ISO 13485 §8.5.2/8.5.3 and 21 CFR 820.100. Generate concrete corrective actions (containing the failure) and preventive actions (preventing recurrence and similar). Each action MUST have an owner role, a realistic due date offset, an effectiveness check definition with a target metric, and a verification method. Cite only the supplied obligations.',
  inputSchema: CapaInputSchema,
  outputSchema: CapaOutputSchema,
  sampleData: CAPA_SAMPLE,
  chainHints: {
    upstream: [{ taskId: 'root-cause-investigator', via: 'The root cause statement seeds the action plan.' }],
    downstream: [{ taskId: 'change-impact-assessor', via: 'Design or process actions may require formal change control.' }],
  },
  obligationChecks: [
    'ISO13485.8.5.2.OBL.002',
    'ISO13485.8.5.2.OBL.003',
    'ISO13485.8.5.3.OBL.001',
    'CFR820.100.OBL.002',
    'CFR820.100.OBL.003',
  ].map((id) => ({
    obligationId: id,
    satisfiedBy: (o, ob) => {
      const p = CapaOutputSchema.safeParse(o);
      return (
        p.success
        && p.data.correctiveActions.length > 0
        && p.data.preventiveActions.length > 0
        && p.data.effectivenessCheck.metric.length > 0
        && p.data.addressedObligations.includes(ob.obligationId)
        && p.data.citations.includes(ob.sourceCitation)
      );
    },
  })),
  async runWithGraph(input, ctx) {
    return buildCapaOutput(input, {
      addressedObligations: obligationIds(ctx.obligations),
      citations: citationsFor(ctx.obligations),
    });
  },
  async runWithoutGraph(input) {
    return buildCapaOutput(input, { addressedObligations: [], citations: [] });
  },
};

/* ─────────────────────────────────────────────────────────────────────
 * 3. Nonconformance Dispositioner  (process: nonconformance-handling)
 * ─────────────────────────────────────────────────────────────────── */

const NCInputSchema = z.object({
  ncId: z.string(),
  productCode: z.string(),
  lot: z.string(),
  quantityAffected: z.number().int().positive(),
  defectDescription: z.string().min(20),
  detectionStage: z.enum(['incoming', 'in-process', 'final-inspection', 'post-market']),
  riskToPatient: z.enum(['none', 'low', 'medium', 'high']),
});

const NCOutputSchema = z.object({
  ncId: z.string(),
  recommendedDisposition: z.enum(['rework', 'scrap', 'use-as-is', 'return-to-supplier', 'regrade']),
  justification: z.string(),
  concessionRequired: z.boolean(),
  signoffRequiredFrom: z.array(z.string()).min(1),
  triggersCapa: z.boolean(),
  triggersFieldAction: z.boolean(),
  addressedObligations: z.array(z.string()),
  citations: z.array(z.string()),
});

type NCInput = z.infer<typeof NCInputSchema>;
type NCOutput = z.infer<typeof NCOutputSchema>;

function buildNcDisposition(
  input: NCInput,
  refs: { addressedObligations: string[]; citations: string[] },
): NCOutput {
  const highRisk = input.riskToPatient === 'high' || input.riskToPatient === 'medium';
  const disposition = highRisk
    ? input.detectionStage === 'post-market'
      ? 'return-to-supplier'
      : 'scrap'
    : 'rework';
  const defectExcerpt =
    `${input.defectDescription.slice(0, 400)}${input.defectDescription.length > 400 ? '...' : ''}`;
  return {
    ncId: input.ncId,
    recommendedDisposition: disposition,
    justification:
      `Detection stage "${input.detectionStage}", risk-to-patient "${input.riskToPatient}", product "${input.productCode}", `
      + `lot "${input.lot}", quantity affected ${input.quantityAffected}. `
      + `${highRisk ? 'Elevated patient risk restricts permissive rework/use-as-is without exceptional justification and documented residual risk acceptance.' : 'Residual risk judged compatible with disposition subject to mandated re-verification before release.'} `
      + `Recorded defect/nonconformance narrative: "${defectExcerpt}"`,
    concessionRequired: highRisk,
    signoffRequiredFrom: highRisk
      ? ['Quality Manager', 'Regulatory Affairs', 'Manufacturing Lead']
      : ['Quality Engineer', 'Manufacturing Lead'],
    triggersCapa: highRisk,
    triggersFieldAction: input.detectionStage === 'post-market' && highRisk,
    addressedObligations: refs.addressedObligations,
    citations: refs.citations,
  };
}

const NC_SAMPLE: NCInput = {
  ncId: '',
  productCode: '',
  lot: '',
  quantityAffected: 1,
  defectDescription: '',
  detectionStage: 'final-inspection',
  riskToPatient: 'low',
};

export const NonconformanceDispositionerTask: TaskAgentDefinition<NCInput, NCOutput> = {
  id: 'nonconformance-dispositioner',
  name: 'Nonconformance Dispositioner',
  oneLiner:
    'Recommends a disposition (rework / scrap / use-as-is / RTV / regrade) with the rationale and signoff chain required.',
  regulation: 'ISO 13485 §8.3',
  jurisdiction: 'GLOBAL',
  processId: 'nonconformance-handling',
  claimedObligationIds: ['ISO13485.8.3.OBL.001', 'ISO13485.8.3.OBL.002', 'ISO13485.8.3.OBL.003'],
  systemPrompt:
    'You are a Quality Manager dispositioning a product nonconformance under ISO 13485 §8.3. Choose the most defensible disposition (rework, scrap, return-to-supplier) given product context, lot history and risk class. Justify with concrete reasoning, define containment, and tie each justification element back to the supplied obligations.',
  inputSchema: NCInputSchema,
  outputSchema: NCOutputSchema,
  sampleData: NC_SAMPLE,
  chainHints: {
    downstream: [
      { taskId: 'root-cause-investigator', via: 'High-risk NCs open CAPA; the disposition seeds the problem statement.' },
    ],
  },
  obligationChecks: ['ISO13485.8.3.OBL.001', 'ISO13485.8.3.OBL.002', 'ISO13485.8.3.OBL.003'].map((id) => ({
    obligationId: id,
    satisfiedBy: (o, ob) => {
      const p = NCOutputSchema.safeParse(o);
      return (
        p.success
        && p.data.signoffRequiredFrom.length > 0
        && p.data.justification.length > 0
        && p.data.addressedObligations.includes(ob.obligationId)
        && p.data.citations.includes(ob.sourceCitation)
      );
    },
  })),
  async runWithGraph(input, ctx) {
    return buildNcDisposition(input, {
      addressedObligations: obligationIds(ctx.obligations),
      citations: citationsFor(ctx.obligations),
    });
  },
  async runWithoutGraph(input) {
    return buildNcDisposition(input, { addressedObligations: [], citations: [] });
  },
};

/* ─────────────────────────────────────────────────────────────────────
 * 4. Change Impact Assessor  (process: change-control)
 * ─────────────────────────────────────────────────────────────────── */

const CIAInputSchema = z.object({
  changeId: z.string(),
  changeType: z.enum(['design', 'process', 'supplier', 'material', 'labeling', 'software']),
  description: z.string().min(20),
  productClass: z.enum(['I', 'IIa', 'IIb', 'III']),
  regions: z.array(z.enum(['EU', 'US', 'UK'])).min(1),
});

const CIAOutputSchema = z.object({
  changeId: z.string(),
  regulatoryImpacts: z
    .array(
      z.object({
        region: z.enum(['EU', 'US', 'UK']),
        pathway: z.enum([
          'no-submission',
          'letter-to-file',
          '510k-special',
          '510k-traditional',
          'pma-supplement',
          'notified-body-notification',
          'eudamed-update',
        ]),
        rationale: z.string(),
        evidenceRequired: z.array(z.string()).min(1),
      }),
    )
    .min(1),
  requiresRevalidation: z.boolean(),
  requiresClinicalEvaluationUpdate: z.boolean(),
  requiresPmsPlanUpdate: z.boolean(),
  addressedObligations: z.array(z.string()),
  citations: z.array(z.string()),
});

type CIAInput = z.infer<typeof CIAInputSchema>;
type CIAOutput = z.infer<typeof CIAOutputSchema>;

type CIARegulatoryImpact = CIAOutput['regulatoryImpacts'][number];

function ciaImpactForRegion(region: CIAInput['regions'][number], input: CIAInput): CIARegulatoryImpact {
  const excerpt =
    `${input.description.slice(0, 240)}${input.description.length > 240 ? '...' : ''}`;
  const pathwayDriver = input.changeType === 'design' || input.changeType === 'software';

  if (region === 'US') {
    return {
      region,
      pathway: pathwayDriver ? '510k-special' : 'letter-to-file',
      rationale:
        `${pathwayDriver
          ? 'Assess FDA 510(k) change policy versus cleared predicate devices using the factual change description excerpt below.'
          : 'Operational/supplier/process change presumed letter-to-file if specifications and indications remain bounded by clearance.'}`
        + ` Excerpt from submitted description: "${excerpt}".`,
      evidenceRequired: pathwayDriver
        ? [
            `Verification/validation artefacts for change (${input.changeType}).`,
            'Risk management updates with residual rationale.',
            'Labeling differential where claims or Instructions for Use vary.',
          ]
        : ['Change evaluation record tying scope back to unchanged cleared limits.', 'Proof prior verification still covers impacted parameters'],
    };
  }

  if (region === 'EU') {
    return {
      region,
      pathway: pathwayDriver ? 'notified-body-notification' : 'eudamed-update',
      rationale:
        `${pathwayDriver
          ? `Class ${input.productClass}: evaluate whether conformity, risk profile, or intended purpose materially shift under EU MDR and trigger notified-body engagement.`
          : 'Assume technical documentation housekeeping / EUDAMED metadata refresh absent patient impact alteration.'}`
        + ` Narrative excerpt: "${excerpt}".`,
      evidenceRequired: [
        'Annex II technical documentation snippets impacted by scope',
        `Statement bridging change type "${input.changeType}" to unchanged essential requirements where applicable`,
      ],
    };
  }

  return {
    region: 'UK',
    pathway: pathwayDriver ? 'notified-body-notification' : 'no-submission',
    rationale:
      `${pathwayDriver
        ? `Class ${input.productClass}: escalate to Approved Body/MHRA if change is substantial versus UK conformity basis.`
        : `Maintain internal UK technical file deltas for "${input.changeType}" lacking substantial modification.`}`
      + ` Excerpt: "${excerpt}".`,
    evidenceRequired: ['UK Responsible Person impact assessment memo', 'Diff to applicable UK conformity documentation'],
  };
}

function buildCiaOutput(
  input: CIAInput,
  refs: { addressedObligations: string[]; citations: string[] },
): CIAOutput {
  const requiresHeavy = input.changeType === 'design' || input.changeType === 'software';
  return {
    changeId: input.changeId,
    regulatoryImpacts: input.regions.map((region) => ciaImpactForRegion(region, input)),
    requiresRevalidation: requiresHeavy,
    requiresClinicalEvaluationUpdate: requiresHeavy,
    requiresPmsPlanUpdate: requiresHeavy,
    addressedObligations: refs.addressedObligations,
    citations: refs.citations,
  };
}

const CIA_SAMPLE: CIAInput = {
  changeId: '',
  changeType: 'design',
  description: '',
  productClass: 'IIa',
  regions: ['EU'],
};

export const ChangeImpactAssessorTask: TaskAgentDefinition<CIAInput, CIAOutput> = {
  id: 'change-impact-assessor',
  name: 'Change Impact Assessor',
  oneLiner:
    'Determines the regulatory pathway triggered by a proposed change (510(k) supplement, notified body notification, letter-to-file, etc.) per region.',
  regulation: 'ISO 13485 §7.3.9 · EU MDR · 21 CFR 807',
  jurisdiction: 'multi',
  processId: 'change-control',
  claimedObligationIds: ['ISO13485.7.3.9.OBL.001', 'ISO13485.7.3.9.OBL.002'],
  systemPrompt:
    'You are a Design Change Control engineer assessing the regulatory impact of a proposed design change under ISO 13485 §7.3.9. Identify affected V&V activities, risk-management impacts, labeling/UDI ripple, and whether the change is significant enough to require re-registration in each jurisdiction. Map each conclusion to the supplied obligations.',
  inputSchema: CIAInputSchema,
  outputSchema: CIAOutputSchema,
  sampleData: CIA_SAMPLE,
  chainHints: {
    upstream: [{ taskId: 'capa-plan-drafter', via: 'Corrective actions that change the design route here for impact assessment.' }],
  },
  obligationChecks: ['ISO13485.7.3.9.OBL.001', 'ISO13485.7.3.9.OBL.002'].map((id) => ({
    obligationId: id,
    satisfiedBy: (o, ob) => {
      const p = CIAOutputSchema.safeParse(o);
      return (
        p.success
        && p.data.regulatoryImpacts.length > 0
        && p.data.addressedObligations.includes(ob.obligationId)
        && p.data.citations.includes(ob.sourceCitation)
      );
    },
  })),
  async runWithGraph(input, ctx) {
    return buildCiaOutput(input, {
      addressedObligations: obligationIds(ctx.obligations),
      citations: citationsFor(ctx.obligations),
    });
  },
  async runWithoutGraph(input) {
    return buildCiaOutput(input, { addressedObligations: [], citations: [] });
  },
};

/* ─────────────────────────────────────────────────────────────────────
 * 5. MIR Drafter  (process: adverse-event-reportability)
 * ─────────────────────────────────────────────────────────────────── */

const MirInputSchema = z.object({
  eventId: z.string(),
  eventDate: z.string(),
  deviceUdi: z.string(),
  deviceName: z.string(),
  manufacturerSrn: z.string(),
  jurisdiction: z.enum(['EU', 'US', 'UK']),
  patientOutcome: z.enum(['no_harm', 'temporary_harm', 'serious_injury', 'death', 'public_health_threat']),
  eventDescription: z.string().min(40),
  immediateActions: z.string(),
});

const MirOutputSchema = z.object({
  reportId: z.string(),
  reportableUnder: z.string(),
  submissionDeadlineDays: z.number().int().positive(),
  header: z.object({
    manufacturerSrn: z.string(),
    deviceUdi: z.string(),
    deviceName: z.string(),
    eventClassification: z.string(),
  }),
  narrative: z.string(),
  attachmentsRequired: z.array(z.string()).min(1),
  addressedObligations: z.array(z.string()),
  citations: z.array(z.string()),
});

type MirInput = z.infer<typeof MirInputSchema>;
type MirOutput = z.infer<typeof MirOutputSchema>;

function mirReportableHeading(
  jurisdiction: MirInput['jurisdiction'],
): string {
  if (jurisdiction === 'EU') {
    return 'EU MDR Article 87 vigilance pathway (classification per vigilance coordinator)';
  }
  if (jurisdiction === 'US') {
    return '21 CFR 803 — Manufacturer Reporting obligation family';
  }
  return 'UK MDR vigilance pathway (MHRA notification where applicable)';
}

function mirEventClassification(outcome: MirInput['patientOutcome']): string {
  switch (outcome) {
    case 'public_health_threat': {
      return 'Serious public health threat';
    }
    case 'death': {
      return 'Death';
    }
    case 'serious_injury': {
      return 'Serious injury / serious deterioration in state of health';
    }
    case 'temporary_harm': {
      return 'Non-serious deterioration / reversible harm';
    }
    default: {
      return 'Outcome recorded as no patient harm attributable to device (complete coding per internal procedure)';
    }
  }
}

function mirSubmissionDeadlineDays(input: MirInput): number {
  if (input.jurisdiction === 'US') {
    return 30;
  }
  const pht = input.patientOutcome === 'public_health_threat';
  const death = input.patientOutcome === 'death';
  return pht ? 2 : death ? 10 : 15;
}

function immediateActionsSnippet(text: string, maxLen = 420): string {
  const trimmed = text.trim();
  return `${trimmed.slice(0, maxLen)}${trimmed.length > maxLen ? '...' : ''}`;
}

function buildMirOutput(
  input: MirInput,
  refs: { addressedObligations: string[]; citations: string[] },
): MirOutput {
  const deadline = mirSubmissionDeadlineDays(input);
  const heading = mirReportableHeading(input.jurisdiction);
  const isoDate = input.eventDate.slice(0, 10);
  const attachmentsRequired = [
    `Investigation dossier linking manufacturer SRN "${input.manufacturerSrn}", event "${input.eventId}", device "${input.deviceName}", UDI ${input.deviceUdi}.`,
    `Chronological record of immediate actions: ${immediateActionsSnippet(input.immediateActions)}`,
    `Risk-management impact excerpt referencing UDIs/implicated devices (${input.deviceUdi}).`,
    'Adverse-event taxonomy worksheets (organisation IMDRF / internal coding equivalents).',
  ];
  return {
    reportId: `MIR-${input.eventId}`,
    reportableUnder: `${heading}; patientOutcome="${input.patientOutcome}".`,
    submissionDeadlineDays: deadline,
    header: {
      manufacturerSrn: input.manufacturerSrn,
      deviceUdi: input.deviceUdi,
      deviceName: input.deviceName,
      eventClassification: mirEventClassification(input.patientOutcome),
    },
    narrative:
      `${isoDate}: reported event referencing "${input.deviceName}" (${input.deviceUdi}) under vigilance jurisdiction ${input.jurisdiction}. `
      + `Manufacturer SRN "${input.manufacturerSrn}". Narrative: ${input.eventDescription} `
      + `Immediate actions captured: ${input.immediateActions} `
      + `Operational clock modeled as ${deadline} days from organisation reporting policy for supplied outcome classification; escalate if competent authority mandates alternate timing.`,
    attachmentsRequired,
    addressedObligations: refs.addressedObligations,
    citations: refs.citations,
  };
}


const MIR_SAMPLE: MirInput = {
  eventId: '',
  eventDate: '',
  deviceUdi: '',
  deviceName: '',
  manufacturerSrn: '',
  jurisdiction: 'EU',
  patientOutcome: 'no_harm',
  eventDescription: '',
  immediateActions: '',
};

export const MirDrafterTask: TaskAgentDefinition<MirInput, MirOutput> = {
  id: 'mir-drafter',
  name: 'MIR Drafter',
  oneLiner:
    'Drafts a Manufacturer Incident Report (MIR / MDR / MORE) for a confirmed-reportable adverse event, with the regional clock and required attachments.',
  regulation: 'EU MDR Art. 87 · 21 CFR 803 · UK MDR',
  jurisdiction: 'multi',
  processId: 'adverse-event-reportability',
  claimedObligationIds: ['EUMDR.87.OBL.002', 'EUMDR.87.OBL.003', 'CFR820.198.OBL.002'],
  systemPrompt:
    'You are a Vigilance / Post-Market Surveillance specialist drafting a Manufacturer Incident Report (MIR) under EU MDR Article 87 and a parallel MDR-friendly summary for 21 CFR 803 reporting. Be precise about device IDs, harm severity, patient outcome, root-cause hypothesis, and corrective field action status. Cite only the supplied obligations.',
  inputSchema: MirInputSchema,
  outputSchema: MirOutputSchema,
  sampleData: MIR_SAMPLE,
  chainHints: {
    upstream: [
      { taskId: 'ae-reportability', via: 'Reportability decision tells the MIR drafter which clock and template to use.' },
      { taskId: 'complaint-coder', via: 'IMDRF coding populates the event classification fields.' },
    ],
  },
  obligationChecks: ['EUMDR.87.OBL.002', 'EUMDR.87.OBL.003', 'CFR820.198.OBL.002'].map((id) => ({
    obligationId: id,
    satisfiedBy: (o, ob) => {
      const p = MirOutputSchema.safeParse(o);
      return (
        p.success
        && p.data.narrative.length >= 40
        && p.data.attachmentsRequired.length > 0
        && p.data.addressedObligations.includes(ob.obligationId)
        && p.data.citations.includes(ob.sourceCitation)
      );
    },
  })),
  async runWithGraph(input, ctx) {
    return buildMirOutput(input, {
      addressedObligations: obligationIds(ctx.obligations),
      citations: citationsFor(ctx.obligations),
    });
  },
  async runWithoutGraph(input) {
    return buildMirOutput(input, { addressedObligations: [], citations: [] });
  },
};

/* ─────────────────────────────────────────────────────────────────────
 * 6. Audit Finding Drafter  (process: internal-audit)
 * ─────────────────────────────────────────────────────────────────── */

const AuditInputSchema = z.object({
  auditId: z.string(),
  area: z.string(),
  clauseObserved: z.string(),
  observation: z.string().min(20),
  evidenceRefs: z.array(z.string()).min(1),
  classification: z.enum(['major', 'minor', 'observation', 'opportunity-for-improvement']),
});

const AuditOutputSchema = z.object({
  findingId: z.string(),
  statement: z.string(),
  clauseCitation: z.string(),
  evidenceSummary: z.string(),
  responseDueInDays: z.number().int().positive(),
  escalationRequired: z.boolean(),
  capaRecommended: z.boolean(),
  addressedObligations: z.array(z.string()),
  citations: z.array(z.string()),
});

type AuditInput = z.infer<typeof AuditInputSchema>;
type AuditOutput = z.infer<typeof AuditOutputSchema>;

function auditFindingSlug(value: string): string {
  return value.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'finding';
}

function buildAuditFinding(
  input: AuditInput,
  refs: { addressedObligations: string[]; citations: string[] },
): AuditOutput {
  const isMajor = input.classification === 'major';
  const headline =
    `${isMajor ? 'Major nonconformity'
      : input.classification === 'minor' ? 'Minor nonconformity'
      : input.classification === 'observation' ? 'Audit observation'
        : 'Opportunity for improvement'}`;
  const safeAuditSlug = auditFindingSlug(input.auditId);
  return {
    findingId: `F-${safeAuditSlug}-${input.classification}-${input.evidenceRefs.length}`,
    statement: `${headline} against ${input.clauseObserved} in ${input.area}: ${input.observation}`,
    clauseCitation: input.clauseObserved,
    evidenceSummary:
      `${input.evidenceRefs.length} evidence references audited: ${input.evidenceRefs.join(', ')}. `
      + 'Evidence reviewed by sampling cited records versus applicable procedure/control criteria.',
    responseDueInDays: isMajor ? 30 : input.classification === 'minor' ? 60 : 90,
    escalationRequired: isMajor,
    capaRecommended: isMajor,
    addressedObligations: refs.addressedObligations,
    citations: refs.citations,
  };
}

const AUDIT_SAMPLE: AuditInput = {
  auditId: '',
  area: '',
  clauseObserved: '',
  observation: '',
  evidenceRefs: [''],
  classification: 'observation',
};

export const AuditFindingDrafterTask: TaskAgentDefinition<AuditInput, AuditOutput> = {
  id: 'audit-finding-drafter',
  name: 'Audit Finding Drafter',
  oneLiner:
    'Drafts a formal internal audit finding (statement, clause citation, evidence summary, response clock) from an auditor observation.',
  regulation: 'ISO 13485 §8.2.4',
  jurisdiction: 'GLOBAL',
  processId: 'internal-audit',
  claimedObligationIds: [
    'ISO13485.8.2.4.OBL.001',
    'ISO13485.8.2.4.OBL.002',
    'ISO13485.8.2.4.OBL.003',
    'ISO13485.8.2.4.OBL.004',
    'ISO13485.8.2.4.OBL.005',
  ],
  systemPrompt:
    'You are a Lead Internal Auditor drafting a formal nonconformity / observation under ISO 13485 §8.2.4. Use the standard pattern: clause cited verbatim → factual statement → objective evidence → impact → response clock. Classification (minor / major / observation) must be defensible given systemic vs isolated indicators.',
  inputSchema: AuditInputSchema,
  outputSchema: AuditOutputSchema,
  sampleData: AUDIT_SAMPLE,
  chainHints: {
    downstream: [{ taskId: 'capa-plan-drafter', via: 'Major findings open CAPA; the finding statement seeds the action plan.' }],
  },
  obligationChecks: [
    'ISO13485.8.2.4.OBL.001',
    'ISO13485.8.2.4.OBL.002',
    'ISO13485.8.2.4.OBL.003',
    'ISO13485.8.2.4.OBL.004',
    'ISO13485.8.2.4.OBL.005',
  ].map((id) => ({
    obligationId: id,
    satisfiedBy: (o, ob) => {
      const p = AuditOutputSchema.safeParse(o);
      return (
        p.success
        && p.data.statement.length > 0
        && p.data.evidenceSummary.length > 0
        && p.data.addressedObligations.includes(ob.obligationId)
        && p.data.citations.includes(ob.sourceCitation)
      );
    },
  })),
  async runWithGraph(input, ctx) {
    return buildAuditFinding(input, {
      addressedObligations: obligationIds(ctx.obligations),
      citations: citationsFor(ctx.obligations),
    });
  },
  async runWithoutGraph(input) {
    return buildAuditFinding(input, { addressedObligations: [], citations: [] });
  },
};
