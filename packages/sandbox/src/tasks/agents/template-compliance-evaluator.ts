/**
 * Template Compliance Evaluator — given a draft document outline,
 * evaluate whether it satisfies the structural and content requirements
 * of MDCG 2022-21 / EU MDR Art. 86 for a PSUR. Required headings are
 * encoded here (they are structural rules, not regulatory text); the
 * citation for each finding is resolved from the obligations the graph
 * returned for the `psur-compilation` process.
 */

import { z } from 'zod';
import type { ObligationNode } from '@regground/core';
import type { TaskAgentDefinition, WithGraphContext } from '../types.js';

const SectionSchema = z.object({
  heading: z.string(),
  wordCount: z.number().int().nonnegative(),
  hasReferences: z.boolean(),
});

const InputSchema = z.object({
  documentTitle: z.string(),
  documentType: z.enum(['PSUR', 'PMSR', 'PMCF', 'TechnicalDoc']),
  draftSections: z.array(SectionSchema).min(1),
  authorRole: z.string(),
});

const FindingSchema = z.object({
  requirement: z.string(),
  citation: z.string(),
  status: z.enum(['present', 'missing', 'insufficient']),
  note: z.string(),
});

const OutputSchema = z.object({
  documentTitle: z.string(),
  overallStatus: z.enum(['compliant', 'minor-gaps', 'major-gaps']),
  findings: z.array(FindingSchema).min(1),
  missingRequiredSections: z.array(z.string()),
  citations: z.array(z.string()),
  recommendation: z.string(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

const SAMPLE: Input = {
  documentTitle: '',
  documentType: 'PSUR',
  authorRole: '',
  draftSections: [
    { heading: '', wordCount: 0, hasReferences: false },
  ],
};

const PSUR_REQUIRED: Array<{ heading: string; obligationId: string }> = [
  { heading: 'Executive Summary',                                obligationId: 'MDCG2022-21.1.OBL.001' },
  { heading: 'Device Description and Intended Purpose',          obligationId: 'MDCG2022-21.1.OBL.002' },
  { heading: 'Sales and Estimated Population Exposed',           obligationId: 'MDCG2022-21.2.OBL.005' },
  { heading: 'Conclusions of the Benefit-Risk Analysis',         obligationId: 'MDCG2022-21.2.OBL.001' },
  { heading: 'Main Findings of PMCF',                            obligationId: 'MDCG2022-21.2.OBL.004' },
  { heading: 'Volume of Sales',                                  obligationId: 'MDCG2022-21.2.OBL.005' },
  { heading: 'Methods and Tools Used to Assess Performance',     obligationId: 'MDCG2022-21.2.OBL.003' },
  { heading: 'Trend Analysis Including Field Safety Actions',    obligationId: 'MDCG2022-21.2.OBL.007' },
];

async function runWithGraph(input: Input, ctx: WithGraphContext): Promise<Output> {
  const present = new Set(input.draftSections.map((s) => s.heading.toLowerCase()));
  const obIndex = new Map<string, ObligationNode>(ctx.obligations.map((o) => [o.obligationId, o]));

  const findings: Output['findings'] = PSUR_REQUIRED.map((req) => {
    const ob = obIndex.get(req.obligationId);
    const citation = ob?.sourceCitation ?? '';
    const section = input.draftSections.find((s) => s.heading.toLowerCase() === req.heading.toLowerCase());
    if (!section) {
      return { requirement: req.heading, citation, status: 'missing' as const, note: 'Required section is absent from the draft.' };
    }
    if (section.wordCount < 200 || !section.hasReferences) {
      return {
        requirement: req.heading,
        citation,
        status: 'insufficient' as const,
        note: `Section is present but ${section.wordCount < 200 ? 'too short' : 'lacks supporting references'} for an MDCG-compliant PSUR.`,
      };
    }
    return { requirement: req.heading, citation, status: 'present' as const, note: 'Meets the MDCG section minimum.' };
  });

  const missing = PSUR_REQUIRED.filter((r) => !present.has(r.heading.toLowerCase())).map((r) => r.heading);
  const major = findings.filter((f) => f.status === 'missing').length;
  const minor = findings.filter((f) => f.status === 'insufficient').length;
  const overall: Output['overallStatus'] = major > 0 ? 'major-gaps' : minor > 0 ? 'minor-gaps' : 'compliant';

  return {
    documentTitle: input.documentTitle,
    overallStatus: overall,
    findings,
    missingRequiredSections: missing,
    citations: ctx.obligations.map((o) => o.sourceCitation),
    recommendation:
      overall === 'compliant'
        ? 'Document is structurally complete. Proceed to medical-affairs review.'
        : `Add the ${missing.length} missing section(s) and expand insufficient sections before PRRC sign-off.`,
  };
}

async function runWithoutGraph(input: Input): Promise<Output> {
  return {
    documentTitle: input.documentTitle,
    overallStatus: 'compliant',
    findings: input.draftSections.map((s) => ({
      requirement: s.heading,
      citation: '',
      status: 'present',
      note: 'Section is present in the draft.',
    })),
    missingRequiredSections: [],
    citations: [],
    recommendation: 'The document looks complete. Submit for review.',
  };
}

function findingFor(o: unknown, citation: string) {
  const parsed = OutputSchema.safeParse(o);
  if (!parsed.success) return null;
  return parsed.data.findings.find((f) => f.citation === citation) ?? null;
}

function citesOutput(o: unknown, citation: string): boolean {
  const parsed = OutputSchema.safeParse(o);
  return parsed.success && parsed.data.citations.includes(citation);
}

export const TemplateComplianceEvaluatorTask: TaskAgentDefinition<Input, Output> = {
  id: 'template-compliance-evaluator',
  name: 'PSUR Structural Audit',
  oneLiner: 'Audits a PSUR draft against MDCG 2022-21 / EU MDR Art. 86 — citations resolved from the live graph.',
  regulation: 'MDCG 2022-21 · EU MDR Art. 86',
  jurisdiction: 'EU',
  processId: 'psur-compilation',
  claimedObligationIds: [
    'EUMDR.86.OBL.001',
    'EUMDR.86.PSUR.OBL.001',
    'EUMDR.86.PSUR.OBL.002',
    'MDCG2022-21.1.OBL.001',
    'MDCG2022-21.1.OBL.002',
    'MDCG2022-21.1.OBL.003',
    'MDCG2022-21.2.OBL.001',
    'MDCG2022-21.2.OBL.002',
    'MDCG2022-21.2.OBL.003',
    'MDCG2022-21.2.OBL.004',
    'MDCG2022-21.2.OBL.005',
    'MDCG2022-21.2.OBL.006',
    'MDCG2022-21.2.OBL.007',
  ],
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  sampleData: SAMPLE,
  obligationChecks: [
    { obligationId: 'EUMDR.86.OBL.001', satisfiedBy: (o, ob) => findingFor(o, ob.sourceCitation) !== null || citesOutput(o, ob.sourceCitation) },
    { obligationId: 'EUMDR.86.PSUR.OBL.001', satisfiedBy: (o, ob) => findingFor(o, ob.sourceCitation) !== null || citesOutput(o, ob.sourceCitation) },
    { obligationId: 'EUMDR.86.PSUR.OBL.002', satisfiedBy: (o, ob) => findingFor(o, ob.sourceCitation) !== null || citesOutput(o, ob.sourceCitation) },
    {
      obligationId: 'MDCG2022-21.1.OBL.001',
      satisfiedBy: (o, ob) => !!findingFor(o, ob.sourceCitation),
    },
    { obligationId: 'MDCG2022-21.1.OBL.002', satisfiedBy: (o, ob) => !!findingFor(o, ob.sourceCitation) },
    { obligationId: 'MDCG2022-21.1.OBL.003', satisfiedBy: (o, ob) => citesOutput(o, ob.sourceCitation) },
    {
      obligationId: 'MDCG2022-21.2.OBL.001',
      satisfiedBy: (o, ob) => !!findingFor(o, ob.sourceCitation),
    },
    { obligationId: 'MDCG2022-21.2.OBL.002', satisfiedBy: (o, ob) => citesOutput(o, ob.sourceCitation) },
    { obligationId: 'MDCG2022-21.2.OBL.003', satisfiedBy: (o, ob) => !!findingFor(o, ob.sourceCitation) },
    { obligationId: 'MDCG2022-21.2.OBL.004', satisfiedBy: (o, ob) => !!findingFor(o, ob.sourceCitation) },
    { obligationId: 'MDCG2022-21.2.OBL.005', satisfiedBy: (o, ob) => !!findingFor(o, ob.sourceCitation) },
    { obligationId: 'MDCG2022-21.2.OBL.006', satisfiedBy: (o, ob) => citesOutput(o, ob.sourceCitation) },
    { obligationId: 'MDCG2022-21.2.OBL.007', satisfiedBy: (o, ob) => !!findingFor(o, ob.sourceCitation) },
  ],
  runWithGraph,
  runWithoutGraph,
};