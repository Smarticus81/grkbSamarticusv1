import type { ObligationNode } from '../graph/types.js';

export interface FileContext {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SkillContext {
  skillName: string;
  instructions: string;
  triggers: string[];
}

export interface PromptComposeInput {
  persona: string;
  systemPrompt: string;
  obligationContext?: ObligationNode[];
  fileContext?: FileContext[];
  skillContext?: SkillContext[];
  fieldInstructions?: string[];
}

/**
 * 3-layer prompt architecture:
 *   1. Persona  — who the agent is
 *   2. System   — the agent's mission and rules
 *   3. Field    — per-call instructions, obligation context, attached files, attached skills
 *
 * Always emits an "OBLIGATION CONTEXT" section when obligations are provided
 * so the model has structured grounding rather than free-text recall.
 */
export class PromptComposer {
  compose(input: PromptComposeInput): string {
    const parts: string[] = [];
    parts.push(`# PERSONA\n${input.persona.trim()}`);
    parts.push(`# MISSION\n${input.systemPrompt.trim()}`);

    if (input.obligationContext && input.obligationContext.length > 0) {
      parts.push('# OBLIGATION CONTEXT');
      for (const o of input.obligationContext) {
        parts.push(
          `- [${o.obligationId}] (${o.sourceCitation}) ${o.title}\n  ${o.text}` +
            (o.requiredEvidenceTypes.length
              ? `\n  Requires: ${o.requiredEvidenceTypes.join(', ')}`
              : ''),
        );
      }
      parts.push(
        'You MUST address every mandatory obligation above and cite obligationId in your output under `addressedObligations`.',
      );
    }

    if (input.fileContext && input.fileContext.length > 0) {
      parts.push('# ATTACHED FILES');
      for (const f of input.fileContext) {
        parts.push(`- [${f.fileId}] "${f.name}" (${f.mimeType}, ${f.sizeBytes} bytes)`);
      }
      parts.push('These files are available in the workspace. Reference them by fileId when citing evidence.');
    }

    if (input.skillContext && input.skillContext.length > 0) {
      parts.push('# SKILL CONTEXT');
      for (const s of input.skillContext) {
        parts.push(`## Skill: ${s.skillName}\nTriggers: ${s.triggers.join(', ')}\n\n${s.instructions}`);
      }
    }

    if (input.fieldInstructions && input.fieldInstructions.length > 0) {
      parts.push(`# INSTRUCTIONS\n${input.fieldInstructions.map((i) => `- ${i}`).join('\n')}`);
    }

    parts.push(
      '# RULES\n- Never invent evidence. Only reference atom IDs you have been given.\n- Use approved terminology.\n- If uncertain, say so explicitly.',
    );
    return parts.join('\n\n');
  }
}
