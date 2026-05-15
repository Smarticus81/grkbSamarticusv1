import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

/**
 * Reportability screening against EU MDR Art. 87 and 21 CFR §803.
 * Operates on the IMDRF-coded complaint output; returns a per-jurisdiction
 * "should escalate to reportability process" verdict. Does NOT decide the
 * clock — that is the ReportabilityDecisionAgent's job in the
 * adverse-event-reportability process.
 */
export const ReportabilityScreenInputSchema = z.object({
  complaintId: z.string().min(1),
  imdrfCodes: z.array(
    z.object({
      annex: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
      code: z.string(),
      term: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  severity: z.enum(['nonserious', 'serious', 'death', 'public_health_threat']),
});

export const ReportabilityScreenOutputSchema = z.object({
  complaintId: z.string(),
  escalateToReportability: z.boolean(),
  jurisdictionsToEvaluate: z.array(z.enum(['EU', 'US', 'UK'])),
  rationale: z.string(),
  addressedObligations: z.array(z.string()),
});

export type ReportabilityScreenInput = z.infer<typeof ReportabilityScreenInputSchema>;
export type ReportabilityScreenOutput = z.infer<typeof ReportabilityScreenOutputSchema>;

export class ReportabilityScreenAgent extends BaseGroundedAgent<
  ReportabilityScreenInput,
  ReportabilityScreenOutput
> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'ReportabilityScreenAgent',
        description: 'Screens classified complaints for reportability escalation under EU MDR / 21 CFR §803.',
        version: '1.0.0',
        persona: 'You are a complaint handling specialist.',
        systemPrompt: 'Decide whether the complaint must be evaluated by the reportability process.',
        processTypes: ['COMPLAINT_CLASSIFICATION'],
        requiredObligations: [
          'ISO13485.8.2.2.OBL.004',
          'EUMDR.87.OBL.001',
          'EUMDR.87.OBL.003',
          'CFR820.198.OBL.002',
        ],
      },
      deps,
    );
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }

  protected getOutputSchema() {
    return ReportabilityScreenOutputSchema;
  }

  protected async execute(
    input: ReportabilityScreenInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<ReportabilityScreenOutput> {
    // Annex E covers patient harm; Annex C covers thermal/electrical
    // injury; both flag a complaint for reportability evaluation.
    const harmCoded = input.imdrfCodes.some((c) => c.annex === 'E' || c.annex === 'C');
    const seriousEnough = input.severity !== 'nonserious';
    const escalate = harmCoded || seriousEnough;

    return {
      complaintId: input.complaintId,
      escalateToReportability: escalate,
      jurisdictionsToEvaluate: escalate ? ['EU', 'US', 'UK'] : [],
      rationale: escalate
        ? `Complaint flagged: severity=${input.severity}, harmCoded=${harmCoded}.`
        : 'Below screening threshold; no reportability evaluation required.',
      addressedObligations: this.config.requiredObligations,
    };
  }
}
