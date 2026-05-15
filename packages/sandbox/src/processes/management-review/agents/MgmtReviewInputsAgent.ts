import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

/**
 * Aggregates the ISO 13485 §5.6.2 management-review inputs from operational
 * data already in the workspace. Returns a structured payload the
 * MgmtReviewDecisionAgent uses to derive improvement actions.
 */
export const MgmtReviewInputsInputSchema = z.object({
  reviewPeriodStart: z.string().datetime(),
  reviewPeriodEnd: z.string().datetime(),
  // The runtime feeds these counts in from the operational mirror; agents
  // never query the DB directly — they receive grounded inputs.
  feedbackCount: z.number().int().nonnegative(),
  complaintCount: z.number().int().nonnegative(),
  ncCount: z.number().int().nonnegative(),
  capaCount: z.number().int().nonnegative(),
  internalAuditFindings: z.number().int().nonnegative(),
  monitoringAlerts: z.number().int().nonnegative(),
  regulatoryChanges: z.array(z.string()).default([]),
  previousActionsOpen: z.number().int().nonnegative().default(0),
});

export const MgmtReviewInputsOutputSchema = z.object({
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
  missingInputs: z.array(z.string()),
  addressedObligations: z.array(z.string()),
});

export type MgmtReviewInputsInput = z.infer<typeof MgmtReviewInputsInputSchema>;
export type MgmtReviewInputsOutput = z.infer<typeof MgmtReviewInputsOutputSchema>;

const REQUIRED_ISO_5_6_2_INPUTS = [
  'feedback',
  'complaints',
  'nonconformances',
  'capa',
  'auditFindings',
  'monitoring',
  'regulatoryChanges',
  'previousActionsOpen',
] as const;

export class MgmtReviewInputsAgent extends BaseGroundedAgent<
  MgmtReviewInputsInput,
  MgmtReviewInputsOutput
> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'MgmtReviewInputsAgent',
        description: 'Aggregates ISO 13485 §5.6.2 management-review inputs and verifies coverage.',
        version: '1.0.0',
        persona: 'You are a quality manager preparing the management review.',
        systemPrompt: 'Verify all §5.6.2 inputs are present; flag any missing categories.',
        processTypes: ['MANAGEMENT_REVIEW'],
        requiredObligations: ['ISO13485.5.6.OBL.001'],
      },
      deps,
    );
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }

  protected getOutputSchema() {
    return MgmtReviewInputsOutputSchema;
  }

  protected async execute(
    input: MgmtReviewInputsInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<MgmtReviewInputsOutput> {
    const inputs = {
      feedback: input.feedbackCount,
      complaints: input.complaintCount,
      nonconformances: input.ncCount,
      capa: input.capaCount,
      auditFindings: input.internalAuditFindings,
      monitoring: input.monitoringAlerts,
      regulatoryChanges: input.regulatoryChanges,
      previousActionsOpen: input.previousActionsOpen,
    };

    // ISO 13485 §5.6.2 requires that every input category be addressed at
    // each review — even when the count is zero. We treat "missing" as the
    // category being undefined, not as a zero count.
    const missing = REQUIRED_ISO_5_6_2_INPUTS.filter(
      (k) => (inputs as Record<string, unknown>)[k] === undefined,
    );

    return {
      reviewId: `mr-${input.reviewPeriodStart}-${input.reviewPeriodEnd}`,
      inputs,
      coverageComplete: missing.length === 0,
      missingInputs: missing as string[],
      addressedObligations: this.config.requiredObligations,
    };
  }
}
