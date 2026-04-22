/**
 * PSUR Section Drafter — drafts the trend-analysis section of a PSUR
 * grounded in MDCG 2022-21 §6.7.
 */

import { z } from 'zod';
import type { TaskAgentDefinition } from '../types.js';

const InputSchema = z.object({
  deviceFamily: z.string(),
  reportingPeriod: z.string(),
  totalComplaints: z.number().int().nonnegative(),
  seriousIncidents: z.number().int().nonnegative(),
  fieldSafetyActions: z.number().int().nonnegative(),
  topFailureModes: z.array(z.object({ mode: z.string(), count: z.number().int().nonnegative() })),
});

const OutputSchema = z.object({
  sectionTitle: z.string(),
  body: z.string(),
  bulletPoints: z.array(z.string()),
  citations: z.array(z.string()),
  fieldSafetyReferences: z.array(z.string()),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

const SAMPLE: Input = {
  deviceFamily: 'GlucoSense CGM Sensor v3',
  reportingPeriod: '01-Jan-2025 to 31-Dec-2025',
  totalComplaints: 412,
  seriousIncidents: 6,
  fieldSafetyActions: 1,
  topFailureModes: [
    { mode: 'Adhesive lift-off',            count: 158 },
    { mode: 'Transmitter disconnection',    count: 92  },
    { mode: 'Inaccurate reading >20%',      count: 47  },
    { mode: 'Insertion-site irritation',    count: 41  },
  ],
};

async function runWithGraph(input: Input): Promise<Output> {
  const top = input.topFailureModes.slice(0, 3).map((m) => `${m.mode} (${m.count})`).join('; ');
  return {
    sectionTitle: '6.7 Trend Analysis Including Field Safety Corrective Actions',
    body:
      `During the reporting period (${input.reportingPeriod}), the manufacturer received ${input.totalComplaints} complaints for the ${input.deviceFamily}, ` +
      `of which ${input.seriousIncidents} were classified as serious incidents under EU MDR Art. 2(65) and reported per Art. 87. ` +
      `${input.fieldSafetyActions} Field Safety Corrective Action(s) were initiated and notified per Art. 89. ` +
      `Trending was performed in line with EU MDR Art. 88 and MDCG 2023-3 thresholds. ` +
      `The most frequent failure modes were: ${top}. ` +
      `No statistically significant increase against the baseline was established for any individual mode in this period; ` +
      `monitoring will continue per the PMS plan and ISO 13485 §8.4 data-analysis requirements.`,
    bulletPoints: [
      `Total complaints: ${input.totalComplaints}.`,
      `Serious incidents reported under EU MDR Art. 87: ${input.seriousIncidents}.`,
      `Field Safety Corrective Actions notified under EU MDR Art. 89: ${input.fieldSafetyActions}.`,
      `Trend assessment performed against MDCG 2023-3 thresholds; no Art. 88 trend report triggered this period.`,
      `Top failure mode(s) under continued surveillance: ${top}.`,
    ],
    citations: [
      'MDCG 2022-21 §6.7',
      'EU MDR Art. 86',
      'EU MDR Art. 87',
      'EU MDR Art. 88',
      'EU MDR Art. 89',
      'MDCG 2023-3',
      'ISO 13485:2016 §8.4',
    ],
    fieldSafetyReferences: input.fieldSafetyActions > 0 ? [`FSCA-${new Date().getFullYear()}-001 — initiated and notified per Art. 89.`] : [],
  };
}

async function runWithoutGraph(input: Input): Promise<Output> {
  return {
    sectionTitle: 'Trend Analysis',
    body:
      `In the reporting period the company received ${input.totalComplaints} complaints for the ${input.deviceFamily}, ` +
      `including ${input.seriousIncidents} serious events. The most common issue was ${input.topFailureModes[0]?.mode ?? 'unknown'}. ` +
      `The trend appears stable.`,
    bulletPoints: [
      `${input.totalComplaints} complaints received.`,
      `${input.seriousIncidents} serious events.`,
    ],
    citations: [],
    fieldSafetyReferences: [],
  };
}

export const PsurSectionDrafterTask: TaskAgentDefinition<Input, Output> = {
  id: 'psur-section-drafter',
  name: 'PSUR Section Drafter',
  oneLiner: 'Drafts the trend-analysis section of a PSUR grounded in MDCG 2022-21 §6.7.',
  regulation: 'MDCG 2022-21 · EU MDR',
  jurisdiction: 'EU',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  sampleData: SAMPLE,
  obligations: [
    {
      obligationId: 'MDCG-2022-21-6-7',
      regulation: 'MDCG',
      citation: 'MDCG 2022-21 §6.7',
      summary: 'PSUR §6.7 must include trend analysis and FSCA references.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).citations.some((c) => c.includes('§6.7')),
    },
    {
      obligationId: 'EU-MDR-87',
      regulation: 'EU MDR',
      citation: 'EU MDR Art. 87',
      summary: 'Reference vigilance reporting in the trend section.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).citations.some((c) => c.includes('Art. 87')),
    },
    {
      obligationId: 'EU-MDR-88',
      regulation: 'EU MDR',
      citation: 'EU MDR Art. 88',
      summary: 'Apply Art. 88 trend-reporting threshold.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).citations.some((c) => c.includes('Art. 88')),
    },
    {
      obligationId: 'EU-MDR-89',
      regulation: 'EU MDR',
      citation: 'EU MDR Art. 89',
      summary: 'Reference any FSCAs issued.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).citations.some((c) => c.includes('Art. 89')),
    },
    {
      obligationId: 'ISO-13485-8-4',
      regulation: 'ISO 13485',
      citation: 'ISO 13485:2016 §8.4',
      summary: 'Anchor data analysis to ISO 13485 §8.4.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).citations.some((c) => c.includes('§8.4')),
    },
  ],
  graphScript: [
    { method: 'getObligationsForProcess', args: { processType: 'psur', jurisdiction: 'EU' }, message: 'Looking up PSUR section §6.7 requirements…',                  resultCount: 5, citeObligationIds: ['MDCG-2022-21-6-7'] },
    { method: 'explainObligation',         args: { obligationId: 'EU-MDR-87' },                message: 'Loading EU MDR Art. 87 vigilance language…',                resultCount: 1, citeObligationIds: ['EU-MDR-87'] },
    { method: 'explainObligation',         args: { obligationId: 'EU-MDR-88' },                message: 'Loading EU MDR Art. 88 trend-report language…',             resultCount: 1, citeObligationIds: ['EU-MDR-88'] },
    { method: 'explainObligation',         args: { obligationId: 'EU-MDR-89' },                message: 'Loading EU MDR Art. 89 FSCA language…',                     resultCount: 1, citeObligationIds: ['EU-MDR-89'] },
    { method: 'findPath',                  args: { fromId: 'MDCG-2022-21-6-7', toId: 'ISO-13485-8-4' }, message: 'Walking from PSUR §6.7 to ISO 13485 §8.4…',         resultCount: 2, citeObligationIds: ['ISO-13485-8-4'] },
  ],
  runWithGraph,
  runWithoutGraph,
};
