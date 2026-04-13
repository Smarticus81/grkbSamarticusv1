import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';

/**
 * Ordered fallback. Tries each provider until one returns a successful
 * response. Health checks are cached for `healthTTLMs`.
 */
export class FallbackChain {
  private healthCache = new Map<string, { healthy: boolean; checkedAt: number }>();

  constructor(
    private readonly providers: LLMProvider[],
    private readonly healthTTLMs: number = 30_000,
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      if (!(await this.isHealthy(provider))) {
        errors.push(`${provider.name}: unhealthy`);
        continue;
      }
      try {
        return await provider.complete(request);
      } catch (e: any) {
        errors.push(`${provider.name}: ${e.message}`);
        this.healthCache.set(provider.name, { healthy: false, checkedAt: Date.now() });
      }
    }
    throw new Error(`All LLM providers failed: ${errors.join('; ')}`);
  }

  private async isHealthy(provider: LLMProvider): Promise<boolean> {
    const cached = this.healthCache.get(provider.name);
    if (cached && Date.now() - cached.checkedAt < this.healthTTLMs) {
      return cached.healthy;
    }
    const healthy = await provider.health().catch(() => false);
    this.healthCache.set(provider.name, { healthy, checkedAt: Date.now() });
    return healthy;
  }
}
