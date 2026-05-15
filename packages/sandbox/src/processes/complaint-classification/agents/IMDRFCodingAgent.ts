import { z } from 'zod';
import {
  BaseGroundedAgent,
  type BaseGroundedAgentDeps,
  type ObligationNode,
  type ConstraintNode,
} from '@regground/core';

/**
 * Codes a complaint narrative into IMDRF Annex A–G coding terminology.
 * Real implementation would call the IMDRF coding ontology; this minimal
 * version maps a small set of trigger phrases to top-level Annex codes
 * deterministically — enough to exercise the obligation grounding loop.
 */
export const IMDRFCodingInputSchema = z.object({
  complaintId: z.string().min(1),
  narrative: z.string().min(1),
});

const IMDRFCodeSchema = z.object({
  annex: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
  code: z.string(),
  term: z.string(),
  confidence: z.number().min(0).max(1),
});

export const IMDRFCodingOutputSchema = z.object({
  complaintId: z.string(),
  codes: z.array(IMDRFCodeSchema).min(1),
  addressedObligations: z.array(z.string()),
});

export type IMDRFCodingInput = z.infer<typeof IMDRFCodingInputSchema>;
export type IMDRFCodingOutput = z.infer<typeof IMDRFCodingOutputSchema>;

const KEYWORD_TO_CODE: Array<{ pattern: RegExp; annex: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'; code: string; term: string }> = [
  { pattern: /\b(burn|electric shock|electrocution)\b/i, annex: 'C', code: 'C0301', term: 'Thermal/electrical injury' },
  { pattern: /\b(infection|sepsis)\b/i, annex: 'E', code: 'E0501', term: 'Infection' },
  { pattern: /\b(bleed|hemorrhage|haemorrhage)\b/i, annex: 'E', code: 'E0204', term: 'Hemorrhage' },
  { pattern: /\b(software|app|firmware) (crash|freeze|error)/i, annex: 'B', code: 'B0801', term: 'Software malfunction' },
  { pattern: /\b(battery|charge) (drain|fail|depleted)/i, annex: 'B', code: 'B1502', term: 'Battery/power issue' },
  { pattern: /\b(broken|fracture|cracked)\b/i, annex: 'A', code: 'A0301', term: 'Mechanical breakage' },
];

export class IMDRFCodingAgent extends BaseGroundedAgent<IMDRFCodingInput, IMDRFCodingOutput> {
  constructor(deps: BaseGroundedAgentDeps) {
    super(
      {
        name: 'IMDRFCodingAgent',
        description: 'Codes complaint narratives into IMDRF Annex A–G terminology.',
        version: '1.0.0',
        persona: 'You are an IMDRF coding specialist.',
        systemPrompt: 'Apply IMDRF Annex A–G coding deterministically; never invent codes.',
        processTypes: ['COMPLAINT_CLASSIFICATION'],
        requiredObligations: [
          'IMDRF.AET.OBL.001',
          'ISO13485.8.2.2.OBL.003',
        ],
      },
      deps,
    );
  }

  protected getRequiredObligations(): string[] {
    return this.config.requiredObligations;
  }

  protected getOutputSchema() {
    return IMDRFCodingOutputSchema;
  }

  protected async execute(
    input: IMDRFCodingInput,
    _o: ObligationNode[],
    _c: ConstraintNode[],
  ): Promise<IMDRFCodingOutput> {
    const matches: z.infer<typeof IMDRFCodeSchema>[] = [];
    for (const rule of KEYWORD_TO_CODE) {
      if (rule.pattern.test(input.narrative)) {
        matches.push({ annex: rule.annex, code: rule.code, term: rule.term, confidence: 0.85 });
      }
    }
    if (matches.length === 0) {
      // Fallback: unspecified device problem (Annex A root) so we always
      // satisfy the schema's min(1) and never silently drop a complaint.
      matches.push({
        annex: 'A',
        code: 'A0000',
        term: 'Unspecified device problem',
        confidence: 0.3,
      });
    }
    return {
      complaintId: input.complaintId,
      codes: matches,
      addressedObligations: this.config.requiredObligations,
    };
  }
}
