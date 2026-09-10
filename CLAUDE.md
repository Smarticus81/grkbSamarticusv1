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
   the knowledge graph at runtime. 12 tools: discover, explain, search, define,
   qualify, validate, trace. This is the #1 priority.
2. **Knowledge Graph API** — RESTful + GraphQL API for non-MCP integrations.
   Paid SaaS tier for enterprise agent platforms that need compliance grounding.
3. **Agent Builder** (future) — A web UI where QMS professionals configure
   grounded agents against the KG, export portable agent code, and build
   multi-agent process abstractions (e.g., PSUR generator, CAPA orchestrator).

**Underlying infrastructure:**

- **The Ground** — Neo4j obligation knowledge graph. The regulation YAML source
  currently encodes ~680 obligations, ~210 constraints, ~170 definitions, and
  850+ distinct evidence types across 7 regulations: EU MDR, ISO 13485, ISO 14971,
  21 CFR 820, IMDRF, UK MDR, MDCG 2022-21. (`regground_get_graph_stats` returns the
  live seeded totals; the seeder loads every YAML under `regulations/`.) Open-source
  regulation YAMLs — community-contributed, Thinkertons-curated.
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
pnpm test                 # node:test scripts (scripts/*.test.mjs) + vitest in all packages
pnpm test:harness         # run every process's YAML scenario suite through the agent harness
pnpm lint                 # eslint
pnpm format               # prettier

# Database
pnpm db:push              # push Drizzle schema to Postgres
pnpm db:secure            # db:push + tenant-key backfill + Postgres RLS (local setup / prod upgrades)

# Graph
pnpm seed:graph           # seed Neo4j obligation graph + processes from regulations/*.yaml
pnpm seed:all             # alias for seed:graph
pnpm embed:graph          # backfill vector embeddings for semantic search
pnpm check:graph          # graph-quality checks (scripts/check-graph-quality.mjs)

# Evals (compliance regression gating — packages/evals)
pnpm bench                # baseline-gated compliance-validation benchmark
pnpm bench:update         # rewrite the committed validation baseline
pnpm eval                 # run the eval runner
pnpm eval:all             # run all eval suites (adversarial, crosswalk, capa)

# Ops
pnpm env:doctor           # validate .env (scripts/env-doctor.mjs)
pnpm smoke:prod           # production smoke test (scripts/production-smoke.mjs)

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

## TypeScript & module setup

- **ESM throughout** — `"type": "module"` in root `package.json`. Use `import`/`export`, not `require`.
- **Target:** ES2022, **Module:** ESNext, **Module resolution:** Bundler.
- **Strict mode** with `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- **Path aliases** in `tsconfig.base.json`: `@regground/core` → `packages/core/src`,
  `@regground/sandbox` → `packages/sandbox/src`. All workspace packages extend this base config.
- **Node ≥ 20** required (`engines` field in root `package.json`).
- **pnpm 9** is the package manager (`packageManager` field). Use `pnpm` for all install/run commands.

## Deployment

Three Dockerfiles at the repo root (`Dockerfile.api`, `Dockerfile.mcp`, `Dockerfile.web`)
deploy to Railway. See `RAILWAY.md` for full setup. Key points:

- Build context is the repo root so pnpm workspace resolution works.
- Neo4j is external (Aura, `neo4j+s://` scheme). Postgres can be Railway-provisioned.
- The API binds to Railway's injected `PORT`. The MCP server uses `MCP_TRANSPORT=http`.
- Seed the graph (`pnpm seed:graph`) locally or as a one-off process against the production Neo4j.

## Architecture

```
regulatory-ground/
├── packages/
│   ├── mcp-server/        @regground/mcp-server  ⭐ PRIMARY PRODUCT (publishable, zero monorepo deps)
│   │   src/
│   │     index.ts         MCP server (stdio + HTTP transports, 12 tools)
│   │     services/
│   │       graph-client.ts  Standalone Neo4j client (no monorepo dependency)
│   │     auth/            API-key tool-scope map (enterprise HTTP mode)
│   │
│   ├── core/              @regground/core
│   │   src/
│   │     graph/           Neo4j obligation graph (PRIMARY source of truth) + seeder
│   │     guardrails/      Qualification gate + 5-validator compliance pipeline, strict/boundary policies
│   │     traceability/    Hash-chained decision + content traces, provenance
│   │     agents/          Sealed BaseGroundedAgent + registry + orchestrator + harness
│   │     llm/             Capability-based LLM abstraction (multi-provider)
│   │     evidence/        Atomizer, parsers, slot mapper, registry
│   │     process/         Process definitions, instances, HITL gates, validator
│   │     db/              Drizzle schema + connection (PG + Neo4j), RLS, tenant upgrade
│   │     auth/            Shared API-key scopes (reused by api + mcp-server)
│   │     config/          Zod env loader + YAML schema + regulation loader
│   │     observability/   OpenTelemetry tracing + metrics
│   │     skills/          Skill registry (hybrid global + tenant override)
│   │     harness/         Test harness (mock graph, mock LLM, assertions)
│   │   regulations/       YAML obligation definitions (7 regulations)
│   │
│   ├── evals/             @regground/evals — compliance regression harness
│   │   src/
│   │     runner.ts        Eval suites: obligation recall / citation accuracy / miss-rate
│   │     validation-bench.ts  Baseline-gated CompliancePipeline benchmark (MockGraph)
│   │   suites/            adversarial, crosswalk, capa
│   │   validation-cases/  golden cases per validator
│   │
│   └── sandbox/           @regground/sandbox
│       src/
│         workspace/       Multi-tenant isolation
│         processes/       capa, complaints, nonconformances, trend-reporting, change-control,
│                          audit, adverse-event-reportability, complaint-classification,
│                          management-review, psur-compilation (+ ProcessRegistry)
│         runtime/         SandboxRunner, SSE streaming, state machine
│         templates/       Generators for SKILL.md / .agent.md / .instructions.md / hooks.json
│
└── apps/
    ├── api/               @regground/api — Express API (Clerk auth, helmet, rate-limit). Routers:
    │                      graph, traces (+ audit-pack export), api-keys, sandbox, sandbox/harness, builder,
    │                      managed-agents, psur, usage, workspace, validate-draft, clerk-webhook, readiness
    └── web/               @regground/web — React + Vite + wouter. Public: LandingPage,
                           PsurDemo (/demo/psur), Contact. Signed-in /app (Clerk-gated): dashboard,
                           Sandbox, PsurBuilder, Builder, ProcessDesigner, Harness (agent scenario harness), RegulationManager,
                           TraceExplorer, ApiAccess
```

