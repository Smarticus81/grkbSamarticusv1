import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const NarrativeInputSchema = z.object({
  metric: z.string(),
  signal: z.boolean(),
  method: z.string(),
  details: z.record(z.unknown()),
});

export const NarrativeOutputSchema = z.object({
  narrative: z.string(),
  addressedObligations: z.array(z.string()),
});

export type NarrativeInput = z.infer<typeof NarrativeInputSchema>;
export type NarrativeOutput = z.infer<typeof NarrativeOutputSchema>;

export class TrendNarrativeAgent extends BaseGroundedAgent<NarrativeInput, NarrativeOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'TrendNarrativeAgent',
        description: 'Writes a narrative summary of a statistical trend analysis.',
        version: '1.0.0',
        persona: 'You are a regulatory writer.',
        systemPrompt: 'Summarize the trend analysis for a regulatory report.',
        processTypes: ['TREND'],
        requiredObligations: ['EUMDR.86.PSUR.OBL.001'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return NarrativeOutputSchema;
  }
  protected async execute(
    input: NarrativeInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<NarrativeOutput> {
    const status = input.signal ? 'A signal was detected' : 'No signal detected';
    return {
      narrative: `Trend analysis for ${input.metric} using ${input.method}: ${status}. Details: ${JSON.stringify(input.details)}.`,
      addressedObligations: ['EUMDR.86.PSUR.OBL.001'],
    };
  }
}
