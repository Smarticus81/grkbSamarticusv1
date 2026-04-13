import { TemplateEngine } from './TemplateEngine.js';

export interface InstructionTemplateParams {
  applyTo: string;
  title: string;
  rules: string[];
}

const INSTRUCTION_TEMPLATE = `---
applyTo: "{{applyTo}}"
---
# {{title}}

{{#each rules}}
- {{this}}
{{/each}}
`;

export function generateInstructionMd(params: InstructionTemplateParams): string {
  const engine = new TemplateEngine();
  return engine.render(INSTRUCTION_TEMPLATE, {
    ...params,
    rules: params.rules.map((r) => ({ this: r })),
  });
}
