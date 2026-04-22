/**
 * Template Compliance Evaluator — given a draft document outline,
 * evaluate whether it satisfies the structural and content requirements
 * of MDCG 2022-21 / EU MDR Annex II for technical documentation.
 */

import { z } from 'zod';
import type { TaskAgentDefinition } from '../types.js';

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
  documentTitle: 'PSUR — GlucoSense CGM Sensor v3 (2025)',
  documentType: 'PSUR',
  authorRole: 'PRRC',
  draftSections: [
    { heading: 'Executive Summary',                          wordCount: 420,  hasReferences: false },
    { heading: 'Device Description and Intended Purpose',    wordCount: 680,  hasReferences: true  },
    { heading: 'Sales and Estimated Population Exposed',     wordCount: 240,  hasReferences: true  },
    { heading: 'Conclusions of the Benefit-Risk Analysis',   wordCount: 510,  hasReferences: true  },
    { heading: 'Main Findings of PMCF',                      wordCount: 380,  hasReferences: true  },
    { heading: 'Volume of Sales',                            wordCount: 110,  hasReferences: false },
  ],
};

const PSUR_REQUIRED: Array<{ heading: string; citation: string }> = [
  { heading: 'Executive Summary',                                citation: 'MDCG 2022-21 §6.1' },
  { heading: 'Device Description and Intended Purpose',          citation: 'MDCG 2022-21 §6.2' },
  { heading: 'Sales and Estimated Population Exposed',           citation: 'MDCG 2022-21 §6.3' },
  { heading: 'Conclusions of the Benefit-Risk Analysis',         citation: 'MDCG 2022-21 §6.4' },
  { heading: 'Main Findings of PMCF',                            citation: 'MDCG 2022-21 §6.5' },
  { heading: 'Volume of Sales',                                  citation: 'MDCG 2022-21 §6.3' },
  { heading: 'Methods and Tools Used to Assess Performance',     citation: 'MDCG 2022-21 §6.6' },
  { heading: 'Trend Analysis Including Field Safety Actions',    citation: 'MDCG 2022-21 §6.7' },
];

async function runWithGraph(input: Input): Promise<Output> {
  const present = new Set(input.draftSections.map((s) => s.heading.toLowerCase()));
  const findings: Output['findings'] = PSUR_REQUIRED.map((req) => {
    const section = input.draftSections.find((s) => s.heading.toLowerCase() === req.heading.toLowerCase());
    if (!section) return { requirement: req.heading, citation: req.citation, status: 'missing' as const, note: 'Required section is absent from the draft.' };
    if (section.wordCount < 200 || !section.hasReferences) {
      return { requirement: req.heading, citation: req.citation, status: 'insufficient' as const, note: `Section is present but ${section.wordCount < 200 ? 'too short' : 'lacks supporting references'} for an MDCG-compliant PSUR.` };
    }
    return { requirement: req.heading, citation: req.citation, status: 'present' as const, note: 'Meets the MDCG section minimum.' };
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
    citations: ['MDCG 2022-21', 'EU MDR Annex II', 'EU MDR Art. 86'],
    recommendation: overall === 'compliant'
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

export const TemplateComplianceEvaluatorTask: TaskAgentDefinition<Input, Output> = {
  id: 'template-compliance-evaluator',
  name: 'Template Compliance Evaluator',
  oneLiner: 'Audits a PSUR/PMSR draft against MDCG 2022-21 structural requirements.',
  regulation: 'MDCG 2022-21 · EU MDR Annex II',
  jurisdiction: 'EU',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  sampleData: SAMPLE,
  obligations: [
    {
      obligationId: 'MDCG-2022-21-6-1',
      regulation: 'MDCG',
      citation: 'MDCG 2022-21 §6.1',
      summary: 'PSUR must include an executive summary.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).findings.some((f) => f.citation.includes('§6.1') && f.status === 'present'),
    },
    {
      obligationId: 'MDCG-2022-21-6-3',
      regulation: 'MDCG',
      citation: 'MDCG 2022-21 §6.3',
      summary: 'PSUR must report sales volume and estimated population exposed.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).findings.some((f) => f.citation.includes('§6.3')),
    },
    {
      obligationId: 'MDCG-2022-21-6-4',
      regulation: 'MDCG',
      citation: 'MDCG 2022-21 §6.4',
      summary: 'PSUR must include benefit-risk conclusions.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).findings.some((f) => f.citation.includes('§6.4') && f.status === 'present'),
    },
    {
      obligationId: 'MDCG-2022-21-6-7',
      regulation: 'MDCG',
      citation: 'MDCG 2022-21 §6.7',
      summary: 'PSUR must include trend analysis and field safety actions.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).findings.some((f) => f.citation.includes('§6.7')),
    },
    {
      obligationId: 'EU-MDR-86',
      regulation: 'EU MDR',
      citation: 'EU MDR Art. 86',
      summary: 'PSUR must conform to EU MDR Art. 86 obligations.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).citations.some((c) => c.includes('Art. 86')),
    },
  ],
  graphScript: [
    { method: 'getObligationsForProcess', args: { processType: 'psur', jurisdiction: 'EU' }, message: 'Looking up PSUR section requirements under MDCG 2022-21…', resultCount: 8, citeObligationIds: ['MDCG-2022-21-6-1', 'MDCG-2022-21-6-3', 'MDCG-2022-21-6-4', 'MDCG-2022-21-6-7'] },
    { method: 'explainObligation',         args: { obligationId: 'EU-MDR-86' },               message: 'Loading EU MDR Art. 86 PSUR obligation…',                  resultCount: 1, citeObligationIds: ['EU-MDR-86'] },
    { method: 'findPath',                  args: { fromId: 'MDCG-2022-21-6-7', toId: 'EU-MDR-88' }, message: 'Walking the cross-reference between PSUR trend section and MDR Art. 88…', resultCount: 2 },
  ],
  runWithGraph,
  runWithoutGraph,
};
