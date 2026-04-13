import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type GroundedAgentConfig,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const RootCauseInputSchema = z.object({
  capaId: z.string(),
  observations: z.array(z.string()).min(1),
});

export const RootCauseOutputSchema = z.object({
  capaId: z.string(),
  method: z.enum(['5-Why', 'Ishikawa', 'FaultTree']),
  whyChain: z.array(z.string()),
  rootCause: z.string(),
  contributingFactors: z.array(z.string()),
  addressedObligations: z.array(z.string()),
});

export type RootCauseInput = z.infer<typeof RootCauseInputSchema>;
export type RootCauseOutput = z.infer<typeof RootCauseOutputSchema>;

export class RootCauseAnalysisAgent extends BaseGroundedAgent<RootCauseInput, RootCauseOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    const config: GroundedAgentConfig = {
      name: 'RootCauseAnalysisAgent',
      description: 'Performs 5-Why / Ishikawa / fault tree root cause analysis on CAPA observations.',
      version: '1.0.0',
      persona: 'You are a quality engineer trained in ISO 13485 root cause investigation.',
      systemPrompt:
        'Apply 5-Why analysis to derive the root cause. Document the why chain and contributing factors.',
      processTypes: ['CAPA'],
      requiredObligations: ['ISO13485.8.5.2.OBL.002'],
    };
    super(config, deps);
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return RootCauseOutputSchema;
  }
  protected async execute(
    input: RootCauseInput,
    _obligations: ObligationNode[],
    _constraints: ConstraintNode[],
  ): Promise<RootCauseOutput> {
    // Deterministic 5-Why scaffold; agents using the LLM helper would call
    // this.invokeLLMForJSON(...) with this.config.systemPrompt + obligations.
    const whyChain = input.observations.flatMap((obs, i) => [
      `Why-${i + 1}: ${obs}`,
      `Why-${i + 1}b: drilling deeper into "${obs}"`,
    ]);
    return {
      capaId: input.capaId,
      method: '5-Why',
      whyChain,
      rootCause: `Primary contributor: ${input.observations[0]}`,
      contributingFactors: input.observations.slice(1),
      addressedObligations: ['ISO13485.8.5.2.OBL.002'],
    };
  }
}
