export interface AgentMetricsSnapshot {
  llmCalls: number;
  tokens: number;
  cost: number;
  timeMs: number;
  warnings: string[];
}

export class AgentMetrics {
  private startTime = Date.now();
  llmCalls = 0;
  tokens = 0;
  cost = 0;
  warnings: string[] = [];

  reset(): void {
    this.startTime = Date.now();
    this.llmCalls = 0;
    this.tokens = 0;
    this.cost = 0;
    this.warnings = [];
  }

  recordLLMCall(tokens: number, cost: number): void {
    this.llmCalls++;
    this.tokens += tokens;
    this.cost += cost;
  }

  warn(message: string): void {
    this.warnings.push(message);
  }

  snapshot(): AgentMetricsSnapshot {
    return {
      llmCalls: this.llmCalls,
      tokens: this.tokens,
      cost: this.cost,
      timeMs: Date.now() - this.startTime,
      warnings: [...this.warnings],
    };
  }
}
