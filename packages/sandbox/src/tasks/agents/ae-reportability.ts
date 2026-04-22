/**
 * AE Reportability — given a set of adverse-event facts, determine whether
 * the event is reportable in EU, US, and UK, with the relevant clock and
 * citation. Demonstrates jurisdiction-specific obligation walking.
 */

import { z } from 'zod';
import type { TaskAgentDefinition } from '../types.js';

const InputSchema = z.object({
  eventId: z.string(),
  deviceClassification: z.enum(['I', 'IIa', 'IIb', 'III']),
  patientOutcome: z.enum(['no_harm', 'temporary_harm', 'serious_injury', 'death', 'public_health_threat']),
  rootCauseConfirmed: z.boolean(),
  similarEventsIn30Days: z.number().int().nonnegative(),
  description: z.string().min(20),
});

const JurisdictionDecisionSchema = z.object({
  jurisdiction: z.enum(['EU', 'US', 'UK']),
  reportable: z.boolean(),
  clockDays: z.number().int().nonnegative().optional(),
  reasoning: z.string(),
  citation: z.string(),
});

const OutputSchema = z.object({
  eventId: z.string(),
  decisions: z.array(JurisdictionDecisionSchema).length(3),
  trendReportTriggered: z.boolean(),
  citations: z.array(z.string()),
  summary: z.string(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

const SAMPLE: Input = {
  eventId: 'AE-2026-0408-22',
  deviceClassification: 'IIb',
  patientOutcome: 'serious_injury',
  rootCauseConfirmed: false,
  similarEventsIn30Days: 4,
  description:
    'Implantable infusion pump delivered a 4x bolus dose during a programmed basal cycle. Patient hospitalized for 48h with stable recovery. Pump retrieved for failure analysis. Three other similar pump events flagged in the prior 30 days across EU sites.',
};

async function runWithGraph(input: Input): Promise<Output> {
  const isSerious = input.patientOutcome === 'serious_injury' || input.patientOutcome === 'death' || input.patientOutcome === 'public_health_threat';
  const isPublicHealth = input.patientOutcome === 'public_health_threat';
  const trend = input.similarEventsIn30Days >= 3;

  return {
    eventId: input.eventId,
    decisions: [
      {
        jurisdiction: 'EU',
        reportable: isSerious,
        clockDays: isPublicHealth ? 2 : isSerious ? 15 : undefined,
        reasoning: isSerious
          ? `Patient outcome '${input.patientOutcome}' qualifies as a serious incident under MDR Art. 2(65). 15-day clock applies; 2 days for serious public health threat.`
          : 'Outcome below serious incident threshold.',
        citation: 'EU MDR Art. 87(1)(a), Art. 2(65)',
      },
      {
        jurisdiction: 'US',
        reportable: isSerious,
        clockDays: isSerious ? 30 : undefined,
        reasoning: isSerious
          ? 'Manufacturer must submit MDR for events that may have caused or contributed to a serious injury or death. 30-day clock under 21 CFR 803.50(a).'
          : 'Outcome does not meet 21 CFR 803 reporting threshold.',
        citation: '21 CFR 803.50(a)',
      },
      {
        jurisdiction: 'UK',
        reportable: isSerious,
        clockDays: isSerious ? 15 : undefined,
        reasoning: isSerious
          ? 'UK MDR 2002 (as amended) and MHRA vigilance guidance follow EU MDR thresholds. 15-day clock for serious incidents.'
          : 'Below serious-incident threshold under UK vigilance guidance.',
        citation: 'UK MDR 2002 reg. 44; MHRA vigilance guidance',
      },
    ],
    trendReportTriggered: trend,
    citations: [
      'EU MDR Art. 87(1)(a)',
      'EU MDR Art. 2(65) — serious incident definition',
      'EU MDR Art. 88 — trend reporting',
      '21 CFR 803.50(a)',
      'UK MDR 2002 reg. 44',
    ],
    summary: `Serious-injury event with ${input.similarEventsIn30Days} similar events in the prior 30 days. Reportable in EU (15d), US (30d), UK (15d). Trend-reporting threshold met under EU MDR Art. 88.`,
  };
}

async function runWithoutGraph(input: Input): Promise<Output> {
  return {
    eventId: input.eventId,
    decisions: [
      { jurisdiction: 'EU', reportable: true,  reasoning: 'The event sounds serious so it should probably be reported.', citation: '' },
      { jurisdiction: 'US', reportable: true,  reasoning: 'The event involves a hospitalization so the FDA should be notified.', citation: '' },
      { jurisdiction: 'UK', reportable: false, reasoning: 'Not sure about UK requirements.', citation: '' },
    ],
    trendReportTriggered: false,
    citations: [],
    summary:
      'A serious adverse event involving an infusion pump caused a brief hospitalization. The event should likely be reported to regulators.',
  };
}

export const AeReportabilityTask: TaskAgentDefinition<Input, Output> = {
  id: 'ae-reportability',
  name: 'AE Reportability',
  oneLiner: 'Decides whether an adverse event is reportable in EU, US, and UK with the relevant clock.',
  regulation: 'EU MDR · 21 CFR 803 · UK MDR',
  jurisdiction: 'multi',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  sampleData: SAMPLE,
  obligations: [
    {
      obligationId: 'EU-MDR-87-1-A',
      regulation: 'EU MDR',
      citation: 'EU MDR Art. 87(1)(a)',
      summary: 'Determine whether the event is a serious incident requiring vigilance reporting and the applicable clock.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).decisions.some((d) => d.jurisdiction === 'EU' && (!d.reportable || typeof d.clockDays === 'number') && d.citation.length > 0),
    },
    {
      obligationId: '21-CFR-803-50',
      regulation: '21 CFR 820',
      citation: '21 CFR 803.50(a)',
      summary: 'Manufacturer reporting decision for the US.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).decisions.some((d) => d.jurisdiction === 'US' && d.citation.includes('803')),
    },
    {
      obligationId: 'UK-MDR-44',
      regulation: 'UK MDR',
      citation: 'UK MDR 2002 reg. 44',
      summary: 'UK MHRA vigilance reporting decision.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).decisions.some((d) => d.jurisdiction === 'UK' && d.citation.length > 0),
    },
    {
      obligationId: 'EU-MDR-88',
      regulation: 'EU MDR',
      citation: 'EU MDR Art. 88',
      summary: 'Trend report decision when similar events recur.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && typeof (o as Output).trendReportTriggered === 'boolean',
    },
  ],
  graphScript: [
    { method: 'getObligationsForProcess', args: { processType: 'vigilance', jurisdiction: 'EU' }, message: 'Looking up vigilance obligations for EU MDR…', resultCount: 9, citeObligationIds: ['EU-MDR-87-1-A', 'EU-MDR-88'] },
    { method: 'getObligationsForProcess', args: { processType: 'vigilance', jurisdiction: 'US' }, message: 'Looking up vigilance obligations under 21 CFR 803…',     resultCount: 7, citeObligationIds: ['21-CFR-803-50'] },
    { method: 'getObligationsForProcess', args: { processType: 'vigilance', jurisdiction: 'UK' }, message: 'Looking up MHRA vigilance obligations under UK MDR…',    resultCount: 5, citeObligationIds: ['UK-MDR-44'] },
    { method: 'explainObligation',         args: { obligationId: 'EU-MDR-2-65' },                  message: 'Resolving the EU MDR definition of "serious incident"…', resultCount: 1 },
    { method: 'findPath',                  args: { fromId: 'EU-MDR-87-1-A', toId: '21-CFR-803-50' }, message: 'Comparing EU MDR Art. 87 against 21 CFR 803.50…',      resultCount: 4 },
  ],
  runWithGraph,
  runWithoutGraph,
};
