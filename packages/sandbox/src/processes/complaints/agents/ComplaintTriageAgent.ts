import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const TriageInputSchema = z.object({
  complaintId: z.string(),
  category: z.string(),
});

export const TriageOutputSchema = z.object({
  complaintId: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  reportable: z.boolean(),
  reportingDeadlineDays: z.number(),
  addressedObligations: z.array(z.string()),
});

export type TriageInput = z.infer<typeof TriageInputSchema>;
export type TriageOutput = z.infer<typeof TriageOutputSchema>;

export class ComplaintTriageAgent extends BaseGroundedAgent<TriageInput, TriageOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'ComplaintTriageAgent',
        description: 'Determines complaint severity and reportability per ISO 13485 §8.2.2 and EU MDR Art 87.',
        version: '1.0.0',
        persona: 'You are a regulatory affairs specialist.',
        systemPrompt: 'Triage the complaint for severity and decide reportability.',
        processTypes: ['COMPLAINT'],
        requiredObligations: ['ISO13485.8.2.2.OBL.003', 'ISO13485.8.2.2.OBL.004'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return TriageOutputSchema;
  }
  protected async execute(
    input: TriageInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<TriageOutput> {
    const isPatientHarm = input.category === 'patient_harm';
    return {
      complaintId: input.complaintId,
      severity: isPatientHarm ? 'critical' : 'medium',
      reportable: isPatientHarm,
      reportingDeadlineDays: isPatientHarm ? 10 : 0,
      addressedObligations: ['ISO13485.8.2.2.OBL.003', 'ISO13485.8.2.2.OBL.004'],
    };
  }
}
