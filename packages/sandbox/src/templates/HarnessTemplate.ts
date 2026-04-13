import type { ProcessDefinition, AgentRegistration } from '@regground/core';
import { TemplateEngine } from './TemplateEngine.js';

export interface HarnessTemplateParams {
  processDefinition: ProcessDefinition;
  agents: AgentRegistration[];
  mockObligations: string[];
}

const HARNESS_TEMPLATE = `# Auto-generated harness for {{processName}}
scenarios:
{{#each agents}}
  - name: "{{agentType}} happy path"
    agent: {{agentType}}
    input: {}
    mockObligations:
{{#each mockObligationsRendered}}
      - "{{this}}"
{{/each}}
    mockLLM: []
    assertions:
      traceChainValid: true
      confidenceAbove: 0.5
{{/each}}
`;

export function generateHarnessYAML(params: HarnessTemplateParams): string {
  const engine = new TemplateEngine();
  const renderedObligations = params.mockObligations.map((o) => ({ this: o }));
  return engine.render(HARNESS_TEMPLATE, {
    processName: params.processDefinition.name,
    agents: params.agents.map((a) => ({
      agentType: a.agentType,
      mockObligationsRendered: renderedObligations,
    })),
  });
}
