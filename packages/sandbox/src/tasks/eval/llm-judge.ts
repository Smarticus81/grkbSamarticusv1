/**
 * Optional LLM judge — scores a lane's output qualitatively. The sandbox
 * never auto-invokes this. The user must press "Score with LLM judge".
 *
 * If no LLM API key is present, returns a deterministic surrogate score
 * derived from the deterministic scorecard so the UI still has data to
 * render. This keeps the sandbox demo-runnable with zero secrets.
 */

import type { LaneResult, LLMJudgeScore, TaskAgentDefinition } from '../types.js';

export interface JudgeOptions {
  /** When false (default), uses the deterministic surrogate. */
  useLiveLLM?: boolean;
}

export async function judgeLane(
  def: TaskAgentDefinition<any, any>,
  lane: LaneResult,
  opts: JudgeOptions = {},
): Promise<LLMJudgeScore> {
  if (opts.useLiveLLM) {
    // Hook for a future LLM-backed judge. Falls through to the surrogate
    // if any required environment variable is absent — the sandbox must
    // never throw because of missing keys.
    const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY);
    if (!hasKey) return surrogate(def, lane);
    return surrogate(def, lane); // TODO: wire LLMAbstraction once provider keys are present
  }
  return surrogate(def, lane);
}

function surrogate(_def: TaskAgentDefinition<any, any>, lane: LaneResult): LLMJudgeScore {
  const cov = lane.score.coverage;
  const cite = lane.score.citations;
  const gate = lane.score.strictGatePass ? 1 : 0;

  const accuracy             = clamp10(2 + cov * 6 + gate * 2);
  const citations            = clamp10(Math.min(10, cite * 1.6));
  const regulatoryAwareness  = clamp10(2 + cov * 5 + (cite > 0 ? 3 : 0));
  const completeness         = clamp10(3 + cov * 5 + gate * 2);

  const rationale = lane.lane === 'with-graph'
    ? `Graph-grounded run. Covered ${(cov * 100).toFixed(0)}% of obligations with ${cite} citation(s). StrictGate ${gate ? 'passed' : 'failed'}.`
    : `Ungrounded run. Covered ${(cov * 100).toFixed(0)}% of obligations with ${cite} citation(s). StrictGate ${gate ? 'passed' : 'failed'}. Output lacks regulatory grounding.`;

  return { accuracy, citations, regulatoryAwareness, completeness, rationale };
}

function clamp10(n: number): number {
  return Math.max(0, Math.min(10, Number(n.toFixed(1))));
}
