import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type GroundedAgentConfig,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const ActionPlanInputSchema = z.object({
  capaId: z.string(),
  rootCause: z.string(),
});

export const ActionPlanOutputSchema = z.object({
  capaId: z.string(),
  correctiveActions: z.array(
    z.object({ id: z.string(), description: z.string(), owner: z.string(), dueDate: z.string() }),
  ),
  preventiveActions: z.array(
    z.object({ id: z.string(), description: z.string(), owner: z.string(), dueDate: z.string() }),
  ),
  addressedObligations: z.array(z.string()),
});

export type ActionPlanInput = z.infer<typeof ActionPlanInputSchema>;
export type ActionPlanOutput = z.infer<typeof ActionPlanOutputSchema>;

export class ActionPlanAgent extends BaseGroundedAgent<ActionPlanInput, ActionPlanOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    const config: GroundedAgentConfig = {
      name: 'ActionPlanAgent',
      description: 'Proposes corrective and preventive actions proportionate to the nonconformity.',
      version: '1.0.0',
      persona: 'You are a CAPA owner accountable to ISO 13485 §8.5.2/§8.5.3.',
      systemPrompt: 'Propose proportionate corrective and preventive actions. Assign owner + due date.',
      processTypes: ['CAPA'],
      requiredObligations: ['ISO13485.8.5.2.OBL.002', 'ISO13485.8.5.3.OBL.001'],
    };
    super(config, deps);
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return ActionPlanOutputSchema;
  }
  protected async execute(
    input: ActionPlanInput,
    _obligations: ObligationNode[],
    _constraints: ConstraintNode[],
  ): Promise<ActionPlanOutput> {
    const due = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    return {
      capaId: input.capaId,
      correctiveActions: [
        {
          id: `${input.capaId}-CA-1`,
          description: `Address root cause: ${input.rootCause}`,
          owner: 'quality_engineer',
          dueDate: due,
        },
      ],
      preventiveActions: [
        {
          id: `${input.capaId}-PA-1`,
          description: 'Update related procedures and training to prevent recurrence',
          owner: 'process_owner',
          dueDate: due,
        },
      ],
      addressedObligations: ['ISO13485.8.5.2.OBL.002', 'ISO13485.8.5.3.OBL.001'],
    };
  }
}
