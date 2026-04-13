import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';

export interface BenchmarkResult {
  provider: string;
  model: string;
  latencyMs: number;
  tokensPerSecond: number;
  cost: number;
  ok: boolean;
  error?: string;
}

/**
 * Runs a probe request across providers to measure live latency, throughput,
 * and cost. Used by CapabilityNegotiator and ops dashboards.
 */
export class ModelBenchmark {
  constructor(private readonly providers: LLMProvider[]) {}

  async run(probe: LLMRequest): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];
    for (const p of this.providers) {
      const start = Date.now();
      try {
        const res: LLMResponse = await p.complete(probe);
        const latencyMs = Date.now() - start;
        results.push({
          provider: p.name,
          model: res.model,
          latencyMs,
          tokensPerSecond: res.usage.outputTokens / Math.max(latencyMs / 1000, 0.001),
          cost: res.cost,
          ok: true,
        });
      } catch (e: any) {
        results.push({
          provider: p.name,
          model: 'unknown',
          latencyMs: Date.now() - start,
          tokensPerSecond: 0,
          cost: 0,
          ok: false,
          error: e.message,
        });
      }
    }
    return results;
  }
}
