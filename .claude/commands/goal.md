---
description: Unicorn mandate orchestrator — assess progress against UNICORN_MANDATE.md and execute (or recommend) the highest-leverage next goal
---

# /goal — Mandate Orchestrator

You are executing against `UNICORN_MANDATE.md` (repo root). That document is the
vision; this command turns it into one concrete work session.

## Arguments

`$ARGUMENTS` may be:
- empty → run a **status assessment** and recommend the next goal (do not start it)
- `next` → run the status assessment, then immediately execute the recommended goal's command
- the name of a sub-goal (`publish-mcp`, `audit-pack`, `encode-regulation <name>`, `trust-bar`, `evals-gate`, `graph-explorer`, `psur-demo`) → delegate directly to that `/goal-*` command's instructions in `.claude/commands/`

## Status assessment procedure

Check each agent-executable goal against the actual repo state — verify, don't assume:

1. **G-1 publish-mcp** — Is `packages/mcp-server` published? Check `package.json` for `"private"`, version, `publishConfig`; check for a quickstart in its README; run `npm view @regground/mcp-server version` to see if it exists on npm.
2. **G-3 audit-pack** — Does an audit-pack export exist as a product feature (API route + web surface), not just the `.github/skills/export-audit-pack` skill? Grep `apps/api/src` for audit/export routes.
3. **G-2 coverage** — List `packages/core/regulations/*/` directories. Mandate targets FDA QMSR, EU IVDR, Health Canada, TGA, PMDA, MDSAP. Report which exist.
4. **G-4 trust-bar** — Count test files in `packages/core` covering guardrails/traceability; check whether adversarial suites exist (grep tests for bypass/forge/tamper scenarios); check whether `@regground/evals` gates CI.
5. **G-6 graph-explorer** — Does the public landing page (apps/web) include an obligation-graph explorer that works signed-out?
6. **G-3b psur-demo** — Does a public, signed-out PSUR demo exist at `/demo/psur` in apps/web, backed by `/api/psur` and the real bestpsurgenerator pipeline, writing graph-grounded decision traces via `DecisionTraceService`? Check for the wouter route, the `apps/api` psur router, and whether the landing-page hero CTA points to the demo. (Requires the `bestpsurgenerator` repo alongside this one.)

## Output

Produce a short scoreboard: each goal, its state (done / partial / not started) with one line of evidence, then a single recommendation — the highest-leverage incomplete goal, with a one-sentence justification grounded in the mandate's north-star metric (verified compliant agent-runs per month).

Items in the mandate that are **human-only** (signing design partners, SOC 2 audit, pricing decisions) are out of scope for this command — list them under "Needs a human" if relevant, never attempt them.

If `$ARGUMENTS` is `next` or names a goal, proceed to execute the corresponding `.claude/commands/goal-*.md` instructions in this same session.
