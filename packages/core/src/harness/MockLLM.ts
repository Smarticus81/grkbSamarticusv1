import type { ZodSchema } from 'zod';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
  LLMCapabilities,
} from '../llm/types.js';
import type { MockLLMResponse } from './types.js';

/**
 * Deterministic LLM. Matches user prompt content against patterns and returns
 * canned responses. Records every call for assertion.
 */
export class MockLLM implements LLMProvider {
  readonly name = 'mock';
  readonly capabilities: LLMCapabilities = {
    structuredOutput: true,
    toolUse: true,
    maxContextTokens: 1_000_000,
    reasoningTrace: false,
    multiModal: false,
    streaming: true,
    batchMode: false,
    costPer1MTokens: { input: 0, output: 0 },
    latencyClass: 'fast',
  };

  callLog: { request: LLMRequest; response: LLMResponse }[] = [];

  constructor(private readonly responses: MockLLMResponse[] = []) {}

  addResponse(r: MockLLMResponse): void {
    this.responses.push(r);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const userContent = request.messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n');
    const matched = this.responses.find((r) => {
      const re = typeof r.pattern === 'string' ? new RegExp(r.pattern, 'i') : r.pattern;
      return re.test(userContent);
    });
    const content = matched?.response ?? '{}';
    const response: LLMResponse = {
      content,
      model: 'mock-1',
      provider: this.name,
      usage: { inputTokens: userContent.length / 4, outputTokens: content.length / 4, totalTokens: (userContent.length + content.length) / 4 },
      cost: 0,
      finishReason: 'stop',
    };
    this.callLog.push({ request, response });
    return response;
  }

  async completeJSON<T>(request: LLMRequest, schema: ZodSchema<T>): Promise<T> {
    const res = await this.complete(request);
    return schema.parse(JSON.parse(res.content));
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const res = await this.complete(request);
    yield { delta: res.content, done: true, usage: res.usage };
  }

  async health(): Promise<boolean> {
    return true;
  }

  reset(): void {
    this.callLog = [];
  }
}
