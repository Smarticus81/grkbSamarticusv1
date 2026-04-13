import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const StatTrendInputSchema = z.object({
  series: z.array(z.number()).min(3),
  method: z.enum(['ucl_lcl', 'poisson', 'binomial']).default('ucl_lcl'),
});

export const StatTrendOutputSchema = z.object({
  method: z.string(),
  mean: z.number(),
  stddev: z.number(),
  controlLimits: z.object({ ucl: z.number(), lcl: z.number() }),
  signal: z.boolean(),
  pValue: z.number().optional(),
  addressedObligations: z.array(z.string()),
});

export type StatTrendInput = z.infer<typeof StatTrendInputSchema>;
export type StatTrendOutput = z.infer<typeof StatTrendOutputSchema>;

/**
 * Multi-method statistical trend agent. Uses Shewhart UCL/LCL by default;
 * supports Poisson rate testing and binomial proportion testing.
 */
export class StatisticalTrendAgent extends BaseGroundedAgent<StatTrendInput, StatTrendOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'StatisticalTrendAgent',
        description: 'Detects statistical trends using UCL/LCL, Poisson, or binomial methods.',
        version: '1.0.0',
        persona: 'You are a biostatistician.',
        systemPrompt: 'Apply the requested statistical method and report signal status.',
        processTypes: ['TREND'],
        requiredObligations: ['EUMDR.83.OBL.001'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return StatTrendOutputSchema;
  }
  protected async execute(
    input: StatTrendInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<StatTrendOutput> {
    const n = input.series.length;
    const mean = input.series.reduce((a, b) => a + b, 0) / n;
    const variance = input.series.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stddev = Math.sqrt(variance);
    const ucl = mean + 3 * stddev;
    const lcl = Math.max(0, mean - 3 * stddev);
    const latest = input.series[input.series.length - 1]!;
    let signal = latest > ucl || latest < lcl;
    let pValue: number | undefined;

    if (input.method === 'poisson') {
      // Poisson test: chance of seeing >= latest given mean rate.
      // Use complement of cumulative — approximated via normal for speed.
      const z = (latest - mean) / Math.max(Math.sqrt(mean), 1e-6);
      pValue = 1 - normalCdf(z);
      signal = pValue < 0.01;
    } else if (input.method === 'binomial') {
      const trials = n;
      const successes = input.series.filter((x) => x > 0).length;
      const p = successes / trials;
      const expected = p * trials;
      const z = (successes - expected) / Math.sqrt(Math.max(expected * (1 - p), 1e-6));
      pValue = 1 - normalCdf(z);
      signal = pValue < 0.01;
    }

    return {
      method: input.method,
      mean: Number(mean.toFixed(3)),
      stddev: Number(stddev.toFixed(3)),
      controlLimits: { ucl: Number(ucl.toFixed(3)), lcl: Number(lcl.toFixed(3)) },
      signal,
      pValue,
      addressedObligations: ['EUMDR.83.OBL.001'],
    };
  }
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}
