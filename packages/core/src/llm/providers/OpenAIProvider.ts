import type { ZodSchema } from 'zod';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
  LLMCapabilities,
} from '../types.js';

export interface OpenAIProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly capabilities: LLMCapabilities = {
    structuredOutput: true,
    toolUse: true,
    maxContextTokens: 128_000,
    reasoningTrace: false,
    multiModal: true,
    streaming: true,
    batchMode: true,
    costPer1MTokens: { input: 2.5, output: 10 },
    latencyClass: 'standard',
  };

  constructor(private readonly config: OpenAIProviderConfig) {}

  private get model(): string {
    return this.config.model ?? 'gpt-4o';
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? 'https://api.openai.com/v1';
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model ?? this.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens,
        stop: request.stop,
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    const choice = data.choices?.[0];
    const usage = data.usage ?? {};
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    return {
      content: choice?.message?.content ?? '',
      model: data.model ?? this.model,
      provider: this.name,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      cost:
        (inputTokens / 1_000_000) * this.capabilities.costPer1MTokens.input +
        (outputTokens / 1_000_000) * this.capabilities.costPer1MTokens.output,
      finishReason: this.mapFinish(choice?.finish_reason),
      raw: data,
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
    // Minimal SSE-free streaming: fall back to a single chunk from complete().
    const res = await this.complete(request);
    yield { delta: res.content, done: true, usage: res.usage };
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private mapFinish(reason: string | undefined): LLMResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_use';
      default:
        return 'stop';
    }
  }
}
