/**
 * Types for the Claude Managed Agents runtime client.
 *
 * These types model the Anthropic Managed Agents beta API (managed-agents-2026-04-01).
 * They are NOT part of the LLM abstraction layer — Managed Agents provisions
 * agents/environments/sessions rather than completing prompts.
 */

import { z } from 'zod';

// ── Agent ──────────────────────────────────────────────────────────────

export const ManagedAgentToolSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('agent_toolset_20260401') }),
  z.object({ type: z.literal('bash_20250124'), command: z.string().optional() }),
  z.object({ type: z.literal('text_editor_20250124') }),
  z.object({ type: z.literal('web_search_20250305') }),
]);

export type ManagedAgentTool = z.infer<typeof ManagedAgentToolSchema>;

export const CreateAgentParamsSchema = z.object({
  name: z.string().min(1).max(200),
  model: z.string().default('claude-opus-4-8'),
  system: z.string().min(1).max(32000),
  tools: z.array(ManagedAgentToolSchema).min(1),
});

export type CreateAgentParams = z.infer<typeof CreateAgentParamsSchema>;

export interface ManagedAgent {
  id: string;
  version: number;
  name: string;
  model: string;
  system: string;
  tools: ManagedAgentTool[];
  created_at: string;
}

// ── Environment ────────────────────────────────────────────────────────

export const EnvironmentNetworkingSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('unrestricted') }),
  z.object({ type: z.literal('restricted'), allowed_domains: z.array(z.string()).optional() }),
  z.object({ type: z.literal('none') }),
]);

export const CreateEnvironmentParamsSchema = z.object({
  name: z.string().min(1).max(200),
  config: z.object({
    type: z.enum(['cloud', 'self-hosted']).default('cloud'),
    networking: EnvironmentNetworkingSchema.default({ type: 'none' }),
  }),
});

export type CreateEnvironmentParams = z.infer<typeof CreateEnvironmentParamsSchema>;

export interface ManagedEnvironment {
  id: string;
  name: string;
  config: { type: string; networking: { type: string } };
  created_at: string;
}

// ── Session ────────────────────────────────────────────────────────────

export const CreateSessionParamsSchema = z.object({
  agent: z.string(),
  environment_id: z.string(),
  title: z.string().max(200).optional(),
});

export type CreateSessionParams = z.infer<typeof CreateSessionParamsSchema>;

export interface ManagedSession {
  id: string;
  agent: string;
  environment_id: string;
  title: string | null;
  status: 'active' | 'idle' | 'completed' | 'failed';
  created_at: string;
}

// ── Events ─────────────────────────────────────────────────────────────

export interface UserMessageEvent {
  type: 'user.message';
  content: Array<{ type: 'text'; text: string }>;
}

export interface SendEventsParams {
  events: UserMessageEvent[];
}

/** Union of all SSE event types the stream can emit. */
export type ManagedSessionEvent =
  | { type: 'agent.message'; content: Array<{ type: 'text'; text: string }> }
  | { type: 'agent.tool_use'; id: string; name: string; input: unknown }
  | { type: 'agent.tool_result'; tool_use_id: string; content: unknown }
  | { type: 'session.status_idle' }
  | { type: 'session.status_failed'; error?: string }
  | { type: string; [key: string]: unknown };

// ── Config ─────────────────────────────────────────────────────────────

export const ManagedAgentConfigSchema = z.object({
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  apiKey: z.string().optional(),
  /** Base URL override (for testing/proxies). */
  baseUrl: z.string().url().default('https://api.anthropic.com'),
  /** Default model for new agents. */
  defaultModel: z.string().default('claude-opus-4-8'),
  /** Default environment networking policy. */
  defaultNetworking: EnvironmentNetworkingSchema.default({ type: 'unrestricted' }),
  /** Default tools to provision. */
  defaultTools: z.array(ManagedAgentToolSchema).default([
    { type: 'agent_toolset_20260401' },
  ]),
});

export type ManagedAgentConfig = z.infer<typeof ManagedAgentConfigSchema>;
