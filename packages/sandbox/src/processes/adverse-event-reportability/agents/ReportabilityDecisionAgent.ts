import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

/**
 * Reportability decision for a single adverse event across EU/US/UK.
 *
 * Inputs are the harmonized fields produced by complaint intake; the agent
 * does NOT call an LLM — reportability is rule-based per the regulations
 * cited in `requiredObligations`. Decisions and clocks are written into
 * the trace chain by the BaseGroundedAgent lifecycle.
 */
export const ReportabilityInputSchema = z.object({
  eventId: z.string().min(1),
  occurredAt: z.string().datetime(),
  awareAt: z.string().datetime(),
  severity: z.enum(['nonserious', 'serious', 'death', 'public_health_threat']),
  // Has the event recurred? Drives EU MDR Art. 87 trend-style reportability.
  recurring: z.boolean().default(false),
  // Where the device is on the market.
  jurisdictions: z.array(z.enum(['EU', 'US', 'UK'])).min(1),
  // FSCA = Field Safety Corrective Action.
  fscaPlanned: z.boolean().default(false),
});

const JurisdictionDecisionSchema = z.object({
  jurisdiction: z.enum(['EU', 'US', 'UK']),
  reportable: z.boolean(),
  pathway: z.string(),                         // e.g. "EU MDR Art. 87(1)(a)"
  clockDays: z.number().int().nullable(),      // null when not reportable
  rationale: z.string(),
});

export const ReportabilityOutputSchema = z.object({
  eventId: z.string(),
  decisions: z.array(JurisdictionDecisionSchema).min(1),
  hitlRequired: z.boolean(),
  hitlGateId: z.string().optional(),
  addressedObligations: z.array(z.string()),
});

export type ReportabilityInput = z.infer<typeof ReportabilityInputSchema>;
export type ReportabilityOutput = z.infer<typeof ReportabilityOutputSchema>;

export class ReportabilityDecisionAgent extends BaseGroundedAgent<
  ReportabilityInput,
  ReportabilityOutput
> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'ReportabilityDecisionAgent',
        description: 'Decides EU/US/UK reportability and emits jurisdictional clocks for an adverse event.',
        version: '1.0.0',
        persona: 'You are a vigilance officer.',
        systemPrompt: 'Apply EU MDR Art. 87, 21 CFR 803, and UK MDR vigilance rules deterministically. Never improvise.',
        processTypes: ['ADVERSE_EVENT'],
        requiredObligations: [
          'EUMDR.87.OBL.001',
          'EUMDR.87.OBL.002',
          'EUMDR.87.OBL.003',
          'CFR820.198.OBL.002',
          'UKMDR.2.OBL.001',
          'ISO13485.8.2.2.OBL.004',
        ],
      },
      deps,
    );
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }

  protected getOutputSchema() {
    return ReportabilityOutputSchema;
  }

  protected async execute(
    input: ReportabilityInput,
    _obligations: ObligationNode[],
    _constraints: ConstraintNode[],
  ): Promise<ReportabilityOutput> {
    const decisions: z.infer<typeof JurisdictionDecisionSchema>[] = [];

    for (const jx of input.jurisdictions) {
      decisions.push(this.decideForJurisdiction(jx, input));
    }

    // HITL is required whenever any jurisdiction marks the event as a
    // serious incident; the gate is sourced from the KB.
    const hitlRequired = decisions.some((d) => d.reportable && d.jurisdiction === 'EU');

    return {
      eventId: input.eventId,
      decisions,
      hitlRequired,
      ...(hitlRequired ? { hitlGateId: 'HITL.EUMDR.87.SeriousIncident' } : {}),
      addressedObligations: this.config.requiredObligations,
    };
  }

  private decideForJurisdiction(
    jx: 'EU' | 'US' | 'UK',
    input: ReportabilityInput,
  ): z.infer<typeof JurisdictionDecisionSchema> {
    if (jx === 'EU') return this.decideEU(input);
    if (jx === 'US') return this.decideUS(input);
    return this.decideUK(input);
  }

  /** EU MDR Art. 87(3) — 2/10/15 day clocks for serious incidents. */
  private decideEU(input: ReportabilityInput): z.infer<typeof JurisdictionDecisionSchema> {
    if (input.severity === 'public_health_threat') {
      return { jurisdiction: 'EU', reportable: true, pathway: 'EU MDR Art. 87(3)(a)', clockDays: 2, rationale: 'Serious public health threat — 2-day clock.' };
    }
    if (input.severity === 'death') {
      return { jurisdiction: 'EU', reportable: true, pathway: 'EU MDR Art. 87(3)(b)', clockDays: 10, rationale: 'Death — 10-day clock.' };
    }
    if (input.severity === 'serious') {
      return { jurisdiction: 'EU', reportable: true, pathway: 'EU MDR Art. 87(3)(c)', clockDays: 15, rationale: 'Other serious incident — 15-day clock.' };
    }
    if (input.fscaPlanned) {
      return { jurisdiction: 'EU', reportable: true, pathway: 'EU MDR Art. 87(1)(b)', clockDays: 15, rationale: 'FSCA notification required.' };
    }
    return { jurisdiction: 'EU', reportable: false, pathway: 'n/a', clockDays: null, rationale: 'Below EU MDR Art. 87 threshold.' };
  }

  /** 21 CFR §803 — 30-day MDR; 5-day for remedial action / public health. */
  private decideUS(input: ReportabilityInput): z.infer<typeof JurisdictionDecisionSchema> {
    if (input.severity === 'public_health_threat') {
      return { jurisdiction: 'US', reportable: true, pathway: '21 CFR §803.10(c)(2) (5-day)', clockDays: 5, rationale: '5-day report — remedial action / public health.' };
    }
    if (input.severity === 'death' || input.severity === 'serious') {
      return { jurisdiction: 'US', reportable: true, pathway: '21 CFR §803.50 (30-day)', clockDays: 30, rationale: 'Death or serious injury — 30-day MDR.' };
    }
    if (input.fscaPlanned) {
      return { jurisdiction: 'US', reportable: true, pathway: '21 CFR §806 (correction/removal)', clockDays: 10, rationale: 'Correction/removal report.' };
    }
    return { jurisdiction: 'US', reportable: false, pathway: 'n/a', clockDays: null, rationale: 'Below 21 CFR §803 threshold.' };
  }

  /** UK MDR — interpretation aligned to EU MDR clocks pre-2030. */
  private decideUK(input: ReportabilityInput): z.infer<typeof JurisdictionDecisionSchema> {
    if (input.severity === 'public_health_threat') {
      return { jurisdiction: 'UK', reportable: true, pathway: 'UK MDR (MHRA) — public health', clockDays: 2, rationale: 'MHRA public-health 2-day clock.' };
    }
    if (input.severity === 'death') {
      return { jurisdiction: 'UK', reportable: true, pathway: 'UK MDR (MHRA) — death', clockDays: 10, rationale: 'MHRA death 10-day clock.' };
    }
    if (input.severity === 'serious') {
      return { jurisdiction: 'UK', reportable: true, pathway: 'UK MDR (MHRA) — serious', clockDays: 15, rationale: 'MHRA serious incident 15-day clock.' };
    }
    return { jurisdiction: 'UK', reportable: false, pathway: 'n/a', clockDays: null, rationale: 'Below MHRA reportability threshold.' };
  }
}
