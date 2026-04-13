import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const FindingInputSchema = z.object({
  auditId: z.string(),
  observations: z.array(z.string()),
});

export const FindingOutputSchema = z.object({
  auditId: z.string(),
  findings: z.array(
    z.object({ id: z.string(), description: z.string(), classification: z.string() }),
  ),
  addressedObligations: z.array(z.string()),
});

export type FindingInput = z.infer<typeof FindingInputSchema>;
export type FindingOutput = z.infer<typeof FindingOutputSchema>;

export class AuditFindingAgent extends BaseGroundedAgent<FindingInput, FindingOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'AuditFindingAgent',
        description: 'Records audit findings.',
        version: '1.0.0',
        persona: 'You are an internal auditor.',
        systemPrompt: 'Record findings against the audit observations.',
        processTypes: ['AUDIT'],
        requiredObligations: ['ISO13485.8.2.4.OBL.002'],
      },
      deps,
    );
  }
  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }
  protected getOutputSchema() {
    return FindingOutputSchema;
  }
  protected async execute(
    input: FindingInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<FindingOutput> {
    return {
      auditId: input.auditId,
      findings: input.observations.map((obs, i) => ({
        id: `${input.auditId}-F${i + 1}`,
        description: obs,
        classification: obs.toLowerCase().includes('critical') ? 'major' : 'minor',
      })),
      addressedObligations: ['ISO13485.8.2.4.OBL.002'],
    };
  }
}
