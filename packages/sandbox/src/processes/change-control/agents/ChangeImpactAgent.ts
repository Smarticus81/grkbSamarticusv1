import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const ImpactInputSchema = z.object({
  changeId: z.string(),
  scope: z.array(z.string()),
});

export const ImpactOutputSchema = z.object({
  changeId: z.string(),
  impactedComponents: z.array(z.string()),
  riskLevel: z.enum(['low', 'medium', 'high']),
  requiresRevalidation: z.boolean(),
  addressedObligations: z.array(z.string()),
});

export type ImpactInput = z.infer<typeof ImpactInputSchema>;
export type ImpactOutput = z.infer<typeof ImpactOutputSchema>;

export class ChangeImpactAgent extends BaseGroundedAgent<ImpactInput, ImpactOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'ChangeImpactAgent',
        description: 'Assesses impact of design/process changes per ISO 13485 §7.3.9.',
        version: '1.0.0',
        persona: 'You are a change control engineer.',
        systemPrompt: 'Assess impact and revalidation needs.',
        processTypes: ['CHANGE_CONTROL'],
        requiredObligations: ['ISO13485.7.3.9.OBL.001', 'ISO13485.7.3.9.OBL.002'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return ImpactOutputSchema;
  }
  protected async execute(
    input: ImpactInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<ImpactOutput> {
    const riskLevel: ImpactOutput['riskLevel'] =
      input.scope.length > 5 ? 'high' : input.scope.length > 2 ? 'medium' : 'low';
    return {
      changeId: input.changeId,
      impactedComponents: input.scope,
      riskLevel,
      requiresRevalidation: riskLevel !== 'low',
      addressedObligations: ['ISO13485.7.3.9.OBL.001', 'ISO13485.7.3.9.OBL.002'],
    };
  }
}
