---
description: Goal G-4 — adversarial test suite for guardrails and traceability (agents that try to cheat must fail)
---

# /goal-trust-bar — Earn the Right to Be Trusted

**Mandate reference:** UNICORN_MANDATE.md §G-4 and 90-day sprint item 5.
**Why:** "We sell trust; we must be over-engineered on it." The guardrails and
traceability subsystems must survive adversarial attack, not just happy-path
tests. Current state: only 3 unit test suites exist — this is the biggest gap
between the product's promise and its proof.

## Scope

Add adversarial tests under `packages/core/__tests__/` (or `src/**/*.test.ts`
following existing placement), using the existing `TestHarness`, `MockGraph`,
`MockLLM`, and assertion helpers from `packages/core/src/harness/`. Read the
harness and the existing three test suites first to match their idioms.

## Attack scenarios to implement (each is a test that must FAIL the attacker)

**Lifecycle bypass (BaseGroundedAgent):**
- A subclass that overrides lifecycle methods (not just hooks) — sealed
  lifecycle must prevent or neutralize it.
- An agent whose `execute()` runs without qualification having passed —
  must be impossible to reach.
- An agent that returns output bypassing `StrictGate` — must be rejected.

**Trace forgery (ChainVerifier / DecisionTraceService):**
- Tamper with a middle entry's payload after chaining → `ChainVerifier` must
  report the break at the right index.
- Reorder two entries → verification fails.
- Delete an entry → verification fails.
- Recompute hashes after tampering (a "smart" forger) → fails because the
  chain root/prior anchor no longer matches.

**Validation evasion (CompliancePipeline validators):**
- Output with claims citing obligations that don't exist in the graph →
  CitationValidator rejects.
- Claims with no evidence backing → EvidenceBacked validator rejects.
- Output that satisfies one obligation while contradicting another →
  RegulatoryContradiction validator flags it.
- An empty/trivial output that technically violates nothing → ClaimCoverage
  must catch under-coverage of required obligations.

**Qualification gate:**
- Missing mandatory evidence type → gate blocks.
- Evidence of the wrong type mapped into a slot → gate or SlotMapper blocks.

For any scenario the current code does NOT defend against: write the test,
mark it as the failing reproduction, then fix the production code so it
passes — that is the point of the exercise. Never weaken a test to make it
pass. If a fix requires an architectural decision (e.g., the lifecycle is not
actually sealable in TS without a pattern change), implement the strongest
defense available and flag the residual risk clearly in the report.

## Acceptance criteria

- All new adversarial tests pass; `pnpm --filter @regground/core test` is green.
- `pnpm check` passes.
- Report: scenarios tested, vulnerabilities found and fixed, residual risks.
  This report is a security artifact — be precise and unhedged.
