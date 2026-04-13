import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type GroundedAgentConfig,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const EffectivenessInputSchema = z.object({
  capaId: z.string(),
  postImplementationMetrics: z.record(z.number()),
  baselineMetrics: z.record(z.number()),
});

export const EffectivenessOutputSchema = z.object({
  capaId: z.string(),
  effective: z.boolean(),
  improvementsByMetric: z.record(z.number()),
  rationale: z.string(),
  addressedObligations: z.array(z.string()),
});

export type EffectivenessInput = z.infer<typeof EffectivenessInputSchema>;
export type EffectivenessOutput = z.infer<typeof EffectivenessOutputSchema>;

export class EffectivenessCheckAgent extends BaseGroundedAgent<
  EffectivenessInput,
  EffectivenessOutput
> {
  constructor(deps: BaseGroundedAgentDeps) {
    const config: GroundedAgentConfig = {
      name: 'EffectivenessCheckAgent',
      description: 'Verifies that implemented CAPA actions resolved the root cause.',
      version: '1.0.0',
      persona: 'You are a CAPA verification engineer.',
      systemPrompt: 'Compare post-implementation metrics to baseline. Confirm effectiveness or recommend rework.',
      processTypes: ['CAPA'],
      requiredObligations: ['ISO13485.8.5.2.OBL.003'],
    };
    super(config, deps);
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return EffectivenessOutputSchema;
  }
  protected async execute(
    input: EffectivenessInput,
    _obligations: ObligationNode[],
    _constraints: ConstraintNode[],
  ): Promise<EffectivenessOutput> {
    const improvements: Record<string, number> = {};
    let effective = true;
    for (const [k, post] of Object.entries(input.postImplementationMetrics)) {
      const base = input.baselineMetrics[k] ?? 0;
      const delta = base === 0 ? 0 : (base - post) / base;
      improvements[k] = Number(delta.toFixed(3));
      if (delta < 0.1) effective = false;
    }
    return {
      capaId: input.capaId,
      effective,
      improvementsByMetric: improvements,
      rationale: effective
        ? 'Metrics improved by ≥10% across all measures.'
        : 'One or more metrics did not improve sufficiently; rework recommended.',
      addressedObligations: ['ISO13485.8.5.2.OBL.003'],
    };
  }
}
