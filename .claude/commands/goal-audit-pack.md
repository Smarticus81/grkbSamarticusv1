---
description: Goal G-3 — turn audit-pack export into a real product feature (API route + web download), the closing demo
---

# /goal-audit-pack — The Closing Demo

**Mandate reference:** UNICORN_MANDATE.md §G-3 and 90-day sprint item 3.
**Why:** "One-click Audit Pack export: every run's decisions, obligations,
evidence, and hash chain in a format a notified body or FDA investigator
accepts without explanation." This is the moment that closes deals.

## Current state to verify first

- A scaffold skill exists at `.github/skills/export-audit-pack/SKILL.md` — read
  it; it defines the intended pack contents.
- Trace infrastructure exists in `packages/core/src/traceability/`
  (`TraceExporter`, `ChainVerifier`, `ProvenanceRegistry`) — the export logic
  may be partially built. Read these before writing anything new.

## Deliverables

1. **Core export service** in `packages/core/src/traceability/` (extend
   `TraceExporter` if suitable): given a process-instance or run ID, assemble an
   audit pack object containing: run metadata, every decision-trace entry with
   hash chain, chain verification result (run `ChainVerifier`, include the
   verdict), obligations consulted (IDs + titles + source citations from the
   graph), evidence items referenced, agent configs used, and qualification +
   compliance validation results. Zod schema for the pack — Zod at every
   boundary, per CLAUDE.md.
2. **API route** `GET /api/traces/:runId/audit-pack` in `apps/api`, behind the
   existing Clerk auth middleware, returning the pack as JSON, with
   `?format=markdown` producing a human-readable report (regulator-facing:
   plain language, every claim cited to an obligation ID).
3. **Web surface**: a "Download Audit Pack" action wherever completed runs are
   shown in `apps/web` (sandbox results and managed-agent runs). Match the
   existing component and styling conventions — read neighboring components
   first.
4. **Tests**: unit tests for the pack assembler (valid chain, tampered chain →
   pack marks verification failed, missing run → typed error) using the
   existing `TestHarness`/`MockGraph` from `packages/core/src/harness/`.

## Constraints

- Never mutate trace data during export. The chain is sacred (Doctrine §3).
- A pack for a run with a broken hash chain must still export, prominently
  flagged as FAILED VERIFICATION — hiding failure would be falsifying audit
  evidence.
- No `any`; sealed lifecycle untouched.

## Acceptance criteria

- `pnpm --filter @regground/core test` passes including new tests.
- `pnpm check` passes across packages.
- Manual verification: run a sandbox process locally (or via harness), hit the
  new endpoint, confirm the pack contains a verifiable chain and at least one
  obligation citation per decision.
