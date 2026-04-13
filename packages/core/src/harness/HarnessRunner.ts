import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { TestHarness } from './TestHarness.js';
import type { BaseGroundedAgent } from '../agents/BaseGroundedAgent.js';

const ScenarioFileSchema = z.object({
  scenarios: z.array(
    z.object({
      name: z.string(),
      agent: z.string(),
      input: z.record(z.unknown()),
      mockObligations: z.array(z.string()).default([]),
      mockLLM: z
        .array(z.object({ pattern: z.string(), response: z.string() }))
        .default([]),
      assertions: z
        .object({
          traceChainValid: z.boolean().optional(),
          obligationsCovered: z.array(z.string()).optional(),
          confidenceAbove: z.number().optional(),
          llmCalls: z.number().optional(),
        })
        .default({}),
    }),
  ),
});

export type ScenarioFile = z.infer<typeof ScenarioFileSchema>;
export type AgentLookup = (name: string) => BaseGroundedAgent<any, any>;

export class HarnessRunner {
  constructor(private readonly harness: TestHarness, private readonly lookup: AgentLookup) {}

  async runFile(filePath: string): Promise<{ name: string; ok: boolean; error?: string }[]> {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = ScenarioFileSchema.parse(parseYaml(raw));
    const results: { name: string; ok: boolean; error?: string }[] = [];

    for (const scenario of parsed.scenarios) {
      try {
        this.harness.reset();
        if (scenario.mockLLM.length) this.harness.withMockLLM(scenario.mockLLM);
        const agent = this.lookup(scenario.agent);
        const result = await this.harness.runAgent(agent, scenario.input, {});
        if (scenario.assertions.traceChainValid) this.harness.assertTraceChainValid(result);
        if (scenario.assertions.obligationsCovered)
          this.harness.assertObligationsCovered(result, scenario.assertions.obligationsCovered);
        if (typeof scenario.assertions.confidenceAbove === 'number')
          this.harness.assertConfidenceAbove(result, scenario.assertions.confidenceAbove);
        if (typeof scenario.assertions.llmCalls === 'number')
          this.harness.assertLLMCallCount(scenario.assertions.llmCalls);
        results.push({ name: scenario.name, ok: true });
      } catch (e: any) {
        results.push({ name: scenario.name, ok: false, error: e.message });
      }
    }
    return results;
  }
}
