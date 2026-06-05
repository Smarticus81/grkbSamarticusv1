/**
 * AgentContextSynthesizer — turns a Builder save payload into an
 * LLM-ready system prompt + persona summary that grounds the agent in
 * the regulations the user picked and any general QMS practices that
 * apply to the chosen role.
 *
 * Strategy:
 *  1. Try the LLM (single call, structured JSON, low temperature). The
 *     prompt explicitly cites the regulations the user picked.
 *  2. If the LLM is unavailable OR drifts, fall back to a deterministic
 *     template that still produces a usable system prompt so the agent
 *     always gets *some* context.
 *
 * The synthesised context is stored under
 *   builderAgent.attachedData.__context = { systemPrompt, personaSummary,
 *     regulatoryFocus[], practicesIncorporated[], generatedAt, model? }
 * and surfaced on /agents/:id/launch so the sandbox run can pass it
 * straight to the LLM as `agentContext`.
 */

import { z } from 'zod';
import { LLMAbstraction } from '@regground/core';

export const AgentContextSchema = z.object({
  systemPrompt: z.string().min(20).max(4000),
  personaSummary: z.string().min(10).max(600),
  regulatoryFocus: z.array(z.string()).min(0).max(20),
  practicesIncorporated: z.array(z.string()).min(0).max(20),
});
export type AgentContext = z.infer<typeof AgentContextSchema>;

export interface SynthesizeInput {
  processTitle: string;
  processId: string;
  taskId?: string | null;
  regulations: string[];
  description?: string | null;
  riskBand: 'low' | 'medium' | 'high';
}

export interface SynthesizedAgentContext extends AgentContext {
  generatedAt: string;
  model: string | null;
  source: 'llm' | 'deterministic';
}

let _llm: LLMAbstraction | null | undefined;
function getLLM(): LLMAbstraction | null {
  if (_llm !== undefined) return _llm;
  try {
    _llm = LLMAbstraction.fromEnv();
  } catch {
    _llm = null;
  }
  return _llm;
}

/** Common-practice prompts per QMS role. Used as deterministic fallback
 *  and also folded into the LLM prompt as starter material. */
const ROLE_PRACTICES: Record<string, string[]> = {
  'quality-engineer': [
    'Apply 5-whys and fishbone before declaring a root cause.',
    'Distinguish containment (immediate) from correction (long-term).',
    'Require an effectiveness check with a measurable success metric.',
  ],
  'quality-manager': [
    'Disposition NCs using risk-based reasoning, not convenience.',
    'Document containment scope (lot range, sites, customers).',
    'Escalate to CAPA when systemic indicators are present.',
  ],
  'regulatory-affairs': [
    'Map every change to potential re-registration / notification triggers.',
    'Track jurisdictional differences (EU MDR vs FDA vs UK MDR).',
    'Maintain a single regulatory rationale document per submission.',
  ],
  'vigilance-specialist': [
    'Apply MIR reportability criteria conservatively when in doubt.',
    'Track reportability clocks per jurisdiction independently.',
    'Cross-reference complaints, NCs and CAPAs for the same device family.',
  ],
  'internal-auditor': [
    'Phrase findings as: clause cited → fact → evidence → impact.',
    'Classify finding severity from systemic vs isolated indicators.',
    'Verify response plans before closing an audit.',
  ],
  'design-engineer': [
    'Re-run risk analysis whenever inputs, intended use or environment change.',
    'Trace every requirement to a V&V activity.',
    'Treat usability and software hazards as first-class risks.',
  ],
};

function rolePracticeKey(processId: string, processTitle: string): string {
  const key = processId.toLowerCase();
  if (ROLE_PRACTICES[key]) return key;
  const t = processTitle.toLowerCase();
  if (t.includes('quality engineer')) return 'quality-engineer';
  if (t.includes('quality manager') || t.includes('qa manager')) return 'quality-manager';
  if (t.includes('regulatory')) return 'regulatory-affairs';
  if (t.includes('vigilance') || t.includes('post-market')) return 'vigilance-specialist';
  if (t.includes('audit')) return 'internal-auditor';
  if (t.includes('design') || t.includes('r&d')) return 'design-engineer';
  return 'quality-engineer';
}

function deterministicContext(input: SynthesizeInput): SynthesizedAgentContext {
  const practiceKey = rolePracticeKey(input.processId, input.processTitle);
  const practices = ROLE_PRACTICES[practiceKey] ?? ROLE_PRACTICES['quality-engineer']!;
  const regs = input.regulations.length ? input.regulations : ['ISO 13485', '21 CFR 820'];
  const sys = [
    `You are a ${input.processTitle} for a medical device manufacturer.`,
    `Operate under the following regulations: ${regs.join(', ')}.`,
    `Risk posture: ${input.riskBand}.`,
    input.description ? `User intent for this agent: ${input.description.trim()}` : '',
    '',
    'Common practices to apply:',
    ...practices.map((p) => `- ${p}`),
    '',
    'Always cite only the obligations supplied to you at runtime; never invent regulatory references. Be specific, evidence-driven, and avoid generic compliance fluff.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    systemPrompt: sys,
    personaSummary: `${input.processTitle} grounded on ${regs.join(', ')}.`,
    regulatoryFocus: regs,
    practicesIncorporated: practices,
    generatedAt: new Date().toISOString(),
    model: null,
    source: 'deterministic',
  };
}

export async function synthesizeAgentContext(
  input: SynthesizeInput,
): Promise<SynthesizedAgentContext> {
  const llm = getLLM();
  if (!llm) return deterministicContext(input);

  const practiceKey = rolePracticeKey(input.processId, input.processTitle);
  const starterPractices = ROLE_PRACTICES[practiceKey] ?? [];

  const system = `You generate concise, regulatorily-precise system prompts for QMS AI agents. Return ONLY JSON matching the supplied schema. Do not invent regulations or clause numbers; only use those provided by the user. Keep systemPrompt under 2000 characters and grounded in the user-selected regulations.`;

  const user = [
    `process title: ${input.processTitle}`,
    `process key: ${input.processId}`,
    `Risk band: ${input.riskBand}`,
    `Selected regulations: ${input.regulations.join(', ') || '(none)'}`,
    `User description: ${input.description?.trim() || '(not provided)'}`,
    starterPractices.length
      ? `Starter practices for this role:\n${starterPractices.map((p) => `- ${p}`).join('\n')}`
      : '',
    '',
    'Produce:',
    '- systemPrompt: an LLM system prompt that frames the role, grounds it in the regulations listed, and emphasises citing only supplied obligations.',
    '- personaSummary: a 1-sentence summary of who the agent is.',
    '- regulatoryFocus: the regulations from the user list that this role most directly serves.',
    '- practicesIncorporated: 3-6 concrete QMS practices the agent will apply.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const out = await llm.completeJSON<AgentContext>(
      {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        maxTokens: 1200,
      },
      AgentContextSchema,
      { structuredOutput: true },
    );
    const parsed = AgentContextSchema.parse(out);
    return {
      ...parsed,
      generatedAt: new Date().toISOString(),
      model: null,
      source: 'llm',
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[AgentContextSynthesizer] LLM failed, using deterministic fallback:', err instanceof Error ? err.message : err);
    return deterministicContext(input);
  }
}
