# Regulatory Ground

A model-agnostic, regulation-agnostic compliance enforcement platform.

- **The Ground** — Obligation knowledge graph (Neo4j) + hash-chained decision traceability + compliance guardrails.
- **The Sandbox** — Runtime where users spin up grounded agents for QMS processes (CAPA, Complaints, Trends, NCs, Change Control, Audits).
- **Agent Harnesses** — Reusable SKILL.md / .agent.md / .instructions.md / hooks templates.

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm db:push
pnpm seed:graph
pnpm dev
```

## Workspace layout

- `packages/core` — `@regground/core` — graph, guardrails, traceability, agents, LLM, evidence, process, harness
- `packages/sandbox` — `@regground/sandbox` — workspaces, processes (CAPA, Complaints, NC, Trend, Change, Audit), runtime, templates
- `apps/api` — Express API
- `apps/web` — React + Vite dashboard

See `CLAUDE.md` for full architecture and contributor guide.
