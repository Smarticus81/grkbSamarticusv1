---
name: create-agent
description: "Scaffold a new grounded agent with BaseGroundedAgent extension, test harness, mock scenarios, and obligation bindings. Use when: creating a new agent, adding agent capabilities, building agent logic."
---

# Create Agent

Scaffold a new grounded agent that walks the ground.

## Procedure

1. Copy `assets/agent-template.ts` to
   `packages/sandbox/src/processes/<process>/agents/<Name>Agent.ts`.
2. Define your `InputSchema` and `OutputSchema`. The output MUST include
   `addressedObligations: z.array(z.string())`.
3. Implement `execute(input, obligations, constraints)`. Use
   `this.invokeLLMForJSON({ schema, ... })` for typed LLM calls.
4. List required obligationIds in `getRequiredObligations()`.
5. Copy `assets/agent-test-template.ts` to a sibling `.test.ts` file and add
   at least 3 scenarios (happy path, qualification block, validation error).
6. Add scenarios to your process's `harness/<process>-scenarios.yaml`.
7. Run `pnpm test:harness` to verify.

## See also
- `references/agent-lifecycle.md` for the sealed lifecycle reference.
- `.github/instructions/agents.instructions.md` for hard rules.
