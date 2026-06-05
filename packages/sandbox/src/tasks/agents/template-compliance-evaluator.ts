/**
 * PSUR agents (EU MDR Art. 86 / MDCG 2022-21). Two complementary, LLM-driven
 * reviewers:
 *
 *   1. PSUR Content Review (`template-compliance-evaluator`)
 *      The document's *structure* is assumed to follow an already-approved
 *      template, so checking that sections merely exist adds little. This
 *      reviewer reads the actual CONTENT and judges, per obligation, whether
 *      the content substantively satisfies the regulatory requirement — met,
 *      partial, or gap — with case-specific reasoning, supporting evidence
 *      from the draft, and exactly what is missing to close each gap.
 *
 *   2. PSUR Template Reviewer (`psur-template-reviewer`)
 *      Run BEFORE a template enters change control. Given a proposed section
 *      outline, it cross-references each obligation to the section that would
 *      house it, judges coverage, and recommends structural changes so the
 *      template can satisfy the regulation.
 *
 * Both are LLM-driven (they declare a `systemPrompt`, so TaskRunner routes
 * them through grounded LLM generation — there is no deterministic content
 * fallback). The `runWithGraph` / `runWithoutGraph` bodies exist only to
 * satisfy the interface and the ungrounded comparison lane; they never run
 * in the product's grounded path.
 */

import { z } from 'zod';
import type { ObligationNode } from '@regground/core';
import type { TaskAgentDefinition, WithGraphContext } from '../types.js';

/* ─────────────────────────────────────────────────────────────────────
 * Shared PSUR obligation set (bound to process `psur-compilation`)
 * ─────────────────────────────────────────────────────────────────── */

const PSUR_OBLIGATION_IDS = [
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
] as const;

/* ═══════════════════════════════════════════════════════════════════════
 * 1. PSUR Content Review
 * ═════════════════════════════════════════════════════════════════════ */

const InputSchema = z.object({
  documentTitle: z.string(),
  documentType: z.enum(['PSUR', 'PMSR', 'PMCF', 'TechnicalDoc']),
  draftText: z
    .string()
    .min(40, 'Paste the document content to review (at least a few sentences).')
    .describe('Paste the full PSUR draft content here. The reviewer reads the content itself, not just the headings.'),
  authorRole: z.string().describe('Optional — your role, e.g. "Regulatory Affairs".'),
});

const ContentFindingSchema = z.object({
  obligationId: z.string().describe('The exact obligation ID this finding addresses.'),
  citation: z.string().describe('The source citation for the obligation (verbatim from the supplied set).'),
  requirement: z.string().describe('The regulatory requirement, in plain language.'),
  status: z
    .enum(['met', 'partial', 'gap'])
    .describe('met = content fully satisfies it; partial = present but inadequate/superficial; gap = content does not address it.'),
  assessment: z.string().describe('Your reasoning about THIS document\u2019s content for this requirement.'),
  evidence: z.string().describe('A short quote or paraphrase from the draft that supports the status (empty string if a gap).'),
  gap: z.string().describe('Precisely what is missing or must be strengthened to fully satisfy it (empty string if met).'),
});

