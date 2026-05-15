import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

/**
 * Derives ISO 13485 §5.6.3 management-review outputs (improvement
 * decisions and resource needs) from the aggregated inputs.
 */
export const MgmtReviewDecisionInputSchema = z.object({
  reviewId: z.string(),
  inputs: z.object({
    feedback: z.number(),
    complaints: z.number(),
    nonconformances: z.number(),
    capa: z.number(),
    auditFindings: z.number(),
    monitoring: z.number(),
    regulatoryChanges: z.array(z.string()),
    previousActionsOpen: z.number(),
  }),
  coverageComplete: z.boolean(),
});

const ActionSchema = z.object({
  actionId: z.string(),
  category: z.enum(['qms_improvement', 'product_improvement', 'resource_need', 'regulatory_response']),
  description: z.string(),
  ownerRole: z.string(),
  dueDateDays: z.number().int().positive(),
});

export const MgmtReviewDecisionOutputSchema = z.object({
  reviewId: z.string(),
  decisions: z.array(ActionSchema),
  effectivenessConclusion: z.string(),
  addressedObligations: z.array(z.string()),
});

export type MgmtReviewDecisionInput = z.infer<typeof MgmtReviewDecisionInputSchema>;
export type MgmtReviewDecisionOutput = z.infer<typeof MgmtReviewDecisionOutputSchema>;

export class MgmtReviewDecisionAgent extends BaseGroundedAgent<
  MgmtReviewDecisionInput,
  MgmtReviewDecisionOutput
> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'MgmtReviewDecisionAgent',
        description: 'Derives ISO 13485 §5.6.3 outputs (improvements, resource needs) from review inputs.',
        version: '1.0.0',
        persona: 'You are top management exercising review responsibility.',
        systemPrompt: 'Identify improvement and resource needs based on the input signals.',
        processTypes: ['MANAGEMENT_REVIEW'],
        requiredObligations: ['ISO13485.5.6.OBL.001', 'ISO13485.5.6.OBL.002'],
      },
      deps,
    );
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }

  protected getOutputSchema() {
    return MgmtReviewDecisionOutputSchema;
  }

  protected async execute(
    input: MgmtReviewDecisionInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<MgmtReviewDecisionOutput> {
    const decisions: z.infer<typeof ActionSchema>[] = [];
    const i = input.inputs;
    let n = 0;
    const id = () => `act-${input.reviewId}-${++n}`;

    if (i.complaints > 0 || i.nonconformances > 0) {
      decisions.push({
        actionId: id(),
        category: 'product_improvement',
        description: `Investigate ${i.complaints} complaints and ${i.nonconformances} nonconformances for systemic causes.`,
        ownerRole: 'quality_manager',
        dueDateDays: 30,
      });
    }
    if (i.auditFindings > 0) {
      decisions.push({
        actionId: id(),
        category: 'qms_improvement',
        description: `Close ${i.auditFindings} internal audit findings via CAPA.`,
        ownerRole: 'quality_manager',
        dueDateDays: 60,
      });
    }
    if (i.previousActionsOpen > 0) {
      decisions.push({
        actionId: id(),
        category: 'qms_improvement',
        description: `Drive closure of ${i.previousActionsOpen} prior management-review actions still open.`,
        ownerRole: 'top_management',
        dueDateDays: 30,
      });
    }
    for (const change of i.regulatoryChanges) {
      decisions.push({
        actionId: id(),
        category: 'regulatory_response',
        description: `Assess QMS impact of regulatory change: ${change}.`,
        ownerRole: 'regulatory_affairs',
        dueDateDays: 45,
      });
    }
    if (i.monitoring > i.capa) {
      decisions.push({
        actionId: id(),
        category: 'resource_need',
        description: 'Monitoring alerts exceed CAPA throughput — assess CAPA team capacity.',
        ownerRole: 'top_management',
        dueDateDays: 30,
      });
    }

    const effectivenessConclusion = input.coverageComplete
      ? 'QMS reviewed against complete §5.6.2 inputs; effectiveness deemed adequate, subject to listed actions.'
      : 'QMS effectiveness conclusion deferred — input coverage incomplete.';

    return {
      reviewId: input.reviewId,
      decisions,
      effectivenessConclusion,
      addressedObligations: this.config.requiredObligations,
    };
  }
}
