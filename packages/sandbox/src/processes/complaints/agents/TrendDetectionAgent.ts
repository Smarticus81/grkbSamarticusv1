import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const TrendInputSchema = z.object({
  series: z.array(z.number()).min(2),
  windowDays: z.number().default(30),
});

export const TrendOutputSchema = z.object({
  mean: z.number(),
  stddev: z.number(),
  ucl: z.number(),
  lcl: z.number(),
  signal: z.boolean(),
  signalReason: z.string(),
  addressedObligations: z.array(z.string()),
});

export type TrendInput = z.infer<typeof TrendInputSchema>;
export type TrendOutput = z.infer<typeof TrendOutputSchema>;

/**
 * Detects statistical trends using 3σ control limits (UCL/LCL). When the
 * latest point breaches a limit, raises a signal that should trigger CAPA
 * (TRIGGERS edge in the obligation graph).
 */
export class TrendDetectionAgent extends BaseGroundedAgent<TrendInput, TrendOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'TrendDetectionAgent',
        description: 'Detects statistical trends in complaint volume using UCL/LCL control charts.',
        version: '1.0.0',
        persona: 'You are a statistical quality engineer.',
        systemPrompt: 'Compute UCL/LCL and identify signals.',
        processTypes: ['COMPLAINT', 'TREND'],
        requiredObligations: ['EUMDR.83.OBL.001'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return TrendOutputSchema;
  }
  protected async execute(
    input: TrendInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<TrendOutput> {
    const n = input.series.length;
    const mean = input.series.reduce((a, b) => a + b, 0) / n;
    const variance = input.series.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stddev = Math.sqrt(variance);
    const ucl = mean + 3 * stddev;
    const lcl = Math.max(0, mean - 3 * stddev);
    const latest = input.series[input.series.length - 1]!;
    const signal = latest > ucl || latest < lcl;
    return {
      mean: Number(mean.toFixed(3)),
      stddev: Number(stddev.toFixed(3)),
      ucl: Number(ucl.toFixed(3)),
      lcl: Number(lcl.toFixed(3)),
      signal,
      signalReason: signal
        ? `Latest value ${latest} breached ${latest > ucl ? 'UCL' : 'LCL'}`
        : 'Within control limits',
      addressedObligations: ['EUMDR.83.OBL.001'],
    };
  }
}
