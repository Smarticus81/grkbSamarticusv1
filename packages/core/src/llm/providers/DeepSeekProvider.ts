import type { ZodSchema } from 'zod';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
  LLMCapabilities,
} from '../types.js';
import { generateStructuredJson } from '../structuredJson.js';

export interface DeepSeekProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

/**
 * DeepSeek V4 provider. The DeepSeek API is OpenAI-compatible
 * (same /chat/completions shape) with an optional thinking mode.
 *
 * Current models (June 2026):
 *  - deepseek-v4-pro  — 1.6T MoE (49B active), 1M context, thinking
 *  - deepseek-v4-flash — 284B MoE (13B active), 1M context, thinking
 *
 * Legacy aliases deepseek-chat / deepseek-reasoner are deprecated
 * and will be removed 2026-07-24.
 */
export class DeepSeekProvider implements LLMProvider {
  readonly name = 'deepseek';
  readonly capabilities: LLMCapabilities = {
    structuredOutput: true,
    toolUse: true,
    maxContextTokens: 1_000_000,
    reasoningTrace: true,
    multiModal: false,
    streaming: true,
    batchMode: true,
    costPer1MTokens: { input: 0.6, output: 2.4 },
    latencyClass: 'standard',
  };

  constructor(private readonly config: DeepSeekProviderConfig) {}

  private get model(): string {
    return this.config.model ?? 'deepseek-v4-pro';
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? 'https://api.deepseek.com';
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.model;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens,
        stop: request.stop,
      }),
      signal: AbortSignal.timeout(120_000), // 2 min timeout per call
    });
    if (!res.ok) {
      throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    const choice = data.choices?.[0];
    const usage = data.usage ?? {};
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;

    // DeepSeek V4 thinking mode returns reasoning in a separate field
    const reasoningContent = choice?.message?.reasoning_content;

    return {
      content: choice?.message?.content ?? '',
      model: data.model ?? model,
      provider: this.name,
      usage: {
        inputTokens,
        outputTokens: outputTokens + reasoningTokens,
        totalTokens: inputTokens + outputTokens + reasoningTokens,
      },
      cost:
        (inputTokens / 1_000_000) * this.capabilities.costPer1MTokens.input +
        ((outputTokens + reasoningTokens) / 1_000_000) * this.capabilities.costPer1MTokens.output,
      finishReason: this.mapFinish(choice?.finish_reason),
      reasoningTrace: reasoningContent || undefined,
      raw: data,
    };
  }

  async completeJSON<T>(request: LLMRequest, schema: ZodSchema<T>): Promise<T> {
    return generateStructuredJson<T>((req) => this.complete(req), request, schema);
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const res = await this.complete(request);
    yield { delta: res.content, done: true, usage: res.usage };
  }

  async health(): Promise<boolean> {
    return Boolean(this.config.apiKey);
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