const OutputSchema = z.object({
  documentTitle: z.string(),
  overallStatus: z.enum(['compliant', 'minor-gaps', 'major-gaps']),
  findings: z.array(ContentFindingSchema).min(1),
  addressedObligations: z.array(z.string()),
  citations: z.array(z.string()),
  recommendation: z.string(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

const SAMPLE: Input = {
  documentTitle: 'PSUR — Example Device Family',
  documentType: 'PSUR',
  authorRole: 'Regulatory Affairs',
  draftText: [
    'Section A: Executive Summary',
    'The benefit-risk profile remains unchanged for the reporting period 2024-2025. No new risks were identified.',
    '',
    'Section B: Device Description and Intended Purpose',
    'The device family is a Class IIa non-invasive product intended for in vitro use in clinical laboratories.',
    '',
    'Section C: Volume of Sales and Estimated Population Exposed',
    'A total of 319,432 units were distributed worldwide during the 24-month period. Population exposed is estimated at 280,000 patients.',
    '',
    'Section D: Conclusions of the Benefit-Risk Analysis',
    'The benefit-risk determination remains positive across the product family based on complaint trends and PMCF inputs.',
    '',
    'Section L: Main Findings of PMCF',
    'Placeholder - to be completed by the medical writing team.',
  ].join('\n'),
};

const CONTENT_SYSTEM_PROMPT =
  'You are a Regulatory Affairs reviewer assessing the CONTENT of a Periodic Safety Update Report (PSUR) under EU MDR Article 86 and MDCG 2022-21. '
  + 'The document\u2019s section structure is assumed to already follow an approved template, so do NOT simply check whether headings exist. '
  + 'Instead, read the actual content and judge, for EACH supplied obligation, whether the content substantively satisfies the regulatory requirement. '
  + 'Produce exactly one finding per supplied obligation ID, setting obligationId to the exact ID and citation to the matching supplied source citation. '
  + 'For each: state the requirement in plain language; judge status (met = content fully addresses it; partial = present but superficial, placeholder, or unsupported; gap = content does not address it); '
  + 'give a case-specific assessment grounded in what the document actually says; quote or paraphrase the supporting evidence from the draft (empty if a gap); '
  + 'and state precisely what must be added or strengthened to close any gap. Set overallStatus to major-gaps if any obligation is a gap, minor-gaps if any are partial, otherwise compliant. '
  + 'Cite only the supplied obligations; never invent a citation.';

/* Deterministic bodies — interface/baseline only; never the grounded path. */
function buildContentBaseline(input: Input, obligations: ObligationNode[]): Output {
  const source = obligations.length
    ? obligations
    : ([{ obligationId: 'UNGROUNDED', sourceCitation: '', title: 'Content adequacy assessment' }] as unknown as ObligationNode[]);
  const findings = source.map((ob) => ({
    obligationId: ob.obligationId,
    citation: ob.sourceCitation ?? '',
    requirement: ob.title ?? 'Content adequacy assessment',
    status: 'gap' as const,
    assessment:
      'Ungrounded baseline lane — content adequacy is only assessed by the grounded LLM reviewer, not in this comparison lane.',
    evidence: '',
    gap: 'Run the grounded reviewer to assess whether the content satisfies this obligation.',
  }));
  return {
    documentTitle: input.documentTitle || input.documentType,
    overallStatus: 'major-gaps',
    findings,
    addressedObligations: obligations.map((o) => o.obligationId),
    citations: obligations.map((o) => o.sourceCitation),
    recommendation: 'Ungrounded baseline: use the grounded LLM reviewer for a real content assessment.',
  };
}

function contentSatisfies(o: unknown, obligationId: string, citation: string): boolean {
  const p = OutputSchema.safeParse(o);
  if (!p.success) return false;
  return (
    p.data.findings.some((f) => f.obligationId === obligationId)
    && p.data.addressedObligations.includes(obligationId)
    && p.data.citations.includes(citation)
  );
}

export const TemplateComplianceEvaluatorTask: TaskAgentDefinition<Input, Output> = {
  id: 'template-compliance-evaluator',
  name: 'PSUR Content Review',
  oneLiner:
    'Paste a PSUR draft and review whether its content substantively satisfies each EU MDR Art. 86 / MDCG 2022-21 obligation.',
  regulation: 'MDCG 2022-21 · EU MDR Art. 86',
  jurisdiction: 'EU',
  processId: 'psur-compilation',
  claimedObligationIds: [...PSUR_OBLIGATION_IDS],
  systemPrompt: CONTENT_SYSTEM_PROMPT,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  sampleData: SAMPLE,
  explainObligation: (output, ob) => {
    const p = OutputSchema.safeParse(output);
    if (!p.success) return undefined;
    const f = p.data.findings.find((fd) => fd.obligationId === ob.obligationId);
    if (!f) return undefined;
    const tail = f.status === 'met' ? '' : f.gap ? ` Gap: ${f.gap}` : '';
    return `[${f.status}] ${f.assessment}${tail}`;
  },
  explainGate: (output) => {
    const p = OutputSchema.safeParse(output);
    return p.success ? p.data.recommendation : undefined;
  },
  obligationChecks: PSUR_OBLIGATION_IDS.map((id) => ({
    obligationId: id,
    satisfiedBy: (o: unknown, ob: ObligationNode) => contentSatisfies(o, id, ob.sourceCitation),
  })),
  async runWithGraph(input: Input, ctx: WithGraphContext): Promise<Output> {
    return buildContentBaseline(input, ctx.obligations);
  },
  async runWithoutGraph(input: Input): Promise<Output> {
    return buildContentBaseline(input, []);
  },
};

/* ═══════════════════════════════════════════════════════════════════════
 * 2. PSUR Template Reviewer  (pre-change-control)
 * ═════════════════════════════════════════════════════════════════════ */

const TemplateInputSchema = z.object({
  templateName: z.string(),
  sections: z
    .array(z.string().min(1))
    .min(1)
    .describe('The section headings of the proposed PSUR template, in order. One per item.'),
  deviceContext: z
    .string()
    .describe('Optional — device class/family and intended purpose, for context.'),
});

const CoverageSchema = z.object({
  obligationId: z.string().describe('The exact obligation ID being mapped.'),
  citation: z.string().describe('The source citation for the obligation (verbatim from the supplied set).'),
  requirement: z.string().describe('The regulatory requirement, in plain language.'),
  mappedSection: z.string().describe('The proposed template section that would house this requirement (empty string if none).'),
  status: z
    .enum(['covered', 'partial', 'not-covered'])
    .describe('covered = a section clearly houses it; partial = a section is related but the obligation would be under-served; not-covered = no section captures it.'),
  rationale: z.string().describe('Why this status — reason from the proposed section outline.'),
  recommendation: z.string().describe('The structural change needed (add/rename/split a section), or "" if covered.'),
});

const TemplateOutputSchema = z.object({
  templateName: z.string(),
  readiness: z.enum(['ready', 'minor-changes', 'major-changes']),
  coverage: z.array(CoverageSchema).min(1),
  missingSections: z.array(z.string()).describe('Sections that should be ADDED to the template.'),
  structuralRecommendations: z.array(z.string()),
  addressedObligations: z.array(z.string()),
  citations: z.array(z.string()),
  summary: z.string(),
});

type TemplateInput = z.infer<typeof TemplateInputSchema>;
type TemplateOutput = z.infer<typeof TemplateOutputSchema>;

const TEMPLATE_SAMPLE: TemplateInput = {
  templateName: 'Proposed PSUR Template v0.3 (pre-change-control)',
  deviceContext: 'Class IIb implantable cardiac device family.',
  sections: [
    'Executive Summary',
    'Device Description and Intended Purpose',
    'Volume of Sales and Population Exposed',
    'Conclusions of the Benefit-Risk Determination',
    'Complaint and Vigilance Summary',
  ],
};

const TEMPLATE_SYSTEM_PROMPT =
  'You are a Regulatory Affairs reviewer evaluating a PROPOSED PSUR template (a section outline) BEFORE it enters change control, under EU MDR Article 86 and MDCG 2022-21. '
  + 'The template defines the structure a future PSUR will be written into. For EACH supplied obligation, determine which proposed section would capture the required content, and judge coverage: '
  + 'covered = a section clearly houses it; partial = a section is related but the obligation would be under-served; not-covered = no section captures it. '
  + 'Produce exactly one coverage entry per supplied obligation ID, setting obligationId and citation to the exact supplied values, and mappedSection to the section heading (or empty string if none). '
  + 'Explain each status by reasoning from the proposed outline. Where partial or not-covered, recommend the precise structural change (add a section, rename or split an existing one). '
  + 'List any sections that must be added in missingSections, give broader structuralRecommendations, set readiness (ready / minor-changes / major-changes), and write a short summary. '
  + 'Cite only the supplied obligations; never invent a citation.';

function buildTemplateBaseline(input: TemplateInput, obligations: ObligationNode[]): TemplateOutput {
  const source = obligations.length
    ? obligations
    : ([{ obligationId: 'UNGROUNDED', sourceCitation: '', title: 'Coverage assessment' }] as unknown as ObligationNode[]);
  const coverage = source.map((ob) => ({
    obligationId: ob.obligationId,
    citation: ob.sourceCitation ?? '',
    requirement: ob.title ?? 'Coverage assessment',
    mappedSection: '',
    status: 'not-covered' as const,
    rationale:
      'Ungrounded baseline lane — coverage mapping is only produced by the grounded LLM reviewer, not in this comparison lane.',
    recommendation: 'Run the grounded reviewer for a real coverage assessment.',
  }));
  return {
    templateName: input.templateName,
    readiness: 'major-changes',
    coverage,
    missingSections: [],
    structuralRecommendations: ['Run the grounded LLM reviewer for an actual template assessment.'],
    addressedObligations: obligations.map((o) => o.obligationId),
    citations: obligations.map((o) => o.sourceCitation),
    summary: 'Ungrounded baseline: use the grounded LLM reviewer for a real template-coverage assessment.',
  };
}

function coverageSatisfies(o: unknown, obligationId: string, citation: string): boolean {
  const p = TemplateOutputSchema.safeParse(o);
  if (!p.success) return false;
  return (
    p.data.coverage.some((c) => c.obligationId === obligationId)
    && p.data.addressedObligations.includes(obligationId)
    && p.data.citations.includes(citation)
  );
}

export const PsurTemplateReviewerTask: TaskAgentDefinition<TemplateInput, TemplateOutput> = {
  id: 'psur-template-reviewer',
  name: 'PSUR Template Reviewer',
  oneLiner:
    'Submit a proposed PSUR template (section outline) and cross-reference each EU MDR Art. 86 / MDCG 2022-21 obligation to the section that would house it — before change control.',
  regulation: 'MDCG 2022-21 · EU MDR Art. 86',
  jurisdiction: 'EU',
  processId: 'psur-compilation',
  claimedObligationIds: [...PSUR_OBLIGATION_IDS],
  systemPrompt: TEMPLATE_SYSTEM_PROMPT,
  inputSchema: TemplateInputSchema,
  outputSchema: TemplateOutputSchema,
  sampleData: TEMPLATE_SAMPLE,
  chainHints: {
    downstream: [
      { taskId: 'template-compliance-evaluator', via: 'Once the approved template is filled in, review the draft\u2019s content against the same obligations.' },
    ],
  },
  explainObligation: (output, ob) => {
    const p = TemplateOutputSchema.safeParse(output);
    if (!p.success) return undefined;
    const c = p.data.coverage.find((cv) => cv.obligationId === ob.obligationId);
    if (!c) return undefined;
    const where = c.mappedSection ? ` (section: "${c.mappedSection}")` : '';
    const rec = c.status === 'covered' ? '' : c.recommendation ? ` Recommend: ${c.recommendation}` : '';
    return `[${c.status}]${where} ${c.rationale}${rec}`;
  },
  explainGate: (output) => {
    const p = TemplateOutputSchema.safeParse(output);
    return p.success ? p.data.summary : undefined;
  },
  obligationChecks: PSUR_OBLIGATION_IDS.map((id) => ({
    obligationId: id,
    satisfiedBy: (o: unknown, ob: ObligationNode) => coverageSatisfies(o, id, ob.sourceCitation),
  })),
  async runWithGraph(input: TemplateInput, ctx: WithGraphContext): Promise<TemplateOutput> {
    return buildTemplateBaseline(input, ctx.obligations);
  },
  async runWithoutGraph(input: TemplateInput): Promise<TemplateOutput> {
    return buildTemplateBaseline(input, []);
  },
};
