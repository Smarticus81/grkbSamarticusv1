import type { ZodSchema } from 'zod';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMChunk,
  LLMCapabilities,
} from '../llm/types.js';
import type { MockLLMCall, MockLLMResponse } from './types.js';

/**
 * Deterministic LLM. Matches user prompt content against patterns and returns
 * canned responses. Records every call (with match status and timing) for
 * assertion.
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

  callLog: MockLLMCall[] = [];

  /** Response returned when no pattern matches. Defaults to an empty JSON object. */
  fallbackResponse = '{}';

  private responses: MockLLMResponse[];

  constructor(responses: MockLLMResponse[] = []) {
    this.responses = [...responses];
  }

  addResponse(r: MockLLMResponse): void {
    this.responses.push(r);
  }

  /** Replace every canned response. Use between isolated scenarios. */
  setResponses(responses: MockLLMResponse[]): void {
    this.responses = [...responses];
  }

  clearResponses(): void {
    this.responses = [];
  }

  get responseCount(): number {
    return this.responses.length;
  }

  /** Calls that fell through to the fallback response. */
  get unmatchedCalls(): number {
    return this.callLog.filter((c) => !c.matched).length;
  }

  get totalDurationMs(): number {
    return this.callLog.reduce((sum, c) => sum + c.durationMs, 0);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const started = performance.now();
    const userContent = request.messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n');
    const matched = this.responses.find((r) => {
      const re = typeof r.pattern === 'string' ? new RegExp(r.pattern, 'i') : r.pattern;
      return re.test(userContent);
    });
    const content = matched?.response ?? this.fallbackResponse;
    const inputTokens = Math.ceil(userContent.length / 4);
    const outputTokens = Math.ceil(content.length / 4);
    const response: LLMResponse = {
      content,
      model: 'mock-1',
      provider: this.name,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      cost: 0,
      finishReason: 'stop',
    };
    this.callLog.push({
      request,
      response,
      matched: Boolean(matched),
      durationMs: performance.now() - started,
    });
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

  /** Clears the call log. Canned responses are kept; use `clearResponses()` for those. */
  reset(): void {
    this.callLog = [];
  }
}
