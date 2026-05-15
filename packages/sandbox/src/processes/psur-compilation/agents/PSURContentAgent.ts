import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

/**
 * Compiles the per-section evidence summaries that satisfy MDCG 2022-21
 * §2 OBL.001–007. Receives counts/aggregates from the operational mirror;
 * produces structured PSUR section payloads keyed by obligation.
 */
export const PSURContentInputSchema = z.object({
  deviceId: z.string().min(1),
  complaintCount: z.number().int().nonnegative(),
  vigilanceReportCount: z.number().int().nonnegative(),
  literatureItems: z.number().int().nonnegative(),
  registryRecords: z.number().int().nonnegative(),
  salesUnits: z.number().int().nonnegative(),
  populationEstimate: z.number().int().nonnegative(),
  incidentCount: z.number().int().nonnegative(),
  fscaCount: z.number().int().nonnegative(),
});

const SectionContentSchema = z.object({
  sectionId: z.string(),
  obligationId: z.string(),
  content: z.string(),
  evidenceCount: z.number().int().nonnegative(),
});

export const PSURContentOutputSchema = z.object({
  deviceId: z.string(),
  sections: z.array(SectionContentSchema),
  benefitRiskConclusion: z.string(),
  hitlRequired: z.literal(true),
  hitlGateId: z.string(),
  addressedObligations: z.array(z.string()),
});

export type PSURContentInput = z.infer<typeof PSURContentInputSchema>;
export type PSURContentOutput = z.infer<typeof PSURContentOutputSchema>;

export class PSURContentAgent extends BaseGroundedAgent<PSURContentInput, PSURContentOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'PSURContentAgent',
        description: 'Compiles MDCG 2022-21 §2 PSUR sections from aggregated PMS data.',
        version: '1.0.0',
        persona: 'You are a regulatory writer specializing in PSUR documentation.',
        systemPrompt: 'Compose each MDCG 2022-21 §2 section from the supplied aggregates; cite obligation IDs.',
        processTypes: ['PSUR'],
        requiredObligations: [
          'EUMDR.86.PSUR.OBL.001',
          'EUMDR.86.PSUR.OBL.002',
          'MDCG2022-21.2.OBL.001',
          'MDCG2022-21.2.OBL.002',
          'MDCG2022-21.2.OBL.003',
          'MDCG2022-21.2.OBL.004',
          'MDCG2022-21.2.OBL.005',
          'MDCG2022-21.2.OBL.006',
          'MDCG2022-21.2.OBL.007',
        ],
      },
      deps,
    );
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }

  protected getOutputSchema() {
    return PSURContentOutputSchema;
  }

  protected async execute(
    input: PSURContentInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<PSURContentOutput> {
    const sections: z.infer<typeof SectionContentSchema>[] = [
      { sectionId: 'complaints_summary', obligationId: 'MDCG2022-21.2.OBL.001', content: `Period total complaints: ${input.complaintCount}.`, evidenceCount: input.complaintCount },
      { sectionId: 'vigilance_summary', obligationId: 'MDCG2022-21.2.OBL.002', content: `Period total vigilance reports: ${input.vigilanceReportCount}.`, evidenceCount: input.vigilanceReportCount },
      { sectionId: 'literature_review', obligationId: 'MDCG2022-21.2.OBL.003', content: `Literature items reviewed: ${input.literatureItems}.`, evidenceCount: input.literatureItems },
      { sectionId: 'registries_pmcf', obligationId: 'MDCG2022-21.2.OBL.004', content: `Registry records / PMCF datapoints: ${input.registryRecords}.`, evidenceCount: input.registryRecords },
      { sectionId: 'sales_volume', obligationId: 'MDCG2022-21.2.OBL.005', content: `Units placed on the EU market: ${input.salesUnits}.`, evidenceCount: input.salesUnits },
      { sectionId: 'population_estimate', obligationId: 'MDCG2022-21.2.OBL.006', content: `Estimated patient/user population: ${input.populationEstimate}.`, evidenceCount: input.populationEstimate },
      { sectionId: 'incident_fsca_analysis', obligationId: 'MDCG2022-21.2.OBL.007', content: `Incidents: ${input.incidentCount}; FSCAs: ${input.fscaCount}.`, evidenceCount: input.incidentCount + input.fscaCount },
    ];

    const incidenceRate = input.salesUnits > 0
      ? (input.incidentCount / input.salesUnits) * 1_000_000
      : 0;

    const benefitRiskConclusion =
      incidenceRate < 100
        ? `Benefit-risk profile remains favorable (${incidenceRate.toFixed(2)} incidents/Munit).`
        : `Benefit-risk profile flagged for re-evaluation (${incidenceRate.toFixed(2)} incidents/Munit exceeds 100/Munit threshold).`;

    return {
      deviceId: input.deviceId,
      sections,
      benefitRiskConclusion,
      hitlRequired: true,
      hitlGateId: 'HITL.EUMDR.86.PSURApproval',
      addressedObligations: this.config.requiredObligations,
    };
  }
}
