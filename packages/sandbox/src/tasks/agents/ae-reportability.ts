/**
 * AE Reportability — given adverse-event facts, determines reportability
 * in EU, US and UK with the relevant clock and graph-resolved citation.
 *
 * Process tether: adverse-event-reportability.
 */

import { z } from 'zod';
import type { ObligationNode } from '@regground/core';
import type { TaskAgentDefinition, WithGraphContext } from '../types.js';

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

const SYSTEM_PROMPT = `You are a medical-device vigilance specialist deciding adverse-event reportability.
Given the event facts, return exactly THREE decisions, in this order: EU, US, UK. For each:
- reportable: boolean — is the event reportable in that jurisdiction?
- clockDays: the reporting deadline (in days) WHEN reportable, otherwise omit:
    EU = 15 days (but 2 days for a serious public-health threat)
    US = 30 days
    UK = 15 days
- reasoning: 1-2 sentences explaining WHY, naming the governing provision. Example:
    "A serious injury requiring hospitalization is a serious incident under EU MDR Article 87,
     which obliges the manufacturer to report within 15 days."
- citation: copy VERBATIM the source citation of the obligation that governs that jurisdiction:
    EU -> the citation listed for obligation EUMDR.87.OBL.001
    US -> the citation listed for obligation CFR820.198.OBL.002
    UK -> the citation listed for obligation UKMDR.2.OBL.001
Set "trendReportTriggered" to true when 3 or more similar events occurred in the prior 30 days.
Write a one-paragraph "summary" of the overall determination.
Put EVERY supplied source citation into the "citations" array. Decide strictly from the facts:
a serious injury, death, or public-health threat is reportable; lesser outcomes generally are not.`;

const SAMPLE: Input = {
  eventId: '',
  deviceClassification: 'IIa',
  patientOutcome: 'no_harm',
  rootCauseConfirmed: false,
  similarEventsIn30Days: 0,
  description: '',
};

function pickCitation(obligations: ObligationNode[], pattern: RegExp): string {
  return obligations.find((o) => pattern.test(o.sourceCitation))?.sourceCitation ?? '';
}

