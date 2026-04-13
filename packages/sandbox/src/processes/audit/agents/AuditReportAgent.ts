import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

export const ReportInputSchema = z.object({
  auditId: z.string(),
  findingsCount: z.number(),
});

export const ReportOutputSchema = z.object({
  auditId: z.string(),
  report: z.string(),
  addressedObligations: z.array(z.string()),
});

export type ReportInput = z.infer<typeof ReportInputSchema>;
export type ReportOutput = z.infer<typeof ReportOutputSchema>;

export class AuditReportAgent extends BaseGroundedAgent<ReportInput, ReportOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'AuditReportAgent',
        description: 'Generates the audit report.',
        version: '1.0.0',
        persona: 'You are an audit reporter.',
        systemPrompt: 'Summarize the audit results.',
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
    return ReportOutputSchema;
  }
  protected async execute(
    input: ReportInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<ReportOutput> {
    return {
      auditId: input.auditId,
      report: `Audit ${input.auditId} completed with ${input.findingsCount} findings.`,
      addressedObligations: ['ISO13485.8.2.4.OBL.002'],
    };
  }
}
