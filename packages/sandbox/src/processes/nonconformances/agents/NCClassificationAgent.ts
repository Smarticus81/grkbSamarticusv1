import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const NCClassifyInputSchema = z.object({
  ncId: z.string(),
  description: z.string(),
});

export const NCClassifyOutputSchema = z.object({
  ncId: z.string(),
  classification: z.enum(['minor', 'major', 'critical']),
  addressedObligations: z.array(z.string()),
});

export type NCClassifyInput = z.infer<typeof NCClassifyInputSchema>;
export type NCClassifyOutput = z.infer<typeof NCClassifyOutputSchema>;

export class NCClassificationAgent extends BaseGroundedAgent<NCClassifyInput, NCClassifyOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'NCClassificationAgent',
        description: 'Classifies a nonconformance by severity per ISO 13485 §8.3.',
        version: '1.0.0',
        persona: 'You are a nonconformance owner.',
        systemPrompt: 'Classify the NC as minor, major, or critical.',
        processTypes: ['NONCONFORMANCE'],
        requiredObligations: ['ISO13485.8.3.OBL.001'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return NCClassifyOutputSchema;
  }
  protected async execute(
    input: NCClassifyInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<NCClassifyOutput> {
    const lower = input.description.toLowerCase();
    const classification: 'minor' | 'major' | 'critical' = lower.includes('safety')
      ? 'critical'
      : lower.includes('functional')
      ? 'major'
      : 'minor';
    return {
      ncId: input.ncId,
      classification,
      addressedObligations: ['ISO13485.8.3.OBL.001'],
    };
  }
}