## MCP Server

The MCP server (`packages/mcp-server/`) is the primary product surface. It exposes
12 tools via the Model Context Protocol:

- `regground_discover_obligations` — Auto-discover applicable obligations for process + jurisdiction
- `regground_get_obligation` — Look up a single obligation by ID
- `regground_explain_obligation` — Full explanation with constraints, evidence, cross-refs
- `regground_search_obligations` — Free-text search across all obligations
- `regground_get_evidence_requirements` — Evidence types needed for a process
- `regground_find_obligation_path` — Find regulatory cross-reference chain between obligations
- `regground_get_definition` — Look up a regulatory definition by ID, or search definitions by term
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

## Testing, evals & CI

- **Unit/integration:** `pnpm test` runs the `node:test` scripts (`scripts/*.test.mjs`)
  plus Vitest across every package. `pnpm test:harness` runs every process's
  `harness/*.yaml` scenario suite through `HarnessRunner` (see **Key conventions**).
- **`@regground/evals`** is the compliance regression harness:
  - `pnpm bench` runs the **baseline-gated** compliance-validation benchmark against the
    five-validator `CompliancePipeline` (ClaimCoverage, EvidenceBackedCompliance,
    ConstraintEvaluator, CitationVerifier, RegulatoryContradictionDetector) on an in-memory
    `MockGraph`. Any accuracy drop vs `validation-baseline.json` fails the run;
    `pnpm bench:update` rewrites the baseline intentionally.
  - `pnpm eval` / `pnpm eval:all` run the YAML eval suites (`adversarial`, `crosswalk`,
    `capa`), scoring obligation recall, citation accuracy, and mandatory-miss rate.
- **CI** (`.github/workflows/`): `ci.yml` (lint / check / test / build on Node 20 & 22),
  `eval.yml` (baseline-gated `bench` + graph-quality + eval suites — on PRs touching
  regulations/evals/graph/guardrails and nightly), `codeql.yml`, and `container.yml`
  (builds the three Dockerfiles and pushes to GHCR).

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
  `ComplianceAssertions`) from `packages/core/src/harness/`. The graph handed to
  agents is a stable handle, so `withGraph()` / `withMockGraph()` can re-seed
  between runs without rebuilding agents; `runAgent()` reports LLM/graph timing.
- **Scenario harness (YAML).** Every process ships `harness/<process>-scenarios.yaml`.
  `HarnessRunner` (core) runs them; `packages/sandbox/src/processes/harnessSuites.ts`
  discovers them, registers every agent, seeds the mock graph from the real
  regulation catalog (`loadObligationCatalog(packages/core/regulations)`) and is the
  single code path behind `pnpm test:harness`, `POST /api/sandbox/harness/run`, and
  the web **Agent Harness** page (`/app/harness`). Scenario fields: `agent`, `input`,
  optional `context` (`processType`, `jurisdiction`, `processId`,
  `availableEvidenceTypes` — pass `[]` to force a BLOCKED gate), `mockObligations`
  (defaults to the agent's declared obligations), `mockLLM`, `mockEvidence`, and
  `assertions` (`success`, `qualificationStatus`, `traceChainValid`,
  `obligationsCovered`, `noComplianceGaps`, `complianceScoreAbove`,
  `confidenceAbove`, `llmCalls`, `hasEvents`, `noEvents`, `output` deep-subset match,
  `errorMatches`). File-level `defaults` apply to every scenario. Every scenario is
  isolated (graph re-seeded, canned LLM responses replaced, traces cleared) and all
  failed assertions are reported together.

## Environment variables

See `.env.example` (run `pnpm env:doctor` to validate). Key variables:

- `DATABASE_URL` — Postgres connection string
- `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE` — Neo4j connection
- `JWT_SECRET` (+ `JWT_SECRET_PREVIOUS` for rotation) — API auth signing key
- `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` —
  Clerk B2B auth; Clerk Organizations map to `tenant_id`, and both the web app and `/api` gate on Clerk
- `ALLOWED_ORIGINS` — CORS allow-list (required in production)
- `PSUR_SERVICE_URL` — live PSUR generation service (the signed-out `/demo/psur` runs a
  client-side simulation and does not need it)
- `MCP_TRANSPORT` (`stdio` | `http`), `MCP_PORT` (default 3100) — MCP server transport
- At least one of `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` for live agent/PSUR runs

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
