import type { ZodSchema } from 'zod';

export interface LLMCapabilities {
  structuredOutput: boolean;
  toolUse: boolean;
  maxContextTokens: number;
  reasoningTrace: boolean;
  multiModal: boolean;
  streaming: boolean;
  batchMode: boolean;
  costPer1MTokens: { input: number; output: number };
  latencyClass: 'fast' | 'standard' | 'slow';
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  tools?: LLMToolDefinition[];
  metadata?: Record<string, unknown>;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  usage: LLMUsage;
  cost: number;
  finishReason: 'stop' | 'length' | 'tool_use' | 'error';
  reasoningTrace?: string;
  raw?: unknown;
}

export interface LLMChunk {
  delta: string;
  done: boolean;
  usage?: LLMUsage;
}

export interface LLMProvider {
  readonly name: string;
  readonly capabilities: LLMCapabilities;
  complete(request: LLMRequest): Promise<LLMResponse>;
  completeJSON<T>(request: LLMRequest, schema: ZodSchema<T>): Promise<T>;
  stream(request: LLMRequest): AsyncIterable<LLMChunk>;
  health(): Promise<boolean>;
}

export interface CapabilityRequirements {
  structuredOutput?: boolean;
  toolUse?: boolean;
  minContextTokens?: number;
  reasoningTrace?: boolean;
  multiModal?: boolean;
  streaming?: boolean;
  maxLatencyClass?: 'fast' | 'standard' | 'slow';
  preferredProvider?: string;
}
