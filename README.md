# Regulatory Ground

A model-agnostic, regulation-agnostic compliance enforcement platform.

- **The Ground** — Obligation knowledge graph (Neo4j) + hash-chained decision traceability + compliance guardrails.
- **The Sandbox** — Runtime where users spin up grounded agents for QMS processes (CAPA, Complaints, Trends, NCs, Change Control, Audits).
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

- `packages/core` — `@regground/core` — graph, guardrails, traceability, agents, LLM, evidence, process, harness
- `packages/sandbox` — `@regground/sandbox` — workspaces, processes (CAPA, Complaints, NC, Trend, Change, Audit), runtime, templates
- `apps/api` — Express API
- `apps/web` — React + Vite dashboard

See `CLAUDE.md` for full architecture and contributor guide.
