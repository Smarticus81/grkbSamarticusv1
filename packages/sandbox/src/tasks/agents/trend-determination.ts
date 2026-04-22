/**
 * Trend Determination — given a window of complaint counts, decide whether
 * a statistical trend has been established under EU MDR Art. 88 / ISO 13485
 * §8.4. Demonstrates an analytical agent grounded in regulatory thresholds.
 */

import { z } from 'zod';
import type { TaskAgentDefinition } from '../types.js';

const InputSchema = z.object({
  deviceFamily: z.string(),
  windowDays: z.number().int().positive(),
  baselineRatePerKUnits: z.number().positive(),
  observedCount: z.number().int().nonnegative(),
  unitsInField: z.number().int().positive(),
  failureMode: z.string(),
});

const OutputSchema = z.object({
  deviceFamily: z.string(),
  observedRatePerKUnits: z.number(),
  baselineRatePerKUnits: z.number(),
  ratio: z.number(),
  trendEstablished: z.boolean(),
  trendReportRequired: z.boolean(),
  capaTriggered: z.boolean(),
  rationale: z.string(),
  citations: z.array(z.string()),
  recommendedActions: z.array(z.string()),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

const SAMPLE: Input = {
  deviceFamily: 'CardioFlow ICD Lead L7',
  windowDays: 30,
  baselineRatePerKUnits: 0.12,
  observedCount: 9,
  unitsInField: 18_500,
  failureMode: 'Insulation breach at proximal coil',
};

async function runWithGraph(input: Input): Promise<Output> {
  const observedRate = (input.observedCount / input.unitsInField) * 1000;
  const ratio = observedRate / input.baselineRatePerKUnits;
  const trend = ratio >= 2.0;
  const trendReport = trend; // EU MDR Art. 88 threshold met
  const capa = ratio >= 1.5;  // ISO 13485 §8.4 / 8.5 trigger
  return {
    deviceFamily: input.deviceFamily,
    observedRatePerKUnits: Number(observedRate.toFixed(3)),
    baselineRatePerKUnits: input.baselineRatePerKUnits,
    ratio: Number(ratio.toFixed(2)),
    trendEstablished: trend,
    trendReportRequired: trendReport,
    capaTriggered: capa,
    rationale: trend
      ? `Observed rate ${observedRate.toFixed(2)}/kU is ${ratio.toFixed(2)}× the baseline of ${input.baselineRatePerKUnits}/kU over a ${input.windowDays}-day window — exceeds the EU MDR Art. 88 trend threshold (≥2× baseline).`
      : `Observed ratio ${ratio.toFixed(2)}× baseline does not exceed the trend-report threshold; continued monitoring recommended.`,
    citations: [
      'EU MDR Art. 88(1)',
      'ISO 13485:2016 §8.4 — analysis of data',
      'ISO 13485:2016 §8.5.2 — corrective action',
      'MDCG 2023-3 — trend reporting Q&A',
    ],
    recommendedActions: [
      trendReport ? 'Submit MIR trend report to EUDAMED within 15 days.' : 'Continue monitoring — re-evaluate next reporting cycle.',
      capa ? 'Open a CAPA per ISO 13485 §8.5.2 with root-cause focus on the proximal-coil insulation.' : 'Document analysis in the QMS without opening a CAPA.',
      'Notify the Notified Body if the field rate continues to rise.',
    ],
  };
}

async function runWithoutGraph(input: Input): Promise<Output> {
  const observedRate = (input.observedCount / input.unitsInField) * 1000;
  return {
    deviceFamily: input.deviceFamily,
    observedRatePerKUnits: Number(observedRate.toFixed(3)),
    baselineRatePerKUnits: input.baselineRatePerKUnits,
    ratio: Number((observedRate / input.baselineRatePerKUnits).toFixed(2)),
    trendEstablished: false, // Without the threshold, the agent guesses no
    trendReportRequired: false,
    capaTriggered: false,
    rationale: `Observed ${observedRate.toFixed(2)}/kU vs baseline ${input.baselineRatePerKUnits}/kU. Difference noted but no clear trend threshold available.`,
    citations: [],
    recommendedActions: ['Review the data with quality engineering.'],
  };
}

export const TrendDeterminationTask: TaskAgentDefinition<Input, Output> = {
  id: 'trend-determination',
  name: 'Trend Determination',
  oneLiner: 'Decides whether a complaint frequency constitutes a reportable trend under EU MDR Art. 88.',
  regulation: 'EU MDR · ISO 13485 · MDCG 2023-3',
  jurisdiction: 'EU',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  sampleData: SAMPLE,
  obligations: [
    {
      obligationId: 'EU-MDR-88-1',
      regulation: 'EU MDR',
      citation: 'EU MDR Art. 88(1)',
      summary: 'Submit a trend report when a statistically significant increase is observed.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && typeof (o as Output).trendReportRequired === 'boolean' && (o as Output).citations.some((c) => c.includes('Art. 88')),
    },
    {
      obligationId: 'ISO-13485-8-4',
      regulation: 'ISO 13485',
      citation: 'ISO 13485:2016 §8.4',
      summary: 'Analyze data from monitoring to demonstrate QMS effectiveness.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).citations.some((c) => c.includes('§8.4')),
    },
    {
      obligationId: 'ISO-13485-8-5-2',
      regulation: 'ISO 13485',
      citation: 'ISO 13485:2016 §8.5.2',
      summary: 'Open a CAPA when nonconformities trend upward.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && typeof (o as Output).capaTriggered === 'boolean' && (o as Output).citations.some((c) => c.includes('§8.5.2')),
    },
    {
      obligationId: 'MDCG-2023-3',
      regulation: 'MDCG',
      citation: 'MDCG 2023-3',
      summary: 'Apply MDCG trend-reporting Q&A guidance for thresholds.',
      satisfiedBy: (o) => OutputSchema.safeParse(o).success && (o as Output).citations.some((c) => c.includes('MDCG 2023-3')),
    },
  ],
  graphScript: [
    { method: 'getObligationsForProcess', args: { processType: 'trend-reporting', jurisdiction: 'EU' }, message: 'Looking up trend-reporting obligations under EU MDR…', resultCount: 6, citeObligationIds: ['EU-MDR-88-1', 'MDCG-2023-3'] },
    { method: 'explainObligation',         args: { obligationId: 'EU-MDR-88-1' },                       message: 'Loading the EU MDR Art. 88 trend-threshold criteria…',     resultCount: 1 },
    { method: 'getObligationsForProcess', args: { processType: 'capa', jurisdiction: 'EU' },           message: 'Cross-walking to CAPA obligations under ISO 13485…',       resultCount: 4, citeObligationIds: ['ISO-13485-8-4', 'ISO-13485-8-5-2'] },
    { method: 'findPath',                  args: { fromId: 'EU-MDR-88-1', toId: 'ISO-13485-8-5-2' },     message: 'Walking the cross-reference from MDR Art. 88 to ISO §8.5.2…', resultCount: 2 },
  ],
  runWithGraph,
  runWithoutGraph,
};
