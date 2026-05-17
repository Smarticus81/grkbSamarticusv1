/**
 * Trend Determination — given a window of complaint counts, decide
 * whether a statistical trend has been established and whether a CAPA /
 * trend report is required. Citations resolved from the live graph for
 * the `trend-determination` process.
 */

import { z } from 'zod';
import type { ObligationNode } from '@regground/core';
import type { TaskAgentDefinition, WithGraphContext } from '../types.js';

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
  deviceFamily: '',
  windowDays: 30,
  baselineRatePerKUnits: 0.1,
  observedCount: 0,
  unitsInField: 1,
  failureMode: '',
};

async function runWithGraph(input: Input, ctx: WithGraphContext): Promise<Output> {
  const observedRate = (input.observedCount / input.unitsInField) * 1000;
  const ratio = observedRate / input.baselineRatePerKUnits;
  const trend = ratio >= 2.0;
  const capa = ratio >= 1.5;

  const trendCitation = ctx.obligations.find((o) => /85|88|trend|MDCG/i.test(o.title) || /85|88/.test(o.sourceCitation));
  const capaCitation = ctx.obligations.find((o) => /8\.5\.2|corrective/i.test(o.title) || /8\.5\.2/.test(o.sourceCitation));

  return {
    deviceFamily: input.deviceFamily,
    observedRatePerKUnits: Number(observedRate.toFixed(3)),
    baselineRatePerKUnits: input.baselineRatePerKUnits,
    ratio: Number(ratio.toFixed(2)),
    trendEstablished: trend,
    trendReportRequired: trend,
    capaTriggered: capa,
    rationale: trend
      ? `Observed rate ${observedRate.toFixed(2)}/kU is ${ratio.toFixed(2)}× the baseline of ${input.baselineRatePerKUnits}/kU over a ${input.windowDays}-day window — exceeds the 2× trend threshold.`
      : `Observed ratio ${ratio.toFixed(2)}× baseline does not exceed the trend-report threshold; continued monitoring recommended.`,
    citations: ctx.obligations.map((o) => o.sourceCitation),
    recommendedActions: [
      trend
        ? `Submit trend report per ${trendCitation?.sourceCitation ?? 'applicable PMS regulation'} within the regulatory clock.`
        : 'Continue monitoring — re-evaluate next reporting cycle.',
      capa
        ? `Open a CAPA per ${capaCitation?.sourceCitation ?? 'applicable corrective-action obligation'} with root-cause focus on ${input.failureMode}.`
        : 'Document analysis in the QMS without opening a CAPA.',
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
    trendEstablished: false,
    trendReportRequired: false,
    capaTriggered: false,
    rationale: `Observed ${observedRate.toFixed(2)}/kU vs baseline ${input.baselineRatePerKUnits}/kU. Difference noted but no clear trend threshold available.`,
    citations: [],
    recommendedActions: ['Review the data with quality engineering.'],
  };
}

function citesObligation(o: unknown, ob: ObligationNode): boolean {
  const parsed = OutputSchema.safeParse(o);
  return parsed.success && parsed.data.citations.includes(ob.sourceCitation);
}

export const TrendDeterminationTask: TaskAgentDefinition<Input, Output> = {
  id: 'trend-determination',
  name: 'Trend Determination',
  oneLiner: 'Decides whether a complaint frequency constitutes a reportable trend — citations resolved from the live graph.',
  regulation: 'EU MDR · ISO 13485 · MDCG 2022-21',
  jurisdiction: 'EU',
  processId: 'trend-determination',
  claimedObligationIds: [
    'ISO13485.8.4.OBL.001',
    'ISO13485.8.4.OBL.002',
    'ISO13485.8.2.1.OBL.002',
    'ISO13485.8.2.1.OBL.003',
    'ISO13485.8.5.2.OBL.001',
    'ISO13485.8.5.3.OBL.001',
    'EUMDR.83.OBL.001',
    'EUMDR.84.OBL.001',
    'EUMDR.85.OBL.001',
    'MDCG2022-21.2.OBL.007',
  ],
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  sampleData: SAMPLE,
  obligationChecks: [
    { obligationId: 'ISO13485.8.4.OBL.001', satisfiedBy: (o, ob) => citesObligation(o, ob) },
    { obligationId: 'ISO13485.8.4.OBL.002', satisfiedBy: (o, ob) => citesObligation(o, ob) },
    { obligationId: 'ISO13485.8.2.1.OBL.002', satisfiedBy: (o, ob) => citesObligation(o, ob) },
    { obligationId: 'ISO13485.8.2.1.OBL.003', satisfiedBy: (o, ob) => citesObligation(o, ob) },
    {
      obligationId: 'ISO13485.8.5.2.OBL.001',
      satisfiedBy: (o, ob) => {
        const parsed = OutputSchema.safeParse(o);
        return parsed.success && typeof parsed.data.capaTriggered === 'boolean' && citesObligation(o, ob);
      },
    },
    { obligationId: 'ISO13485.8.5.3.OBL.001', satisfiedBy: (o, ob) => citesObligation(o, ob) },
    { obligationId: 'EUMDR.83.OBL.001',       satisfiedBy: (o, ob) => citesObligation(o, ob) },
    { obligationId: 'EUMDR.84.OBL.001',       satisfiedBy: (o, ob) => citesObligation(o, ob) },
    {
      obligationId: 'EUMDR.85.OBL.001',
      satisfiedBy: (o, ob) => {
        const parsed = OutputSchema.safeParse(o);
        return parsed.success && typeof parsed.data.trendReportRequired === 'boolean' && citesObligation(o, ob);
      },
    },
    { obligationId: 'MDCG2022-21.2.OBL.007', satisfiedBy: (o, ob) => citesObligation(o, ob) },
  ],
  runWithGraph,
  runWithoutGraph,
};