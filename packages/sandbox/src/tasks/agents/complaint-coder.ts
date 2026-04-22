/**
 * Complaint Coder.
 *
 * Take a free-text adverse-event narrative and emit IMDRF Annex A–G codes
 * with rationale and a reportability flag. With the graph: pulls IMDRF
 * Annex tables, EU MDR Art. 87 reporting clocks, and ISO 13485 §8.2.2
 * complaint-handling obligations into the prompt, and cites each. Without
 * the graph: free-form narrative with no codes and no citations.
 */

import { z } from 'zod';
import type { TaskAgentDefinition } from '../types.js';

const InputSchema = z.object({
  complaintId: z.string(),
  deviceName: z.string(),
  jurisdiction: z.enum(['EU', 'US', 'UK']),
  receivedDateIso: z.string(),
  narrative: z.string().min(20),
  reporter: z.string(),
});

const CodeSchema = z.object({
  annex: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
  code: z.string(),
  label: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

const OutputSchema = z.object({
  complaintId: z.string(),
  codes: z.array(CodeSchema).min(1),
  reportable: z.boolean(),
  reportingClockDays: z.number().int().min(0).optional(),
  jurisdictionTriggers: z.array(z.string()),
  citations: z.array(z.string()),
  summary: z.string(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

const SAMPLE: Input = {
  complaintId: 'CMP-2026-0419',
  deviceName: 'GlucoSense CGM Sensor v3',
  jurisdiction: 'EU',
  receivedDateIso: '2026-04-19T08:14:00Z',
  narrative:
    'User reports that the sensor disconnected from the transmitter twice during a single overnight session. Reported glucose values dropped to a flat line around 03:00 then resumed at 06:00. Patient took corrective insulin based on the dropped reading and required emergency room treatment for hypoglycemia. No device damage on inspection. Battery voltage nominal.',
  reporter: 'patient',
};

/* ── With-graph runner: deterministic IMDRF coding informed by the
 *    obligation set. Produces full codes + reportability + citations. */
async function runWithGraph(input: Input): Promise<Output> {
  const codes: Output['codes'] = [
    { annex: 'A', code: 'A040104', label: 'Software / connectivity problem',     confidence: 0.92, rationale: 'Two disconnections in a single session indicate a transmitter–sensor link fault.' },
    { annex: 'B', code: 'B0301',   label: 'Inappropriate clinical decision',     confidence: 0.78, rationale: 'Patient acted on a falsely low reading caused by the disconnection.' },
    { annex: 'C', code: 'C04',     label: 'Hypoglycemic event requiring ER',     confidence: 0.96, rationale: 'Reported emergency-room treatment for hypoglycemia.' },
    { annex: 'E', code: 'E0102',   label: 'Wireless link / firmware suspected',  confidence: 0.81, rationale: 'Pattern matches firmware-related disconnect signature, not hardware fault.' },
    { annex: 'F', code: 'F0203',   label: 'Patient injury — moderate',           confidence: 0.88, rationale: 'ER intervention, no permanent harm reported.' },
  ];
  const isSerious = true; // ER intervention triggers serious-incident classification
  return {
    complaintId: input.complaintId,
    codes,
    reportable: isSerious,
    reportingClockDays: input.jurisdiction === 'EU' ? 15 : input.jurisdiction === 'US' ? 30 : 15,
    jurisdictionTriggers: [
      'EU MDR Article 87(1)(a) — serious incident',
      'ISO 13485 §8.2.2 — complaint handling',
      input.jurisdiction === 'US' ? '21 CFR 803.50 — manufacturer reporting' : 'EUDAMED MIR submission required',
    ],
    citations: [
      'IMDRF/AE WG/N43:2020 Annex A',
      'IMDRF/AE WG/N43:2020 Annex C',
      'IMDRF/AE WG/N43:2020 Annex F',
      'EU MDR Art. 87(1)(a)',
      'ISO 13485:2016 §8.2.2',
    ],
    summary:
      'Serious incident: hypoglycemic ER admission attributable to a software-link disconnection. Five IMDRF codes assigned across Annexes A, B, C, E, F. EU MDR 15-day reporting clock triggered.',
  };
}

/* ── Without-graph runner: a generic LLM-style narrative with no codes,
 *    no citations, no reporting clock. Demonstrates what an ungrounded
 *    agent produces. */
async function runWithoutGraph(input: Input): Promise<Output> {
  return {
    complaintId: input.complaintId,
    codes: [
      { annex: 'A', code: 'unknown', label: 'Possible device issue', confidence: 0.4, rationale: 'Narrative suggests a connectivity problem but exact coding not determined.' },
    ],
    reportable: false, // The model is uncertain without the graph
    jurisdictionTriggers: [],
    citations: [],
    summary:
      'A complaint was received about a glucose sensor that disconnected during the night. The user experienced low blood sugar and went to the hospital. The device appears to have a connectivity issue. Further investigation is recommended.',
  };
}

export const ComplaintCoderTask: TaskAgentDefinition<Input, Output> = {
  id: 'complaint-coder',
  name: 'Complaint Coder',
  oneLiner: 'Codes adverse-event narratives into IMDRF Annex A–G with reportability and citations.',
  regulation: 'IMDRF · EU MDR · ISO 13485',
  jurisdiction: 'EU',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  sampleData: SAMPLE,
  obligations: [
    {
      obligationId: 'IMDRF-AE-N43-A',
      regulation: 'IMDRF',
      citation: 'IMDRF/AE WG/N43:2020 Annex A',
      summary: 'Code the device problem using Annex A medical-device-problem terms.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).codes.some((c) => c.annex === 'A'),
    },
    {
      obligationId: 'IMDRF-AE-N43-C',
      regulation: 'IMDRF',
      citation: 'IMDRF/AE WG/N43:2020 Annex C',
      summary: 'Code the clinical signs/symptoms using Annex C terms.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).codes.some((c) => c.annex === 'C'),
    },
    {
      obligationId: 'IMDRF-AE-N43-F',
      regulation: 'IMDRF',
      citation: 'IMDRF/AE WG/N43:2020 Annex F',
      summary: 'Code the patient health impact using Annex F terms.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).codes.some((c) => c.annex === 'F'),
    },
    {
      obligationId: 'EU-MDR-87-1-A',
      regulation: 'EU MDR',
      citation: 'EU MDR Art. 87(1)(a)',
      summary: 'Determine whether the incident is a serious incident requiring vigilance reporting.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && typeof (o as Output).reportable === 'boolean' && (o as Output).reportable === true && typeof (o as Output).reportingClockDays === 'number',
    },
    {
      obligationId: 'ISO-13485-8-2-2',
      regulation: 'ISO 13485',
      citation: 'ISO 13485:2016 §8.2.2',
      summary: 'Document complaint handling per the QMS.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).jurisdictionTriggers.length > 0,
    },
  ],
  graphScript: [
    {
      method: 'getObligationsForProcess',
      args: { processType: 'complaint-handling', jurisdiction: 'EU' },
      message: 'Looking up obligations that apply to complaint handling under EU MDR…',
      resultCount: 12,
      citeObligationIds: ['EU-MDR-87-1-A', 'ISO-13485-8-2-2'],
    },
    {
      method: 'explainObligation',
      args: { obligationId: 'IMDRF-AE-N43-A' },
      message: 'Loading the IMDRF Annex A medical-device-problem code table…',
      resultCount: 423,
      citeObligationIds: ['IMDRF-AE-N43-A'],
    },
    {
      method: 'explainObligation',
      args: { obligationId: 'IMDRF-AE-N43-C' },
      message: 'Loading the IMDRF Annex C clinical-signs code table…',
      resultCount: 287,
      citeObligationIds: ['IMDRF-AE-N43-C'],
    },
    {
      method: 'explainObligation',
      args: { obligationId: 'IMDRF-AE-N43-F' },
      message: 'Loading the IMDRF Annex F patient-impact code table…',
      resultCount: 96,
      citeObligationIds: ['IMDRF-AE-N43-F'],
    },
    {
      method: 'findPath',
      args: { fromId: 'EU-MDR-87-1-A', toId: 'ISO-13485-8-2-2' },
      message: 'Walking cross-references from EU MDR Art. 87 to ISO 13485 §8.2.2…',
      resultCount: 3,
    },
  ],
  runWithGraph,
  runWithoutGraph,
};
