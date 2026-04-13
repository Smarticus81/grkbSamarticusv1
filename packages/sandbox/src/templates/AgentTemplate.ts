import { TemplateEngine } from './TemplateEngine.js';

export interface AgentTemplateParams {
  name: string;
  description: string;
  tools: string[];
  persona: string;
  constraints: string[];
  outputDir?: string;
}

const AGENT_TEMPLATE = `---
description: "{{description}}"
tools: [{{toolList}}]
---

# {{name}}

## Persona
{{persona}}

## Hard rules
{{#each constraints}}
- {{this}}
{{/each}}
`;

export function generateAgentMd(params: AgentTemplateParams): string {
  const engine = new TemplateEngine();
  return engine.render(AGENT_TEMPLATE, {
    ...params,
    toolList: params.tools.join(', '),
    constraints: params.constraints.map((c) => ({ this: c })),
  });
}
