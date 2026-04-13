import type { ObligationNode } from '@regground/core';
import { TemplateEngine } from './TemplateEngine.js';

export interface SkillTemplateParams {
  processName: string;
  processDescription: string;
  steps: { name: string; description: string }[];
  obligations: ObligationNode[];
  outputDir: string;
}

const SKILL_TEMPLATE = `---
name: run-{{slug}}
description: "{{processDescription}} Use when: launching, configuring, or auditing a {{processName}} process."
---

# Run {{processName}}

Launch and run the {{processName}} process in the sandbox. Below is the canonical
step sequence and the obligations each step addresses.

## Steps
{{#each steps}}
- **{{name}}** — {{description}}
{{/each}}

## Obligations addressed
{{#each obligations}}
- \`{{obligationId}}\` — {{title}} ({{sourceCitation}})
{{/each}}

## Procedure
1. Upload required evidence via the Evidence Manager.
2. Launch the process via Process Designer or POST /api/processes.
3. Resolve any HITL gates through the dashboard.
4. Export the audit pack via the \`export-audit-pack\` skill.
`;

export function generateSkill(params: SkillTemplateParams): { skillMd: string; scripts: Record<string, string> } {
  const engine = new TemplateEngine();
  const skillMd = engine.render(SKILL_TEMPLATE, {
    slug: params.processName.toLowerCase().replace(/\s+/g, '-'),
    processName: params.processName,
    processDescription: params.processDescription,
    steps: params.steps,
    obligations: params.obligations,
  });
  return { skillMd, scripts: {} };
}
