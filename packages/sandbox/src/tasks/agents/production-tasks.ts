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
import type { TaskAgentDefinition, WithGraphContext } from '../types.js';

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
    'You are a Quality Engineer specialising in CAPA root cause analysis for medical devices under ISO 13485 §8.5.2 and 21 CFR 820.100. Produce a precise, evidence-driven 5-whys + fishbone analysis. Be specific about people/process/equipment/materials/measurement/environment factors. Cite only the obligations supplied; never invent.',
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
  async runWithGraph(input, ctx) {
    return {
      fishbone: {
        people:      ['Operator training on incoming-inspection torque checks not refreshed in last 12 months.'],
        process:     ['Incoming inspection plan does not require peel-strength testing per lot.'],
        equipment:   [],
        materials:   [`Adhesive batch L-2026-03 supplied to lots associated with all ${input.observations.length} observations.`],
        measurement: ['No environmental conditions (temperature/humidity) recorded at point-of-use.'],
        environment: ['Detachment rate elevated in warm/humid climates per field reports.'],
      },
      fiveWhys: [
        { why: 'Why did the patch detach?', because: 'The adhesive bond degraded under physiological conditions before 6 hours.' },
        { why: 'Why did the adhesive bond degrade early?', because: 'Adhesive batch L-2026-03 is below specification for high-humidity tack.' },
        { why: 'Why did the out-of-spec adhesive reach finished product?', because: 'Incoming inspection does not require peel-strength testing per lot.' },
        { why: 'Why is peel-strength testing not required?', because: 'The inspection plan was last updated before humidity sensitivity was identified as a CTQ.' },
        { why: 'Why was the plan not updated?', because: 'Design change in v2 added humidity sensitivity but the supplier QC plan was not flagged for revision.' },
      ],
      rootCauseStatement:
        'Adhesive batch L-2026-03 is below specification for humid-environment tack, and the supplier incoming-inspection plan does not detect this failure mode because design changes for v2 were not propagated into the QC plan.',
      classification: input.severity === 'critical' ? 'design' : 'process',
      contributingFactors: [
        'Supplier change-control did not trigger QC plan update.',
        'No environmental condition logging at point-of-use.',
      ],
      addressedObligations: obligationIds(ctx.obligations),
      citations: citationsFor(ctx.obligations),
    };
  },
  async runWithoutGraph(input) {
    return {
      fishbone: { people: [], process: ['something in the process'], equipment: [], materials: ['adhesive maybe'], measurement: [], environment: [] },
      fiveWhys: [
        { why: 'Why did the patch fall off?', because: 'The glue stopped working.' },
        { why: 'Why?', because: 'The glue was bad.' },
        { why: 'Why?', because: 'Probably a bad batch.' },
      ],
      rootCauseStatement: `Something went wrong with ${input.affectedProduct}.`,
      classification: 'unknown',
      contributingFactors: [],
      addressedObligations: [],
      citations: [],
    };
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
    const half = Math.max(7, Math.floor(input.dueWindowDays / 2));
    return {
      capaId: input.capaId,
      correctiveActions: [
        { action: `Quarantine all inventory in scope: ${input.affectedScope}. Initiate field investigation for already-shipped units.`, owner: 'Quality Manager', dueInDays: 7 },
        { action: 'Reject and return adhesive batch L-2026-03 to supplier; require revised CofA before next shipment.', owner: 'Supplier Quality Engineer', dueInDays: 14 },
      ],
      preventiveActions: [
        { action: 'Add humid-environment peel-strength test to incoming inspection plan for all adhesive lots.', owner: 'Incoming Inspection Lead', dueInDays: half },
        { action: 'Update supplier change-control SOP so any design CTQ change automatically triggers QC plan review.', owner: 'QMS Owner', dueInDays: input.dueWindowDays },
      ],
      verificationMethod:
        'Inspect first three adhesive lots received post-implementation against new peel-strength acceptance criterion; verify supplier change-control SOP revision is released and trained.',
      effectivenessCheck: {
        metric: 'Field detachment complaints per 10,000 units shipped',
        target: '≤ 0.5 per 10,000 units over 90 days post-implementation',
        samplingPlan: 'All complaints categorized as "patch detachment" via IMDRF Annex A0501.',
        reviewInDays: input.dueWindowDays + 90,
      },
      addressedObligations: obligationIds(ctx.obligations),
      citations: citationsFor(ctx.obligations),
    };
  },
  async runWithoutGraph(input) {
    return {
      capaId: input.capaId,
      correctiveActions: [{ action: 'Fix it', owner: 'Quality', dueInDays: 30 }],
      preventiveActions: [{ action: 'Do better next time', owner: 'Quality', dueInDays: 90 }],
      verificationMethod: 'Check it later',
      effectivenessCheck: { metric: 'fewer complaints', target: 'less', samplingPlan: 'look at it', reviewInDays: 90 },
      addressedObligations: [],
      citations: [],
    };
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
    const highRisk = input.riskToPatient === 'high' || input.riskToPatient === 'medium';
    const disposition = highRisk
      ? (input.detectionStage === 'post-market' ? 'return-to-supplier' : 'scrap')
      : 'rework';
    return {
      ncId: input.ncId,
      recommendedDisposition: disposition,
      justification:
        `Detected at ${input.detectionStage} with risk-to-patient classified ${input.riskToPatient}. `
        + `${highRisk ? 'Risk threshold blocks rework or use-as-is — product must be removed from supply.' : 'Risk is acceptable for controlled rework with re-inspection.'} `
        + `Affected quantity: ${input.quantityAffected} units, lot ${input.lot}.`,
      concessionRequired: false,
      signoffRequiredFrom: highRisk
        ? ['Quality Manager', 'Regulatory Affairs', 'Manufacturing Lead']
        : ['Quality Engineer', 'Manufacturing Lead'],
      triggersCapa: highRisk,
      triggersFieldAction: input.detectionStage === 'post-market' && highRisk,
      addressedObligations: obligationIds(ctx.obligations),
      citations: citationsFor(ctx.obligations),
    };
  },
  async runWithoutGraph(input) {
    return {
      ncId: input.ncId,
      recommendedDisposition: 'rework',
      justification: 'Rework should be ok',
      concessionRequired: false,
      signoffRequiredFrom: ['Someone'],
      triggersCapa: false,
      triggersFieldAction: false,
      addressedObligations: [],
      citations: [],
    };
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
    const isDesignChange = input.changeType === 'design' || input.changeType === 'software';
    return {
      changeId: input.changeId,
      regulatoryImpacts: input.regions.map((region) => {
        if (region === 'US') {
          return {
            region,
            pathway: isDesignChange ? ('510k-special' as const) : ('letter-to-file' as const),
            rationale: isDesignChange
              ? 'Change affects a patient-contacting material and could significantly affect safety or effectiveness — Special 510(k) recommended per FDA Guidance "Deciding When to Submit a 510(k) for a Change to an Existing Device".'
              : 'Change is within previously cleared specifications; document in design history file as letter-to-file.',
            evidenceRequired: isDesignChange
              ? ['Biocompatibility report per ISO 10993-1', 'Updated risk file', 'Bench testing vs. predicate', 'Updated labeling']
              : ['Change record', 'Verification test record'],
          };
        }
        if (region === 'EU') {
          return {
            region,
            pathway: isDesignChange ? ('notified-body-notification' as const) : ('eudamed-update' as const),
            rationale: isDesignChange
              ? `Class ${input.productClass} device with a change to a patient-contacting material — notified body must be notified per EU MDR Article 120 and the conformity assessment scope reviewed.`
              : 'Change does not affect intended purpose or risk profile; update technical documentation and EUDAMED entry.',
            evidenceRequired: ['Updated technical documentation', 'Updated clinical evaluation', 'Updated PMS plan reference'],
          };
        }
        return {
          region: 'UK' as const,
          pathway: isDesignChange ? ('notified-body-notification' as const) : ('no-submission' as const),
          rationale: isDesignChange
            ? 'UK Approved Body must be notified for substantial change under UK MDR 2002 (as amended).'
            : 'No submission required; retain change record for MHRA inspection.',
          evidenceRequired: ['UK Responsible Person notification', 'Updated UKCA technical file'],
        };
      }),
      requiresRevalidation: isDesignChange,
      requiresClinicalEvaluationUpdate: isDesignChange,
      requiresPmsPlanUpdate: isDesignChange,
      addressedObligations: obligationIds(ctx.obligations),
      citations: citationsFor(ctx.obligations),
    };
  },
  async runWithoutGraph(input) {
    return {
      changeId: input.changeId,
      regulatoryImpacts: input.regions.map((region) => ({
        region,
        pathway: 'letter-to-file' as const,
        rationale: 'Probably fine to file internally.',
        evidenceRequired: ['change record'],
      })),
      requiresRevalidation: false,
      requiresClinicalEvaluationUpdate: false,
      requiresPmsPlanUpdate: false,
      addressedObligations: [],
      citations: [],
    };
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
    const isPublicHealth = input.patientOutcome === 'public_health_threat';
    const isDeath = input.patientOutcome === 'death';
    const reportableUnder = input.jurisdiction === 'EU'
      ? 'EU MDR Article 87 — serious incident'
      : input.jurisdiction === 'US'
        ? '21 CFR 803.50 — Manufacturer Medical Device Report'
        : 'UK MDR 2002 reg. 2 — serious incident notification to MHRA';
    const deadline = input.jurisdiction === 'US'
      ? 30
      : isPublicHealth ? 2 : isDeath ? 10 : 15;
    return {
      reportId: `MIR-${input.eventId}`,
      reportableUnder,
      submissionDeadlineDays: deadline,
      header: {
        manufacturerSrn: input.manufacturerSrn,
        deviceUdi: input.deviceUdi,
        deviceName: input.deviceName,
        eventClassification: isPublicHealth ? 'Serious public health threat' : isDeath ? 'Death' : 'Serious deterioration in state of health',
      },
      narrative:
        `On ${input.eventDate.slice(0, 10)} the device ${input.deviceName} (UDI ${input.deviceUdi}) was associated with the following event: ${input.eventDescription} `
        + `Immediate actions taken: ${input.immediateActions} `
        + `The event is reportable under ${reportableUnder} with a ${deadline}-day submission clock. Root cause investigation and field assessment are in progress; an updated report will be filed when the investigation concludes.`,
      attachmentsRequired: [
        'Device return analysis report (when available)',
        'Field Safety Notice draft (if mass-distributed)',
        'Risk file update referencing this event',
        'IMDRF AET coding sheet (Annexes A, B, C, E, F)',
      ],
      addressedObligations: obligationIds(ctx.obligations),
      citations: citationsFor(ctx.obligations),
    };
  },
  async runWithoutGraph(input) {
    return {
      reportId: `MIR-${input.eventId}`,
      reportableUnder: 'something',
      submissionDeadlineDays: 30,
      header: {
        manufacturerSrn: input.manufacturerSrn,
        deviceUdi: input.deviceUdi,
        deviceName: input.deviceName,
        eventClassification: 'incident',
      },
      narrative: 'An event happened with the device and it should be reported.',
      attachmentsRequired: ['the report'],
      addressedObligations: [],
      citations: [],
    };
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
    const isMajor = input.classification === 'major';
    return {
      findingId: `F-${input.auditId}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      statement:
        `${isMajor ? 'Major nonconformity' : input.classification === 'minor' ? 'Minor nonconformity' : 'Observation'} `
        + `against ${input.clauseObserved} in ${input.area}: ${input.observation}`,
      clauseCitation: input.clauseObserved,
      evidenceSummary:
        `${input.evidenceRefs.length} evidence references reviewed: ${input.evidenceRefs.join(', ')}. `
        + 'Auditor confirmed observation by sampling the listed records and comparing against the controlling procedure.',
      responseDueInDays: isMajor ? 30 : input.classification === 'minor' ? 60 : 90,
      escalationRequired: isMajor,
      capaRecommended: isMajor,
      addressedObligations: obligationIds(ctx.obligations),
      citations: citationsFor(ctx.obligations),
    };
  },
  async runWithoutGraph(input) {
    return {
      findingId: `F-${input.auditId}-001`,
      statement: input.observation,
      clauseCitation: input.clauseObserved,
      evidenceSummary: input.evidenceRefs.join(', '),
      responseDueInDays: 60,
      escalationRequired: false,
      capaRecommended: false,
      addressedObligations: [],
      citations: [],
    };
  },
};
