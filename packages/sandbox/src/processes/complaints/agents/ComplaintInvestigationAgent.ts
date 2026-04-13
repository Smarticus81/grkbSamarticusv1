import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const InvestigationInputSchema = z.object({
  complaintId: z.string(),
  severity: z.string(),
});

export const InvestigationOutputSchema = z.object({
  complaintId: z.string(),
  findings: z.array(z.string()),
  needsCAPA: z.boolean(),
  addressedObligations: z.array(z.string()),
});

export type InvestigationInput = z.infer<typeof InvestigationInputSchema>;
export type InvestigationOutput = z.infer<typeof InvestigationOutputSchema>;

export class ComplaintInvestigationAgent extends BaseGroundedAgent<
  InvestigationInput,
  InvestigationOutput
> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'ComplaintInvestigationAgent',
        description: 'Investigates complaints and recommends CAPA when warranted.',
        version: '1.0.0',
        persona: 'You are a quality investigator.',
        systemPrompt: 'Investigate the complaint and document findings.',
        processTypes: ['COMPLAINT'],
        requiredObligations: ['ISO13485.8.2.2.OBL.003'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return InvestigationOutputSchema;
  }
  protected async execute(
    input: InvestigationInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<InvestigationOutput> {
    return {
      complaintId: input.complaintId,
      findings: [`Severity ${input.severity} investigation completed`],
      needsCAPA: input.severity === 'critical' || input.severity === 'high',
      addressedObligations: ['ISO13485.8.2.2.OBL.003'],
    };
  }
}
