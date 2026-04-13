# Regulatory Ground — Workspace Instructions

This is a regulatory compliance enforcement platform. When writing code here:

- Every agent MUST extend `BaseGroundedAgent`. Never create agents that bypass the ground.
- All database access goes through Drizzle ORM via the schema in `packages/core/src/db/schema.ts`.
- Neo4j is the PRIMARY store for obligations. PostgreSQL is operational only.
- Every LLM call MUST go through `LLMAbstraction` — never call providers directly.
- All agent outputs MUST pass through `StrictGate` (Zod validation).
- All decisions MUST be traced via `DecisionTraceService` (hash-chained).
- Use vitest for all tests. Use `TestHarness` for agent tests.
- YAML obligation files go in `packages/core/regulations/{regulation-name}/`.
- Process definitions go in `packages/sandbox/src/processes/{process-name}/`.
- Never put regulation knowledge in code — it lives in YAML files → graph.
- Never use `any`. Type everything with Zod schemas.
