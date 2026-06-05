import type { ZodSchema } from 'zod';
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  CapabilityRequirements,
  LLMChunk,
} from './types.js';
import { CapabilityNegotiator } from './CapabilityNegotiator.js';
import { FallbackChain } from './FallbackChain.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { GoogleProvider } from './providers/GoogleProvider.js';
import { DeepSeekProvider } from './providers/DeepSeekProvider.js';

/**
 * The single entry point agents use for LLM calls. Performs capability
 * negotiation per call, falls through unhealthy providers, and tracks usage.
 */
export class LLMAbstraction {
  private negotiator: CapabilityNegotiator;
  private fallback: FallbackChain;

  constructor(private readonly providers: LLMProvider[]) {
    if (providers.length === 0) {
      throw new Error('LLMAbstraction requires at least one provider');
    }
    this.negotiator = new CapabilityNegotiator(providers);
    this.fallback = new FallbackChain(providers);
  }

  /**
   * Build a default abstraction from environment variables.
   * DeepSeek is registered first (cheapest reasoning model) so the
   * capability negotiator prefers it when requirements are met.
   * All configured providers participate in the fallback chain.
   */
  static fromEnv(): LLMAbstraction {
    const providers: LLMProvider[] = [];
    // DeepSeek first — cheapest reasoning provider, preferred default
    if (process.env.DEEPSEEK_API_KEY) {
      providers.push(new DeepSeekProvider({ apiKey: process.env.DEEPSEEK_API_KEY }));
    }
    if (process.env.GOOGLE_API_KEY) {
      providers.push(new GoogleProvider({ apiKey: process.env.GOOGLE_API_KEY }));
    }
    if (process.env.OPENAI_API_KEY) {
      providers.push(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }));
    }
    if (process.env.ANTHROPIC_API_KEY) {
      providers.push(new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }));
    }
    if (providers.length === 0) {
      throw new Error(
        'No LLM provider env vars set (DEEPSEEK_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY)',
      );
    }
    return new LLMAbstraction(providers);
  }

  async complete(
    request: LLMRequest,
    requirements: CapabilityRequirements = {},
  ): Promise<LLMResponse> {
    const provider = this.negotiator.select(requirements);
    if (provider) {
      try {
        return await provider.complete(request);
      } catch {
        // fall through to fallback chain
      }
    }
    return this.fallback.complete(request);
  }

  async completeJSON<T>(
    request: LLMRequest,
    schema: ZodSchema<T>,
    requirements: CapabilityRequirements = {},
  ): Promise<T> {
    // Rank all eligible providers; try each until one succeeds.
    const ranked = this.negotiator.rank({ ...requirements, structuredOutput: true });
    const candidates = ranked.length > 0 ? ranked : this.providers;

    const errors: string[] = [];
    for (const provider of candidates) {
      try {
        console.log(`[LLM] completeJSON trying ${provider.name}…`);
        const result = await provider.completeJSON(request, schema);
        console.log(`[LLM] completeJSON success via ${provider.name}`);
        return result;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[LLM] completeJSON ${provider.name} failed: ${msg.slice(0, 200)}`);
        errors.push(`${provider.name}: ${msg}`);
        // continue to next provider
      }
    }
    throw new Error(`All LLM providers failed for completeJSON: ${errors.join('; ')}`);
  }

  async *stream(request: LLMRequest, requirements: CapabilityRequirements = {}): AsyncIterable<LLMChunk> {
    const provider =
      this.negotiator.select({ ...requirements, streaming: true }) ?? this.providers[0]!;
    yield* provider.stream(request);
  }

  listProviders(): readonly LLMProvider[] {
    return this.providers;
  }
}
