import type { ProcessDefinition, AgentRegistration } from '@regground/core';
import { TemplateEngine } from './TemplateEngine.js';

export interface HarnessTemplateParams {
  processDefinition: ProcessDefinition;
  agents: AgentRegistration[];
  mockObligations: string[];
}

const HARNESS_TEMPLATE = `# Auto-generated harness for {{processName}}
# Run with: pnpm test:harness (or POST /api/sandbox/harness/run)
#
# Every scenario is isolated: the mock graph is re-seeded with the listed
# obligations (resolved from packages/core/regulations), evidence defaults to
# what those obligations require, and the mock LLM is reset. Omit
# \`mockObligations\` to seed the agent's own declared obligations.
name: {{processName}}
defaults:
  mockObligations:
{{#each mockObligationsRendered}}
    - "{{this}}"
{{/each}}
scenarios:
{{#each agents}}
  - name: "{{agentType}} happy path"
    agent: {{agentType}}
    input: {}
    mockLLM: []
    assertions:
      traceChainValid: true
      qualificationStatus: QUALIFIED
      noComplianceGaps: true
      confidenceAbove: 0.5
      hasEvents: [AGENT_COMPLETED]

  - name: "{{agentType}} is blocked without evidence"
    agent: {{agentType}}
    input: {}
    context:
      availableEvidenceTypes: []
    assertions:
      qualificationStatus: BLOCKED
      hasEvents: [QUALIFICATION_BLOCKED]
{{/each}}
`;

export function generateHarnessYAML(params: HarnessTemplateParams): string {
  const engine = new TemplateEngine();
  // Plain strings: the engine binds each item to `{{this}}`; wrapping them in
  // objects used to render "[object Object]".
  return engine.render(HARNESS_TEMPLATE, {
    processName: params.processDefinition.name,
    mockObligationsRendered: [...params.mockObligations],
    agents: params.agents.map((a) => ({ agentType: a.agentType })),
  });
}
