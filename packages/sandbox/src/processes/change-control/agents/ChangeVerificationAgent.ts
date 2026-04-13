import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const VerifyInputSchema = z.object({
  changeId: z.string(),
  verificationActivities: z.array(z.string()),
});

export const VerifyOutputSchema = z.object({
  changeId: z.string(),
  verified: z.boolean(),
  evidence: z.array(z.string()),
  addressedObligations: z.array(z.string()),
});

export type VerifyInput = z.infer<typeof VerifyInputSchema>;
export type VerifyOutput = z.infer<typeof VerifyOutputSchema>;

export class ChangeVerificationAgent extends BaseGroundedAgent<VerifyInput, VerifyOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'ChangeVerificationAgent',
        description: 'Verifies change implementation evidence.',
        version: '1.0.0',
        persona: 'You are a verification engineer.',
        systemPrompt: 'Verify the change against the planned activities.',
        processTypes: ['CHANGE_CONTROL'],
        requiredObligations: ['ISO13485.7.3.9.OBL.001'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return VerifyOutputSchema;
  }
  protected async execute(
    input: VerifyInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<VerifyOutput> {
    return {
      changeId: input.changeId,
      verified: input.verificationActivities.length > 0,
      evidence: input.verificationActivities,
      addressedObligations: ['ISO13485.7.3.9.OBL.001'],
    };
  }
}
