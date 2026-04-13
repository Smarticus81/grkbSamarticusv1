import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const NCInvestigationInputSchema = z.object({
  ncId: z.string(),
  classification: z.string(),
});

export const NCInvestigationOutputSchema = z.object({
  ncId: z.string(),
  findings: z.array(z.string()),
  needsCAPA: z.boolean(),
  addressedObligations: z.array(z.string()),
});

export type NCInvestigationInput = z.infer<typeof NCInvestigationInputSchema>;
export type NCInvestigationOutput = z.infer<typeof NCInvestigationOutputSchema>;

export class NCInvestigationAgent extends BaseGroundedAgent<
  NCInvestigationInput,
  NCInvestigationOutput
> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'NCInvestigationAgent',
        description: 'Investigates NC and recommends disposition.',
        version: '1.0.0',
        persona: 'You are a quality investigator.',
        systemPrompt: 'Investigate the NC and document findings.',
        processTypes: ['NONCONFORMANCE'],
        requiredObligations: ['ISO13485.8.3.OBL.002'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return NCInvestigationOutputSchema;
  }
  protected async execute(
    input: NCInvestigationInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<NCInvestigationOutput> {
    return {
      ncId: input.ncId,
      findings: [`Investigated NC ${input.ncId} (classification ${input.classification})`],
      needsCAPA: input.classification !== 'minor',
      addressedObligations: ['ISO13485.8.3.OBL.002'],
    };
  }
}
