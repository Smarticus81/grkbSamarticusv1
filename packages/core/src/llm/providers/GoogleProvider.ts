import type { ZodSchema } from 'zod';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
  LLMCapabilities,
} from '../types.js';

export interface GoogleProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class GoogleProvider implements LLMProvider {
  readonly name = 'google';
  readonly capabilities: LLMCapabilities = {
    structuredOutput: true,
    toolUse: true,
    maxContextTokens: 2_000_000,
    reasoningTrace: false,
    multiModal: true,
    streaming: true,
    batchMode: true,
    costPer1MTokens: { input: 1.25, output: 5 },
    latencyClass: 'standard',
  };

  constructor(private readonly config: GoogleProviderConfig) {}

  private get model(): string {
    return this.config.model ?? 'gemini-2.0-flash';
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const systemPart = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const url = `${this.baseUrl}/models/${request.model ?? this.model}:generateContent?key=${this.config.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: systemPart ? { parts: [{ text: systemPart }] } : undefined,
        contents,
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          maxOutputTokens: request.maxTokens,
          stopSequences: request.stop,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Google API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    return {
      content,
      model: request.model ?? this.model,
      provider: this.name,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      cost:
        (inputTokens / 1_000_000) * this.capabilities.costPer1MTokens.input +
        (outputTokens / 1_000_000) * this.capabilities.costPer1MTokens.output,
      finishReason: candidate?.finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
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
