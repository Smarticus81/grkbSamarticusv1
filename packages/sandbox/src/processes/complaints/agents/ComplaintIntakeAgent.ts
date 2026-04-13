import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type GroundedAgentConfig,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const IntakeInputSchema = z.object({
  rawComplaint: z.string(),
  source: z.string(),
  receivedAt: z.string(),
});

export const IntakeOutputSchema = z.object({
  complaintId: z.string(),
  source: z.string(),
  category: z.string(),
  receivedAt: z.string(),
  addressedObligations: z.array(z.string()),
});

export type IntakeInput = z.infer<typeof IntakeInputSchema>;
export type IntakeOutput = z.infer<typeof IntakeOutputSchema>;

export class ComplaintIntakeAgent extends BaseGroundedAgent<IntakeInput, IntakeOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'ComplaintIntakeAgent',
        description: 'Parses and records complaints with sufficient information to investigate.',
        version: '1.0.0',
        persona: 'You are a complaint intake specialist.',
        systemPrompt: 'Parse the complaint, classify category, and record it.',
        processTypes: ['COMPLAINT'],
        requiredObligations: ['ISO13485.8.2.2.OBL.001', 'ISO13485.8.2.2.OBL.002'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return IntakeOutputSchema;
  }
  protected async execute(
    input: IntakeInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<IntakeOutput> {
    const lower = input.rawComplaint.toLowerCase();
    const category = lower.includes('injur')
      ? 'patient_harm'
      : lower.includes('malfunction')
      ? 'device_malfunction'
      : 'other';
    return {
      complaintId: `COMP-${Date.now()}`,
      source: input.source,
      category,
      receivedAt: input.receivedAt,
      addressedObligations: ['ISO13485.8.2.2.OBL.001', 'ISO13485.8.2.2.OBL.002'],
    };
  }
}