async function runWithGraph(input: Input, ctx: WithGraphContext): Promise<Output> {
  const isSerious =
    input.patientOutcome === 'serious_injury' ||
    input.patientOutcome === 'death' ||
    input.patientOutcome === 'public_health_threat';
  const isPublicHealth = input.patientOutcome === 'public_health_threat';
  const trend = input.similarEventsIn30Days >= 3;

  const euCitation = pickCitation(ctx.obligations, /EU MDR.*87|Article 87/i);
  const usCitation = pickCitation(ctx.obligations, /820\.198|21 CFR/i);
  const ukCitation = pickCitation(ctx.obligations, /UK MDR|reg\. 2/i);

  return {
    eventId: input.eventId,
    decisions: [
      {
        jurisdiction: 'EU',
        reportable: isSerious,
        clockDays: isPublicHealth ? 2 : isSerious ? 15 : undefined,
        reasoning: isSerious
          ? `Patient outcome '${input.patientOutcome}' qualifies as a serious incident under EU MDR Art. 87. 15-day clock applies; 2 days for serious public health threat.`
          : 'Outcome below serious-incident threshold.',
        citation: euCitation,
      },
      {
        jurisdiction: 'US',
        reportable: isSerious,
        clockDays: isSerious ? 30 : undefined,
        reasoning: isSerious
          ? 'Manufacturer must submit MDR for events that may have caused or contributed to a serious injury or death. 30-day clock under 21 CFR 803.50(a).'
          : 'Outcome does not meet 21 CFR 803 reporting threshold.',
        citation: usCitation,
      },
      {
        jurisdiction: 'UK',
        reportable: isSerious,
        clockDays: isSerious ? 15 : undefined,
        reasoning: isSerious
          ? 'UK MDR follows the EU "serious incident" definition; MHRA vigilance guidance imposes a 15-day clock.'
          : 'Below serious-incident threshold under UK vigilance guidance.',
        citation: ukCitation,
      },
    ],
    trendReportTriggered: trend,
    citations: ctx.obligations.map((o) => o.sourceCitation),
    summary: `${isSerious ? 'Serious-injury event' : 'Non-serious event'} with ${input.similarEventsIn30Days} similar events in the prior 30 days. Reportable: EU=${isSerious}, US=${isSerious}, UK=${isSerious}.${trend ? ' Trend reporting threshold met.' : ''}`,
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

function decisionFor(o: unknown, jur: 'EU' | 'US' | 'UK') {
  const parsed = OutputSchema.safeParse(o);
  if (!parsed.success) return null;
  return parsed.data.decisions.find((d) => d.jurisdiction === jur) ?? null;
}

export const AeReportabilityTask: TaskAgentDefinition<Input, Output> = {
  id: 'ae-reportability',
  name: 'AE Reportability',
  oneLiner: 'Decides whether an adverse event is reportable in EU, US, and UK with the relevant clock — citations resolved from the live graph.',
  regulation: 'EU MDR · 21 CFR 820 · UK MDR',
  jurisdiction: 'multi',
  processId: 'adverse-event-reportability',
  claimedObligationIds: [
    'EUMDR.87.OBL.001',
    'EUMDR.87.OBL.002',
    'EUMDR.87.OBL.003',
    'CFR820.198.OBL.002',
    'UKMDR.2.OBL.001',
    'ISO13485.8.2.2.OBL.004',
  ],
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  sampleData: SAMPLE,
  systemPrompt: SYSTEM_PROMPT,
  explainObligation: (output, ob) => {
    const parsed = OutputSchema.safeParse(output);
    if (!parsed.success) return undefined;
    // Match the jurisdiction decision whose citation is this obligation, and
    // surface its reasoning + clock as the trail "why".
    const d = parsed.data.decisions.find((dec) => dec.citation && dec.citation === ob.sourceCitation);
    if (d) {
      const clock = typeof d.clockDays === 'number' ? ` (${d.clockDays}-day reporting clock)` : '';
      return `${d.jurisdiction}: ${d.reasoning}${clock}`;
    }
    return parsed.data.summary;
  },
  explainGate: (output) => {
    const parsed = OutputSchema.safeParse(output);
    return parsed.success ? parsed.data.summary : undefined;
  },
  obligationChecks: [
    {
      obligationId: 'EUMDR.87.OBL.001',
      satisfiedBy: (o, ob) => {
        const d = decisionFor(o, 'EU');
        return !!d && d.citation === ob.sourceCitation;
      },
    },
    {
      obligationId: 'EUMDR.87.OBL.002',
      satisfiedBy: (o, ob) => {
        const parsed = OutputSchema.safeParse(o);
        return parsed.success && parsed.data.citations.includes(ob.sourceCitation);
      },
    },
    {
      obligationId: 'EUMDR.87.OBL.003',
      satisfiedBy: (o, ob) => {
        const d = decisionFor(o, 'EU');
        if (!d || !d.reportable) return false;
        const parsed = OutputSchema.safeParse(o);
        return !!parsed.success && typeof d.clockDays === 'number' && parsed.data.citations.includes(ob.sourceCitation);
      },
    },
    {
      obligationId: 'CFR820.198.OBL.002',
      satisfiedBy: (o, ob) => {
        const d = decisionFor(o, 'US');
        return !!d && d.citation === ob.sourceCitation;
      },
    },
    {
      obligationId: 'UKMDR.2.OBL.001',
      satisfiedBy: (o, ob) => {
        const d = decisionFor(o, 'UK');
        return !!d && d.citation === ob.sourceCitation;
      },
    },
    {
      obligationId: 'ISO13485.8.2.2.OBL.004',
      satisfiedBy: (o, ob) => {
        const parsed = OutputSchema.safeParse(o);
        return parsed.success && parsed.data.citations.includes(ob.sourceCitation);
      },
    },
  ],
  runWithGraph,
  runWithoutGraph,
};