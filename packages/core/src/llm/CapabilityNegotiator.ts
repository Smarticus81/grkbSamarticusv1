import type { LLMProvider, CapabilityRequirements } from './types.js';

const LATENCY_RANK: Record<'fast' | 'standard' | 'slow', number> = {
  fast: 0,
  standard: 1,
  slow: 2,
};

export class CapabilityNegotiator {
  constructor(private readonly providers: LLMProvider[]) {}

  /**
   * Pick the cheapest provider that meets all stated requirements. Returns
   * null if no provider qualifies.
   */
  select(req: CapabilityRequirements): LLMProvider | null {
    const eligible = this.providers.filter((p) => this.meets(p, req));
    if (eligible.length === 0) return null;
    if (req.preferredProvider) {
      const preferred = eligible.find((p) => p.name === req.preferredProvider);
      if (preferred) return preferred;
    }
    return eligible.sort((a, b) => {
      const aCost = a.capabilities.costPer1MTokens.input + a.capabilities.costPer1MTokens.output;
      const bCost = b.capabilities.costPer1MTokens.input + b.capabilities.costPer1MTokens.output;
      return aCost - bCost;
    })[0]!;
  }

  rank(req: CapabilityRequirements): LLMProvider[] {
    return this.providers
      .filter((p) => this.meets(p, req))
      .sort((a, b) => {
        const aCost = a.capabilities.costPer1MTokens.input + a.capabilities.costPer1MTokens.output;
        const bCost = b.capabilities.costPer1MTokens.input + b.capabilities.costPer1MTokens.output;
        return aCost - bCost;
      });
  }

  private meets(p: LLMProvider, req: CapabilityRequirements): boolean {
    const c = p.capabilities;
    if (req.structuredOutput && !c.structuredOutput) return false;
    if (req.toolUse && !c.toolUse) return false;
    if (req.minContextTokens && c.maxContextTokens < req.minContextTokens) return false;
    if (req.reasoningTrace && !c.reasoningTrace) return false;
    if (req.multiModal && !c.multiModal) return false;
    if (req.streaming && !c.streaming) return false;
    if (req.maxLatencyClass && LATENCY_RANK[c.latencyClass] > LATENCY_RANK[req.maxLatencyClass]) {
      return false;
    }
    return true;
  }
}
