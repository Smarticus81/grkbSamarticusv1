/**
 * ManagedAgentClient — typed client for the Anthropic Managed Agents beta API.
 *
 * This is NOT an LLM provider. It provisions agents, environments, and sessions
 * rather than completing prompts. It lives under agents/ because it orchestrates
 * agent lifecycle, not model inference.
 *
 * API: https://api.anthropic.com/v1/{agents,environments,sessions}
 * Beta header: managed-agents-2026-04-01
 */

import {
  type ManagedAgentConfig,
  ManagedAgentConfigSchema,
  type CreateAgentParams,
  type ManagedAgent,
  type CreateEnvironmentParams,
  type ManagedEnvironment,
  type CreateSessionParams,
  type ManagedSession,
  type SendEventsParams,
  type ManagedSessionEvent,
} from './types.js';

const BETA_HEADER = 'managed-agents-2026-04-01';
const API_VERSION = '2023-06-01';

export class ManagedAgentClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  readonly config: ManagedAgentConfig;

  constructor(config?: Partial<ManagedAgentConfig>) {
    this.config = ManagedAgentConfigSchema.parse(config ?? {});
    const key = this.config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        'ManagedAgentClient requires ANTHROPIC_API_KEY. ' +
        'Set it as an environment variable or pass apiKey in the config.',
      );
    }
    this.apiKey = key;
    this.baseUrl = this.config.baseUrl;
  }

  /** Convenience factory that reads config from env. */
  static fromEnv(): ManagedAgentClient {
    return new ManagedAgentClient();
  }

  // ── HTTP helpers ───────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': API_VERSION,
      'anthropic-beta': BETA_HEADER,
      'content-type': 'application/json',
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ManagedAgentError(
        `Managed Agents API ${method} ${path} failed (${res.status}): ${text}`,
        res.status,
        text,
      );
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  // ── Agents ─────────────────────────────────────────────────────────

  async createAgent(params: CreateAgentParams): Promise<ManagedAgent> {
    return this.request<ManagedAgent>('POST', '/v1/agents', params);
  }

  async getAgent(agentId: string): Promise<ManagedAgent> {
    return this.request<ManagedAgent>('GET', `/v1/agents/${agentId}`);
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this.request<unknown>('DELETE', `/v1/agents/${agentId}`);
  }

  // ── Environments ───────────────────────────────────────────────────

  async createEnvironment(params: CreateEnvironmentParams): Promise<ManagedEnvironment> {
    return this.request<ManagedEnvironment>('POST', '/v1/environments', params);
  }

  async getEnvironment(envId: string): Promise<ManagedEnvironment> {
    return this.request<ManagedEnvironment>('GET', `/v1/environments/${envId}`);
  }

  async deleteEnvironment(envId: string): Promise<void> {
    await this.request<unknown>('DELETE', `/v1/environments/${envId}`);
  }

  // ── Sessions ───────────────────────────────────────────────────────

  async createSession(params: CreateSessionParams): Promise<ManagedSession> {
    return this.request<ManagedSession>('POST', '/v1/sessions', params);
  }

  async getSession(sessionId: string): Promise<ManagedSession> {
    return this.request<ManagedSession>('GET', `/v1/sessions/${sessionId}`);
  }

  // ── Events ─────────────────────────────────────────────────────────

  async sendEvents(sessionId: string, params: SendEventsParams): Promise<void> {
    await this.request<unknown>('POST', `/v1/sessions/${sessionId}/events`, params);
  }

  /**
   * Open an SSE stream for a session and yield parsed events.
   *
   * The caller is responsible for breaking out of the loop (e.g. on
   * `session.status_idle` or `session.status_failed`).
   */
  async *streamEvents(sessionId: string): AsyncGenerator<ManagedSessionEvent> {
    const url = `${this.baseUrl}/v1/sessions/${sessionId}/stream`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...this.headers(),
        'Accept': 'text/event-stream',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ManagedAgentError(
        `Managed Agents stream failed (${res.status}): ${text}`,
        res.status,
        text,
      );
    }
    if (!res.body) {
      throw new ManagedAgentError('No response body for SSE stream', 0, '');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json || json === '[DONE]') continue;
          try {
            yield JSON.parse(json) as ManagedSessionEvent;
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// ── Error class ──────────────────────────────────────────────────────

export class ManagedAgentError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'ManagedAgentError';
  }
}
