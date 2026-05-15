import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

/**
 * Validates the structural compliance of a PSUR draft against MDCG 2022-21
 * §1 (scope/identification) and §2 (required content sections). Output
 * tells PSURContentAgent which sections still need population.
 */
export const PSURStructureInputSchema = z.object({
  deviceId: z.string().min(1),
  reportingPeriodStart: z.string().datetime(),
  reportingPeriodEnd: z.string().datetime(),
  // Caller passes the section IDs already drafted; the agent reports gaps.
  draftedSectionIds: z.array(z.string()).default([]),
});

export const PSURStructureOutputSchema = z.object({
  deviceId: z.string(),
  requiredSections: z.array(z.string()),
  presentSections: z.array(z.string()),
  missingSections: z.array(z.string()),
  structurallyCompliant: z.boolean(),
  addressedObligations: z.array(z.string()),
});

export type PSURStructureInput = z.infer<typeof PSURStructureInputSchema>;
export type PSURStructureOutput = z.infer<typeof PSURStructureOutputSchema>;

const MDCG_REQUIRED_SECTIONS = [
  'identification',          // §1
  'scope_and_purpose',       // §1
  'complaints_summary',      // §2 OBL.001
  'vigilance_summary',       // §2 OBL.002
  'literature_review',       // §2 OBL.003
  'registries_pmcf',         // §2 OBL.004
  'sales_volume',            // §2 OBL.005
  'population_estimate',     // §2 OBL.006
  'incident_fsca_analysis',  // §2 OBL.007
];

export class PSURStructureAgent extends BaseGroundedAgent<PSURStructureInput, PSURStructureOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'PSURStructureAgent',
        description: 'Validates PSUR structural compliance against MDCG 2022-21 §1–2.',
        version: '1.0.0',
        persona: 'You are a regulatory writer specializing in PSUR documentation.',
        systemPrompt: 'Audit the PSUR section list against MDCG 2022-21 §1–2; report gaps deterministically.',
        processTypes: ['PSUR'],
        requiredObligations: [
          'EUMDR.86.OBL.001',
          'EUMDR.86.PSUR.OBL.001',
          'MDCG2022-21.1.OBL.001',
          'MDCG2022-21.1.OBL.002',
          'MDCG2022-21.1.OBL.003',
        ],
      },
      deps,
    );
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }

  protected getOutputSchema() {
    return PSURStructureOutputSchema;
  }

  protected async execute(
    input: PSURStructureInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<PSURStructureOutput> {
    const present = input.draftedSectionIds;
    const missing = MDCG_REQUIRED_SECTIONS.filter((s) => !present.includes(s));
    return {
      deviceId: input.deviceId,
      requiredSections: MDCG_REQUIRED_SECTIONS,
      presentSections: present,
      missingSections: missing,
      structurallyCompliant: missing.length === 0,
      addressedObligations: this.config.requiredObligations,
    };
  }
}
