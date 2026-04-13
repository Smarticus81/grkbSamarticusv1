import type { ZodSchema } from 'zod';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
  LLMCapabilities,
} from '../types.js';

export interface GenericProviderConfig {
  name: string;
  endpoint: string;
  apiKey?: string;
  authHeader?: string; // e.g. "Authorization" or "x-api-key"
  authPrefix?: string; // e.g. "Bearer "
  model?: string;
  capabilities: LLMCapabilities;
  /** Map LLMRequest -> provider-specific request body */
  buildBody?: (req: LLMRequest, model: string) => unknown;
  /** Map provider-specific response -> LLMResponse fields */
  parseResponse?: (raw: unknown) => Pick<LLMResponse, 'content' | 'usage' | 'finishReason' | 'reasoningTrace'>;
}

/**
 * Adapter for unknown / future / on-prem models. When a new frontier model
 * ships, you should be able to drop in a config and have it work without code
 * changes elsewhere in the system.
 */
export class GenericProvider implements LLMProvider {
  readonly name: string;
  readonly capabilities: LLMCapabilities;

  constructor(private readonly config: GenericProviderConfig) {
    this.name = config.name;
    this.capabilities = config.capabilities;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.config.model ?? 'default';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      const header = this.config.authHeader ?? 'Authorization';
      const prefix = this.config.authPrefix ?? 'Bearer ';
      headers[header] = `${prefix}${this.config.apiKey}`;
    }
    const body = this.config.buildBody
      ? this.config.buildBody(request, model)
      : { model, messages: request.messages, temperature: request.temperature ?? 0.2, max_tokens: request.maxTokens };

    const res = await fetch(this.config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${this.name} API error ${res.status}: ${await res.text()}`);
    const raw = await res.json();
    const parsed = this.config.parseResponse
      ? this.config.parseResponse(raw)
      : this.defaultParse(raw);

    const cost =
      (parsed.usage.inputTokens / 1_000_000) * this.capabilities.costPer1MTokens.input +
      (parsed.usage.outputTokens / 1_000_000) * this.capabilities.costPer1MTokens.output;
    return {
      content: parsed.content,
      model,
      provider: this.name,
      usage: parsed.usage,
      cost,
      finishReason: parsed.finishReason,
      reasoningTrace: parsed.reasoningTrace,
      raw,
    };
  }

  async completeJSON<T>(request: LLMRequest, schema: ZodSchema<T>): Promise<T> {
    const augmented: LLMRequest = {
      ...request,
      messages: [
        ...request.messages,
        { role: 'system', content: 'Respond with strictly valid JSON only. No prose, no fences.' },
      ],
    };
    const res = await this.complete(augmented);
    const cleaned = res.content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return schema.parse(JSON.parse(cleaned));
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const res = await this.complete(request);
    yield { delta: res.content, done: true, usage: res.usage };
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(this.config.endpoint, { method: 'OPTIONS' });
      return res.ok || res.status === 405;
    } catch {
      return false;
    }
  }

  private defaultParse(raw: any): Pick<LLMResponse, 'content' | 'usage' | 'finishReason' | 'reasoningTrace'> {
    const content =
      raw?.content ??
      raw?.choices?.[0]?.message?.content ??
      raw?.candidates?.[0]?.content?.parts?.[0]?.text ??
      '';
    const inputTokens = raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens ?? 0;
    const outputTokens = raw?.usage?.output_tokens ?? raw?.usage?.completion_tokens ?? 0;
    return {
      content,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      finishReason: 'stop',
      reasoningTrace: raw?.reasoning ?? raw?.thought ?? undefined,
    };
  }
}
