import type { ZodSchema } from 'zod';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
  LLMCapabilities,
} from '../types.js';
import { generateStructuredJson } from '../structuredJson.js';

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
    maxContextTokens: 1_000_000,
    reasoningTrace: true,
    multiModal: true,
    streaming: true,
    batchMode: true,
    costPer1MTokens: { input: 1.5, output: 9 },
    latencyClass: 'fast',
  };

  constructor(private readonly config: GoogleProviderConfig) {}

  private get model(): string {
    return this.config.model ?? 'gemini-3.5-flash';
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
      signal: AbortSignal.timeout(120_000), // 2 min timeout per call
      body: JSON.stringify({
        systemInstruction: systemPart ? { parts: [{ text: systemPart }] } : undefined,
        contents,
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          maxOutputTokens: request.maxTokens,
          stopSequences: request.stop,
          // Gemini 3.x / 2.5 models support native thinking — allocate
          // a thinking budget proportional to the output budget.
          thinkingConfig: {
            thinkingBudget: Math.min(
              (request.maxTokens ?? 4096) * 2,
              16384,
            ),
          },
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Google API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    const candidate = data.candidates?.[0];

    // Gemini thinking models return parts with an optional `thought` flag.
    // Separate the reasoning trace from actual output content.
    const parts: any[] = candidate?.content?.parts ?? [];
    let content = '';
    let reasoningTrace = '';
    for (const p of parts) {
      if (p.thought) {
        reasoningTrace += (p.text ?? '');
      } else {
        content += (p.text ?? '');
      }
    }

    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    const thinkingTokens = data.usageMetadata?.thoughtsTokenCount ?? 0;

    return {
      content,
      model: request.model ?? this.model,
      provider: this.name,
      usage: {
        inputTokens,
        outputTokens: outputTokens + thinkingTokens,
        totalTokens: inputTokens + outputTokens + thinkingTokens,
      },
      cost:
        (inputTokens / 1_000_000) * this.capabilities.costPer1MTokens.input +
        ((outputTokens + thinkingTokens) / 1_000_000) * this.capabilities.costPer1MTokens.output,
      finishReason: candidate?.finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
      reasoningTrace: reasoningTrace || undefined,
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
}
