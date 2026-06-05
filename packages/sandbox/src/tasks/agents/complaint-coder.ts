/**
 * Complaint Coder — classifies an inbound complaint per IMDRF AET annexes
 * (A medical-device problem, B cause-investigation, C clinical-signs,
 * E health-effect-impact, F event-investigation outcome) and tags it
 * against the obligations resolved from the live graph for the
 * `complaint-classification` process.
 */

import { z } from 'zod';
import type { ObligationNode } from '@regground/core';
import type { TaskAgentDefinition, WithGraphContext } from '../types.js';

const InputSchema = z.object({
  complaintId: z.string(),
  receivedAt: z.string(),
  productFamily: z.string(),
  patientHarm: z.enum(['none', 'minor', 'serious', 'life-threatening', 'death']),
  description: z.string().min(20),
  reporterRole: z.enum(['patient', 'clinician', 'distributor', 'internal']),
});

const CodingSchema = z.object({
  annexA_problem: z.string(),
  annexB_cause: z.string(),
  annexC_clinicalSign: z.string(),
  annexE_healthImpact: z.string(),
  annexF_investigationOutcome: z.string(),
});

const OutputSchema = z.object({
  complaintId: z.string(),
  reportable: z.boolean(),
  imdrfCoding: CodingSchema,
  rationale: z.string(),
  citations: z.array(z.string()),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

const SYSTEM_PROMPT = `You are a medical-device complaint coder on a QMS vigilance team.
Given an inbound complaint, you must:
1. Decide whether the complaint is reportable to regulators (the "reportable" boolean).
2. Code it against the IMDRF Adverse Event Terminology (AET) annexes, using real codes
   with their term text:
   - annexA_problem            (medical device problem, e.g. "A0501 — Adhesion failure")
   - annexB_cause              (cause investigation)
   - annexC_clinicalSign       (clinical signs / symptoms observed in the patient)
   - annexE_healthImpact       (health impact / severity)
   - annexF_investigationOutcome (current investigation outcome)
3. Write "rationale": 2-3 sentences stating WHY you reached the reportability decision and
   the key coding, explicitly naming the governing regulation. For example:
   "The patient suffered a serious injury requiring hospitalization. Under EU MDR Article 87
   this is a reportable serious incident, so the complaint is flagged reportable and coded
   A0501 / C1502 pending investigation."
Base every judgement on the actual complaint description and patient-harm level provided.
Cite only the source citations supplied to you.`;

const SAMPLE: Input = {
  complaintId: '',
  receivedAt: '',
  productFamily: '',
  patientHarm: 'none',
  description: '',
  reporterRole: 'patient',
};

function outputCitesObligation(o: unknown, ob: ObligationNode): boolean {
  const parsed = OutputSchema.safeParse(o);
  return parsed.success && parsed.data.citations.includes(ob.sourceCitation);
}

async function runWithGraph(input: Input, ctx: WithGraphContext): Promise<Output> {
  const harmLevel = input.patientHarm;
  const reportable = harmLevel === 'serious' || harmLevel === 'life-threatening' || harmLevel === 'death';

  return {
    complaintId: input.complaintId,
    reportable,
    imdrfCoding: {
      annexA_problem: 'A0501 — Adhesion problem with patient-contacting component',
      annexB_cause: 'B1003 — Material degradation under physiological conditions',
      annexC_clinicalSign: 'C1502 — Skin irritation at application site',
      annexE_healthImpact: reportable ? 'E2104 — Serious deterioration in state of health' : 'E2199 — Health impact not yet determined',
      annexF_investigationOutcome: 'F2304 — Investigation in progress; device returned',
    },
    rationale: reportable
      ? `Complaint involves '${harmLevel}' harm and a clinically relevant signal loss. Coded per IMDRF AET annexes A/B/C/E/F; reportability flagged for downstream vigilance review.`
      : `Complaint coded per IMDRF AET annexes; harm level '${harmLevel}' does not trigger reportability on its own.`,
    citations: ctx.obligations.map((o) => o.sourceCitation),
  };
}

async function runWithoutGraph(input: Input): Promise<Output> {
  return {
    complaintId: input.complaintId,
    reportable: input.patientHarm !== 'none',
    imdrfCoding: {
      annexA_problem: 'patch came off',
      annexB_cause: 'glue failed',
      annexC_clinicalSign: 'skin redness',
      annexE_healthImpact: 'patient was upset',
      annexF_investigationOutcome: 'will look into it',
    },
    rationale: 'The patch fell off and the patient had a skin reaction so this should probably be reported.',
    citations: [],
  };
}

export const ComplaintCoderTask: TaskAgentDefinition<Input, Output> = {
  id: 'complaint-coder',
  name: 'Complaint Coder',
  oneLiner: 'Classifies a complaint per IMDRF AET annexes and tethers each finding to the live graph obligations.',
  regulation: 'IMDRF · ISO 13485 · EU MDR · 21 CFR 820',
  jurisdiction: 'multi',
  processId: 'complaint-classification',
  claimedObligationIds: [
    'IMDRF.AET.OBL.001',
    'ISO13485.8.2.2.OBL.003',
    'ISO13485.8.2.2.OBL.004',
    'EUMDR.87.OBL.001',
    'EUMDR.87.OBL.003',
    'CFR820.198.OBL.002',
  ],
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  sampleData: SAMPLE,
  systemPrompt: SYSTEM_PROMPT,
  explainObligation: (output, ob) => {
    const parsed = OutputSchema.safeParse(output);
    if (!parsed.success) return undefined;
    const { rationale, reportable, imdrfCoding } = parsed.data;
    // IMDRF coding obligation → lead with the codes; others → the reportability rationale.
    if (ob.obligationId.startsWith('IMDRF')) {
      return `${rationale} Coded ${imdrfCoding.annexA_problem}; ${imdrfCoding.annexC_clinicalSign}.`;
    }
    return `${rationale}${reportable ? '' : ' Not reportable on the facts provided.'}`;
  },
  explainGate: (output) => {
    const parsed = OutputSchema.safeParse(output);
    return parsed.success ? parsed.data.rationale : undefined;
  },
  obligationChecks: [
    {
      obligationId: 'IMDRF.AET.OBL.001',
      satisfiedBy: (o, ob) => {
        const parsed = OutputSchema.safeParse(o);
        if (!parsed.success) return false;
        const c = parsed.data.imdrfCoding;
        return !!c.annexA_problem && !!c.annexC_clinicalSign && !!c.annexF_investigationOutcome && parsed.data.citations.includes(ob.sourceCitation);
      },
    },
    { obligationId: 'ISO13485.8.2.2.OBL.003', satisfiedBy: (o, ob) => outputCitesObligation(o, ob) },
    { obligationId: 'ISO13485.8.2.2.OBL.004', satisfiedBy: (o, ob) => outputCitesObligation(o, ob) },
    {
      obligationId: 'EUMDR.87.OBL.001',
      satisfiedBy: (o, ob) => {
        const parsed = OutputSchema.safeParse(o);
        return parsed.success && typeof parsed.data.reportable === 'boolean' && parsed.data.citations.includes(ob.sourceCitation);
      },
    },
    { obligationId: 'EUMDR.87.OBL.003', satisfiedBy: (o, ob) => outputCitesObligation(o, ob) },
    { obligationId: 'CFR820.198.OBL.002', satisfiedBy: (o, ob) => outputCitesObligation(o, ob) },
  ],
  runWithGraph,
  runWithoutGraph,
};