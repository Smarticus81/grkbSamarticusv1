import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type GroundedAgentConfig,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const CAPAInitiationInputSchema = z.object({
  triggerId: z.string(),
  triggerType: z.enum(['complaint', 'nonconformance', 'audit_finding', 'trend']),
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
});

export const CAPAInitiationOutputSchema = z.object({
  capaId: z.string(),
  triggerClassification: z.string(),
  capaRequired: z.boolean(),
  rationale: z.string(),
  addressedObligations: z.array(z.string()),
});

export type CAPAInitiationInput = z.infer<typeof CAPAInitiationInputSchema>;
export type CAPAInitiationOutput = z.infer<typeof CAPAInitiationOutputSchema>;

export class CAPAInitiationAgent extends BaseGroundedAgent<
  CAPAInitiationInput,
  CAPAInitiationOutput
> {
  constructor(deps: BaseGroundedAgentDeps) {
    const config: GroundedAgentConfig = {
      name: 'CAPAInitiationAgent',
      description: 'Classifies a CAPA trigger and decides whether a CAPA is required.',
      version: '1.0.0',
      persona: 'You are a CAPA coordinator certified to ISO 13485 §8.5.2.',
      systemPrompt:
        'Classify the incoming trigger and decide whether to open a CAPA. Cite the obligation that requires it.',
      processTypes: ['CAPA'],
      requiredObligations: ['ISO13485.8.5.2.OBL.001'],
    };
    super(config, deps);
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return CAPAInitiationOutputSchema;
  }
  protected async execute(
    input: CAPAInitiationInput,
    _obligations: ObligationNode[],
    _constraints: ConstraintNode[],
  ): Promise<CAPAInitiationOutput> {
    const capaRequired = input.severity !== 'low';
    return {
      capaId: `CAPA-${input.triggerId}`,
      triggerClassification: input.triggerType,
      capaRequired,
      rationale: capaRequired
        ? `Severity ${input.severity} from ${input.triggerType} requires CAPA per ISO 13485 §8.5.2(a)`
        : `Severity ${input.severity} does not require CAPA; routine correction sufficient`,
      addressedObligations: ['ISO13485.8.5.2.OBL.001'],
    };
  }
}
