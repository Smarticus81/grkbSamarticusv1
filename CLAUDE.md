# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Regulatory Ground** is the compliance grounding layer for AI agents in regulated
industries — starting with medical device QMS. It is NOT a QMS platform. It is the
infrastructure that makes any AI agent regulatory-aware.

**Product vision:** Ground any AI agent in regulatory compliance via the obligation
knowledge graph. Three go-to-market surfaces:

1. **MCP Server** (`@regground/mcp-server`) — The primary distribution mechanism.
   Any MCP-compatible tool (Claude Code, Cursor, Windsurf, custom agents) can call
   the knowledge graph at runtime. 11 tools: discover, explain, search, qualify,
   validate, trace. This is the #1 priority.
2. **Knowledge Graph API** — RESTful + GraphQL API for non-MCP integrations.
   Paid SaaS tier for enterprise agent platforms that need compliance grounding.
3. **Agent Builder** (future) — A web UI where QARA professionals configure
   grounded agents against the KG, export portable agent code, and build
   multi-agent process abstractions (e.g., PSUR generator, CAPA orchestrator).

**Underlying infrastructure:**

- **The Ground** — Neo4j obligation knowledge graph (303 obligations, 98 constraints,
  55 definitions, 347 evidence types across 8 regulations: EU MDR, ISO 13485,
  ISO 14971, 21 CFR 820, IMDRF, UK MDR, MDCG 2022-21). Open-source regulation
  YAMLs — community-contributed, Thinkertons-curated.
- **Guardrails** — Qualification gates (pre-execution) + compliance validation
  (post-execution) + hash-chained decision traceability.
- **The Sandbox** — Multi-tenant runtime for grounded agent processes.

The platform targets frontier models (Claude, GPT, Gemini, future AGI) via a
**capability-based** LLM abstraction — never hardcoded to one provider.

## Commands

```bash
# Monorepo
pnpm install              # install all workspaces
pnpm dev                  # run api + web concurrently
pnpm build                # build all packages
pnpm check                # typecheck all packages
pnpm test                 # run vitest in all packages
pnpm test:harness         # run agent test harnesses (sandbox)
pnpm db:push              # push Drizzle schema to Postgres
pnpm seed:graph           # seed Neo4j obligation graph from regulations/*.yaml
pnpm seed:all             # currently aliased to seed:graph (placeholder for future seeders)
pnpm lint                 # eslint
pnpm format               # prettier

# MCP Server (packages/mcp-server/)
cd packages/mcp-server
npm run build             # compile TypeScript → dist/
npm run dev               # dev mode with tsx watch
npm start                 # run compiled server (stdio by default)
node dist/index.js http   # run in HTTP mode (port 3100)
MCP_PORT=8080 node dist/index.js http  # custom port

# Single test / filtered tests
pnpm --filter @regground/core test -- --run src/agents/BaseGroundedAgent.test.ts
pnpm --filter @regground/core test -- --run -t "test name pattern"

# Type check a single package
pnpm --filter @regground/core check
```

Vitest is configured with `globals: true` and `environment: 'node'`. Test files
live in `src/**/*.test.ts` and `__tests__/**/*.test.ts`.

## Architecture

```
regulatory-ground/
├── packages/
│   ├── mcp-server/        @regground/mcp-server  ⭐ PRIMARY PRODUCT
│   │   src/
│   │     index.ts         MCP server (stdio + HTTP transports, 11 tools)
│   │     services/
│   │       graph-client.ts  Standalone Neo4j client (no monorepo dependency)
│   │
│   ├── core/              @regground/core
│   │   src/
│   │     graph/           Neo4j obligation graph (PRIMARY source of truth)
│   │     guardrails/      Qualification, compliance, strict, boundary policies
│   │     traceability/    Hash-chained decision + content traces, provenance
│   │     agents/          Sealed BaseGroundedAgent + registry + orchestrator + harness
│   │     llm/             Capability-based LLM abstraction (multi-provider)
│   │     evidence/        Atomizer, parsers, slot mapper, registry
│   │     process/         Process definitions, instances, HITL gates, validator
│   │     db/              Drizzle schema + connection (PG + Neo4j)
│   │     harness/         Test harness (mock graph, mock LLM, assertions)
│   │     skills/          In-code skill definitions consumed by agents
│   │   regulations/       YAML obligation definitions (8 regulations, 303 obligations)
│   │
│   └── sandbox/           @regground/sandbox
│       src/
│         workspace/       Multi-tenant isolation
│         processes/       capa, complaints, nonconformances, trend-reporting, change-control, audit
│         runtime/         SandboxRunner, SSE streaming, state machine
│         tasks/           Reusable task primitives composed by process definitions
│         templates/       Generators for SKILL.md / .agent.md / .instructions.md / hooks.json
│
└── apps/
    ├── api/               Express API (graph queries, trace verification, API keys)
    └── web/               React + Vite dashboard (Landing, Regulations, Traces, API Access)
```

## MCP Server

The MCP server (`packages/mcp-server/`) is the primary product surface. It exposes
11 tools via the Model Context Protocol:

