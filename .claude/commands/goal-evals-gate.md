---
description: Goal G-4b — turn @regground/evals into a regression-gated benchmark so no release ships if compliance accuracy drops
---

# /goal-evals-gate — No Regressions on Trust

**Mandate reference:** UNICORN_MANDATE.md §G-4: "`@regground/evals` becomes a
regression-gated benchmark: no release ships if compliance-validation accuracy
drops."

## Current state to verify first

`packages/evals/` exists but is scaffolding. Read whatever is there, plus the
harness (`packages/core/src/harness/`) and the sandbox scenario YAMLs
(`packages/sandbox/src/processes/*/harness/`) — the eval cases should build on
these, not duplicate them.

## Deliverables

1. **Eval case format**: a Zod-validated YAML/JSON case format with: input
   (process type, jurisdiction, evidence set, agent output to validate),
   expected verdict (qualified yes/no, compliance pass/fail, which validators
   should fire), and a stable case ID. Cases must be deterministic — use
   `MockLLM`/`MockGraph` so evals never depend on a live LLM or Neo4j.
2. **Golden case set**: seed at least 25 cases covering the five compliance
   validators (claim coverage, evidence-backed, constraint, citation,
   contradiction) and the qualification gate — both passing and failing
   examples for each, drawn from realistic QMS content (CAPA, complaints,
   PSUR). Derive from existing sandbox scenarios where possible.
3. **Runner + scoring**: an evals runner that executes all cases, computes
   per-validator precision/recall and an overall accuracy score, and writes a
   JSON results artifact. Exit code non-zero if any score falls below the
   committed baseline.
4. **Baseline file** checked into the repo (e.g. `packages/evals/baseline.json`)
   with current scores; the runner compares against it. Improving scores
   updates the baseline via an explicit `--update-baseline` flag, never
   silently.
5. **CI wiring**: add the evals run to the repo's CI workflow if one exists
   under `.github/workflows/` (check first); otherwise add a root
   `pnpm evals` script and document in the package README that it must gate
   releases.

## Acceptance criteria

- `pnpm --filter @regground/evals test` and the evals run itself both pass.
- Deliberately corrupting one expected verdict makes the runner exit non-zero
  (verify this, then revert).
- `pnpm check` passes; no live-service dependencies in the eval path.
- Report: case count per validator, baseline scores, and where the gate runs.
