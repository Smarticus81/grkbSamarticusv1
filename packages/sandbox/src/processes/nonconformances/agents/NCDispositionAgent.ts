import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const NCDispositionInputSchema = z.object({
  ncId: z.string(),
  classification: z.string(),
});

export const NCDispositionOutputSchema = z.object({
  ncId: z.string(),
  disposition: z.enum(['rework', 'concession', 'scrap', 'use_as_is']),
  requiresAuthorization: z.boolean(),
  addressedObligations: z.array(z.string()),
});

export type NCDispositionInput = z.infer<typeof NCDispositionInputSchema>;
export type NCDispositionOutput = z.infer<typeof NCDispositionOutputSchema>;

export class NCDispositionAgent extends BaseGroundedAgent<
  NCDispositionInput,
  NCDispositionOutput
> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'NCDispositionAgent',
        description: 'Decides nonconformance disposition per ISO 13485 §8.3.',
        version: '1.0.0',
        persona: 'You are a quality manager authorized to disposition NC.',
        systemPrompt: 'Choose disposition. Concession requires authorization.',
        processTypes: ['NONCONFORMANCE'],
        requiredObligations: ['ISO13485.8.3.OBL.002', 'ISO13485.8.3.OBL.003'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return NCDispositionOutputSchema;
  }
  protected async execute(
    input: NCDispositionInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<NCDispositionOutput> {
    const disposition: NCDispositionOutput['disposition'] =
      input.classification === 'critical'
        ? 'scrap'
        : input.classification === 'major'
        ? 'rework'
        : input.classification === 'concession'
        ? 'concession'
        : 'use_as_is';
    return {
      ncId: input.ncId,
      disposition,
      requiresAuthorization: (disposition as string) === 'concession',
      addressedObligations: ['ISO13485.8.3.OBL.002', 'ISO13485.8.3.OBL.003'],
    };
  }
}
