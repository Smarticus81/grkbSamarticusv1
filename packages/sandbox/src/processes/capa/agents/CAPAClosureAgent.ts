import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type GroundedAgentConfig,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const ClosureInputSchema = z.object({
  capaId: z.string(),
  effectivenessApproved: z.boolean(),
  approver: z.string(),
});

export const ClosureOutputSchema = z.object({
  capaId: z.string(),
  closedAt: z.string(),
  closureReport: z.string(),
  addressedObligations: z.array(z.string()),
});

export type ClosureInput = z.infer<typeof ClosureInputSchema>;
export type ClosureOutput = z.infer<typeof ClosureOutputSchema>;

export class CAPAClosureAgent extends BaseGroundedAgent<ClosureInput, ClosureOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    const config: GroundedAgentConfig = {
      name: 'CAPAClosureAgent',
      description: 'Generates the CAPA closure report and closes the record.',
      version: '1.0.0',
      persona: 'You are a CAPA records owner.',
      systemPrompt: 'Generate a closure report summarising the CAPA lifecycle and outcome.',
      processTypes: ['CAPA'],
      requiredObligations: ['ISO13485.8.5.2.OBL.003'],
    };
    super(config, deps);
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return ClosureOutputSchema;
  }
  protected async execute(
    input: ClosureInput,
    _obligations: ObligationNode[],
    _constraints: ConstraintNode[],
  ): Promise<ClosureOutput> {
    if (!input.effectivenessApproved) {
      throw new Error('Cannot close CAPA: effectiveness not approved');
    }
    return {
      capaId: input.capaId,
      closedAt: new Date().toISOString(),
      closureReport: `CAPA ${input.capaId} closed by ${input.approver}. Effectiveness verified.`,
      addressedObligations: ['ISO13485.8.5.2.OBL.003'],
    };
  }
}
