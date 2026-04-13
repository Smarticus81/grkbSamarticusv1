---
applyTo: "**/agents/**/*.ts"
---
# Agent Development Patterns

- Every agent extends `BaseGroundedAgent<TInput, TOutput>`.
- You MAY override: `execute`, `getRequiredObligations`, `getOutputSchema`,
  `initialize`, `cleanup`, `calculateConfidence`.
- You MAY NOT override `run()`. The sealed lifecycle enforces qualification,
  obligation loading, tracing, validation, and compliance.
- `getOutputSchema()` must return a Zod schema. The agent's output must include
  an `addressedObligations: string[]` field listing the obligationIds the
  agent claims to satisfy.
- LLM calls go through `this.invokeLLM(...)` or `this.invokeLLMForJSON(...)` —
  never instantiate providers directly.
- Required obligations come from `getRequiredObligations()` and must match
  obligationIds present in the graph for the run's process/jurisdiction.
- Test every agent via `TestHarness` (see `harness/TestHarness.ts`).
