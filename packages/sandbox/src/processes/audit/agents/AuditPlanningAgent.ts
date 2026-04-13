import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const PlanInputSchema = z.object({
  scope: z.array(z.string()),
  auditor: z.string(),
});

export const PlanOutputSchema = z.object({
  auditId: z.string(),
  scope: z.array(z.string()),
  auditor: z.string(),
  schedule: z.string(),
  addressedObligations: z.array(z.string()),
});

export type PlanInput = z.infer<typeof PlanInputSchema>;
export type PlanOutput = z.infer<typeof PlanOutputSchema>;

export class AuditPlanningAgent extends BaseGroundedAgent<PlanInput, PlanOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'AuditPlanningAgent',
        description: 'Plans an internal audit per ISO 13485 §8.2.4.',
        version: '1.0.0',
        persona: 'You are an internal audit lead.',
        systemPrompt: 'Plan the audit with a defined scope and independent auditor.',
        processTypes: ['AUDIT'],
        requiredObligations: ['ISO13485.8.2.4.OBL.001', 'ISO13485.8.2.4.OBL.003'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return PlanOutputSchema;
  }
  protected async execute(
    input: PlanInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<PlanOutput> {
    return {
      auditId: `AUDIT-${Date.now()}`,
      scope: input.scope,
      auditor: input.auditor,
      schedule: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      addressedObligations: ['ISO13485.8.2.4.OBL.001', 'ISO13485.8.2.4.OBL.003'],
    };
  }
}
