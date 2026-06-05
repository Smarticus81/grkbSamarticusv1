/**
 * ManagedAgentPromptManifest — builds the system prompt that will be sent to
 * Claude Managed Agents when deploying a Builder agent.
 *
 * The prompt merges:
 *   1. The LLM-synthesised or deterministic context from AgentContextSynthesizer
 *      (persona, regulatory focus, practices).
 *   2. The task definition metadata (if the agent has a taskId).
 *   3. RegGround compliance framing — citations, obligation awareness, trace
 *      requirements.
 *
 * The result is a single system prompt string that grounds the managed agent in
 * the same regulatory context the sandbox uses, but formatted for a long-running
 * autonomous agent rather than a single-shot task runner.
 */

import type { schema } from '@regground/core';
import { getTask } from '@regground/sandbox';

type BuilderAgentRow = schema.BuilderAgentRow;

export interface PromptManifest {
  system: string;
  agentName: string;
  model: string;
}

interface SynthesisedContext {
  systemPrompt?: string;
  personaSummary?: string;
  regulatoryFocus?: string[];
  practicesIncorporated?: string[];
}

/**
 * Build a grounded system prompt for deploying a Builder agent to Claude
 * Managed Agents.
 */
export function buildPromptManifest(
  agent: BuilderAgentRow,
  opts?: { model?: string },
): PromptManifest {
  const ctx = extractContext(agent);
  const task = agent.taskId ? getTask(agent.taskId) : null;

  const sections: string[] = [];

  // ── Role / persona ───────────────────────────────────────────────
  if (ctx?.systemPrompt) {
    sections.push(ctx.systemPrompt);
  } else {
    sections.push(
      `You are a ${agent.processTitle} agent for a medical device manufacturer.`,
    );
  }

  // ── Regulations ──────────────────────────────────────────────────
  const regs: string[] = agent.regulations?.length
    ? agent.regulations
    : ctx?.regulatoryFocus ?? [];
  if (regs.length) {
    sections.push(
      `## Applicable regulations\n` +
      regs.map((r) => `- ${r}`).join('\n'),
    );
  }

  // ── Task-specific framing ────────────────────────────────────────
  if (task) {
    sections.push(
      `## Task: ${task.name}\n` +
      task.oneLiner +
      (task.systemPrompt ? `\n\n${task.systemPrompt}` : ''),
    );
    if (task.claimedObligationIds?.length) {
      sections.push(
        `## Obligation scope\nYour output must address the following obligation IDs:\n` +
        task.claimedObligationIds.map((id) => `- ${id}`).join('\n'),
      );
    }
  }

  // ── Practices ────────────────────────────────────────────────────
  if (ctx?.practicesIncorporated?.length) {
    sections.push(
      `## QMS practices to apply\n` +
      ctx.practicesIncorporated.map((p) => `- ${p}`).join('\n'),
    );
  }

  // ── Guardrails / risk band ───────────────────────────────────────
  const risk = agent.riskBand ?? 'medium';
  sections.push(
    `## Compliance posture\n` +
    `Risk band: ${risk}.\n` +
    `Always cite only the obligations supplied to you; never invent regulatory references.\n` +
    `Be specific, evidence-driven, and traceable. Every substantive claim must reference a regulation or obligation by ID.`,
  );

  // ── Agent description ────────────────────────────────────────────
  if (agent.description) {
    sections.push(`## Agent purpose\n${agent.description}`);
  }

  return {
    system: sections.join('\n\n'),
    agentName: agent.name,
    model: opts?.model ?? process.env.MANAGED_AGENTS_MODEL ?? 'claude-opus-4-8',
  };
}

function extractContext(agent: BuilderAgentRow): SynthesisedContext | null {
  const data = agent.attachedData as Record<string, unknown> | null;
  if (!data) return null;
  const ctx = data.__context;
  if (!ctx || typeof ctx !== 'object') return null;
  return ctx as SynthesisedContext;
}