- `regground_discover_obligations` — Auto-discover applicable obligations for process + jurisdiction
- `regground_get_obligation` — Look up a single obligation by ID
- `regground_explain_obligation` — Full explanation with constraints, evidence, cross-refs
- `regground_search_obligations` — Free-text search across all obligations
- `regground_get_evidence_requirements` — Evidence types needed for a process
- `regground_find_obligation_path` — Find regulatory cross-reference chain between obligations
- `regground_check_qualification` — Pre-execution gate: can this process run?
- `regground_validate_compliance` — Post-execution check: did the output comply?
- `regground_get_graph_stats` — Graph summary statistics
- `regground_list_process_types` — Available process types in the graph
- `regground_list_jurisdictions` — Available jurisdictions in the graph

**Transports:** stdio (for Claude Code / Cursor / IDE integration) and HTTP (for
cloud deployment, API gateway, programmatic access).

**Key design choice:** The MCP server has its own standalone `GraphClient` with zero
dependency on `@regground/core`. This means it can be published, deployed, and
used independently of the monorepo.

## Key conventions

- **Sealed agent lifecycle.** `BaseGroundedAgent` enforces qualify → execute →
  validate → trace. Subclasses override hooks (`execute()`, `getRequiredObligations()`,
  `getOutputSchema()`, optionally `initialize()` / `cleanup()`), never the lifecycle itself.
- **Graph-first.** Neo4j is the source of truth for obligations. Postgres holds
  an operational mirror for fast joins, but the graph wins on conflict.
- **Trace everything.** Every decision an agent makes is appended to a SHA-256
  hash chain. Chains are verifiable via `ChainVerifier`.
- **Capability-based LLM.** Code requests `LLMCapabilities` (e.g. `tool_use`,
  `long_context`, `vision`), and `CapabilityNegotiator` selects a provider.
  Never import a provider SDK from anywhere except `packages/core/src/llm/providers/`.
  Never call providers directly — all LLM calls go through `LLMAbstraction`.
- **Zod at every boundary.** All agent inputs/outputs, all API payloads, all
  YAML loads pass through Zod schemas. Never use `any`.
- **No stubs.** Every committed file must have a complete, working implementation.
- **Regulation knowledge lives in YAML → graph, never in code.** Obligation
  definitions live in `packages/core/regulations/{regulation}/` as YAML files.
- **All agent outputs go through `StrictGate`** (Zod validation) and all
  decisions are traced via `DecisionTraceService`.
- **Database access** goes through Drizzle ORM (`packages/core/src/db/schema.ts`).
- **Agent tests** use `TestHarness` (with `MockGraph`, `MockLLM`,
  `ComplianceAssertions`) from `packages/core/src/harness/`.

## Environment variables

See `.env.example`. Required to run locally:

- `DATABASE_URL` — Postgres connection string
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` — Neo4j connection
- `JWT_SECRET` — API auth signing key
- At least one of `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY`

## How to add things

### Add a new regulation

1. Create `packages/core/regulations/<reg-name>/<artifact>.yaml` following
   the YAML schema in `.github/skills/seed-regulations/references/yaml-schema.md`.
2. Run `pnpm seed:graph` to validate and load it into Neo4j.
3. Cross-reference existing obligations with `CROSS_REFERENCES` relationships.

### Add a new QMS process

1. Use the `create-process` skill (`.github/skills/create-process/SKILL.md`).
2. Create `packages/sandbox/src/processes/<process>/` with:
   - `<Name>ProcessDefinition.ts`
   - `agents/` (one file per grounded agent)
   - `harness/<process>-scenarios.yaml`
   - `obligations.yaml` (the obligation subset this process must satisfy)
3. Register the process in `ProcessRegistry`.

### Add a new grounded agent

1. Use the `create-agent` skill (`.github/skills/create-agent/SKILL.md`).
2. Extend `BaseGroundedAgent` — never bypass the sealed lifecycle.
3. Wire the agent into a process via its `agentBindings`.
4. Add scenarios to `harness/` and run `pnpm test:harness`.

## GitHub skills and agents

`.github/skills/` contains scaffold skills with `SKILL.md` files:
- `create-agent` — scaffold a new grounded agent from templates
- `create-process` — scaffold a new QMS process
- `seed-regulations` — validate and load YAML regulations
- `run-compliance-check` — run obligation coverage analysis
- `verify-trace-chain` — verify hash-chain integrity
- `export-audit-pack` — export audit documentation

`.github/agents/` has specialist agent definitions (compliance-auditor,
obligation-mapper, process-designer, regulatory-analyst, trace-investigator).

`.github/instructions/` has domain-specific coding guidance for agents, Drizzle,
Neo4j, and tracing patterns.

`.github/prompts/` has reusable prompt templates (`explain-obligation`,
`gap-analysis`, `map-evidence`).

`.github/hooks/enforcement.json` defines repo-level enforcement hooks (e.g.
blocking direct LLM SDK imports, requiring Zod boundaries).

`scripts/check-agent-ground.mjs` is a standalone audit script that verifies
every agent under `packages/sandbox/src/processes/**/agents/` is properly
grounded (extends `BaseGroundedAgent`, declares obligations, etc.).
