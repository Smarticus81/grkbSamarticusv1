---
name: "source-command-goal-graph-explorer"
description: "Goal G-6 — public obligation-graph explorer on the landing page (brand + community wedge)"
---

# source-command-goal-graph-explorer

Use this skill when the user asks to run the migrated source command `goal-graph-explorer`.

## Command Template

# /goal-graph-explorer — Argue About Regulation in Public

**Mandate reference:** UNICORN_MANDATE.md §G-6 and 90-day sprint item 6.
**Why:** The open obligation graph is the community wedge — a signed-out
visitor should be able to browse real obligations and feel the depth of The
Ground before ever creating an account. It is also the free tier's storefront.

## Current state to verify first

- `apps/web` already has a `/regulation-manager` page (authenticated) — read it;
  the explorer may reuse its data layer and components.
- `apps/api` has `/api/graph/*` routes behind Clerk auth. The explorer needs a
  **public, read-only** subset — check what exists and what must be added.

## Deliverables

1. **Public API subset**: read-only endpoints (e.g. `/api/public/graph/...`)
   exposing: regulation list with obligation counts, obligation browse/search
   by regulation, single-obligation detail (title, requirement summary,
   mandatory flag, evidence types, citations), and cross-references. No auth,
   but rate-limited (reuse the existing rate-limit middleware) and strictly
   read-only — no trace data, no tenant data, no usage data. Validate query
   params with Zod.
2. **Explorer page** in `apps/web`, reachable signed-out from the landing page:
   regulation picker → obligation list with free-text search → obligation
   detail panel showing cross-references as clickable links that navigate the
   lattice (the EU MDR Art. 83 → ISO 13485 §8.4 hop is the wow moment — make
   that traversal feel instant). Deep-linkable URLs per obligation, consistent
   with the existing URL-state patterns in the Workflow Studio.
3. **Conversion hooks**: a tasteful signed-out banner on the detail panel —
   "Ground your agents in this obligation" linking to the MCP quickstart and
   sign-up. One banner, not a paywall; the explorer must feel generous
   (Branson: the brand is the rebellion against gated bureaucracy).
4. **Graph fallback**: if Neo4j is unreachable, the public endpoints return a
   clear 503 with a friendly message and the page shows a degraded state —
   never a blank crash on the public storefront.

## Constraints

- Match existing web app conventions: component structure, styling, theme
  (dark/light), routing. Read neighboring pages before writing.
- Public endpoints must not leak anything tenant-scoped — review what the
  graph queries return before exposing them.

## Acceptance criteria

- `pnpm check` and existing tests pass.
- Signed-out manual walk-through: landing → explorer → search "complaint" →
  open an obligation → follow a cross-reference → deep-link URL reloads to the
  same state.
- Public endpoints verified to require no auth token and to be rate-limited.
