import type { ZodSchema } from 'zod';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
  LLMCapabilities,
} from '../types.js';

export interface AnthropicProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly capabilities: LLMCapabilities = {
    structuredOutput: true,
    toolUse: true,
    maxContextTokens: 1_000_000,
    reasoningTrace: true,
    multiModal: true,
    streaming: true,
    batchMode: true,
    costPer1MTokens: { input: 3, output: 15 },
    latencyClass: 'standard',
  };

  constructor(private readonly config: AnthropicProviderConfig) {}

  private get model(): string {
    return this.config.model ?? 'claude-opus-4-6';
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? 'https://api.anthropic.com/v1';
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const systemMessages = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const conversation = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: request.model ?? this.model,
        system: systemMessages || undefined,
        messages: conversation,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.2,
        stop_sequences: request.stop,
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    const content = (data.content ?? []).map((c: any) => c.text ?? '').join('');
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    return {
      content,
      model: data.model ?? this.model,
      provider: this.name,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      cost:
        (inputTokens / 1_000_000) * this.capabilities.costPer1MTokens.input +
        (outputTokens / 1_000_000) * this.capabilities.costPer1MTokens.output,
      finishReason: data.stop_reason === 'max_tokens' ? 'length' : 'stop',
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
    const res = await this.complete(request);
    yield { delta: res.content, done: true, usage: res.usage };
  }

  async health(): Promise<boolean> {
    return Boolean(this.config.apiKey);
  }
}
