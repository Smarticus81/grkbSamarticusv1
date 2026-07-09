# Regulatory Ground

A model-agnostic, regulation-agnostic compliance enforcement platform.

- **The MCP Server** (`@regground/mcp-server`) — The primary product. A standalone,
  publishable MCP server (12 tools) that grounds any MCP-compatible agent in the
  obligation knowledge graph at runtime.
- **The Ground** — Obligation knowledge graph (Neo4j) + hash-chained decision traceability + compliance guardrails.
- **The Sandbox** — Runtime where users spin up grounded agents for QMS processes (CAPA, Complaints, Trends, NCs, Change Control, Audits, PSUR, and more).
- **Agent Harnesses** — Reusable SKILL.md / .agent.md / .instructions.md / hooks templates.

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm db:secure
pnpm seed:graph
pnpm dev
```

`pnpm db:secure` pushes the Drizzle schema, backfills stable tenant keys for
existing tenants, and applies Postgres row-level security policies. Use it for
local setup and production database upgrades before serving multi-tenant traffic.

## Workspace layout

- `packages/mcp-server` — `@regground/mcp-server` — standalone, publishable MCP server (12 tools); the primary product surface
- `packages/core` — `@regground/core` — graph, guardrails, traceability, agents, LLM, evidence, process, config, auth, observability, harness
- `packages/evals` — `@regground/evals` — compliance regression harness (baseline-gated bench + eval suites)
- `packages/sandbox` — `@regground/sandbox` — workspaces, 10 QMS processes (CAPA, Complaints, NC, Trend, Change, Audit, adverse-event reportability, complaint classification, management review, PSUR), runtime, templates
- `apps/api` — `@regground/api` — Express API (Clerk auth; graph, traces + audit-pack export, api-keys, sandbox, builder, PSUR)
- `apps/web` — `@regground/web` — React + Vite + wouter dashboard, with a public PSUR demo at `/demo/psur`

See `CLAUDE.md` for full architecture and contributor guide.
