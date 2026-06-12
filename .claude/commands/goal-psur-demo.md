---
description: Goal G-3b — ship the public PSUR demo; bestpsurgenerator as an interactive streaming web app with editable mock data, graph-grounded decision traces, featured on the landing page
---

# /goal-psur-demo — Data → Draft in 20 Minutes (The Keynote Demo)

**Mandate reference:** UNICORN_MANDATE.md §G-3 — "A quality manager goes from
signup → first verified PSUR section → exported audit pack in **one session**.
That demo closes every deal; polish it like the original iPhone keynote." Also
§G-6 (brand) and Doctrine §3 (the trace is sacred).

**Why:** A PSUR historically takes a minimum of 2 weeks to assemble. This demo
shows the full journey — realistic mock data in, real LLM runtime, real
regulator-grade output — producing a human-review-ready draft in under
20 minutes: a **99% reduction in Data → Draft time**. The downloadable PSUR is
the proof of capability; the **hash-chained decision trace, grounded in the
obligation graph, is the product**. Every decision, calculation, and answer in
the run cites a reason and, where applicable, a regulation or standard.

## Two repositories

This goal spans two repos that must be checked out side by side:

- `bestpsurgenerator` — the Python PSUR pipeline (`psur-generator/`). Read its
  CLAUDE.md first. Branch per session instructions.
- `grkbSamarticusv1` (this repo) — web, API, traceability, obligation graph.

If a session has only one checked out, get the other added before starting.

## The demo script (what done looks like)

A signed-out visitor clicks the hero CTA on the landing page and lands in a
tutorial walkthrough where **only the active step is on screen**:

1. **Intro** — the 2-weeks-to-20-minutes story, what a PSUR is, what they are
   about to watch happen.
2. **Inputs** — the mock data pack, one input type at a time. Content is
   editable; **structure is locked** (columns/fields cannot be added, removed,
   or renamed). Edits flow into the run.
3. **Run** — real LLM-powered generation, streamed live: pipeline phases,
   13 section agents (A–M), audit-remediation loop, validation — plus a live
   decision ticker showing each traced decision as it is appended to the chain.
4. **Results** — downloadable PSUR (or PMSR, per device classification) as
   DOCX + JSON, and the hero artifact: the **decision trace** with a
   chain-verification badge and one-click Audit Pack export.

## Current state to verify first (don't assume — re-check)

**bestpsurgenerator** (`psur-generator/`):
- CLI-only (typer, `main.py`); no web server exists anywhere in the repo.
- `agents/orchestrator.py` → `generate_psur(device_context, statistics,
  parsed_data, checkpoint_path, resume_data)` is the programmatic entry; runs
  13 sections **sequentially** with Rich console progress only — **no
  programmatic event hooks exist yet**. Checkpoint/resume exists.
- Pipeline already emits structured artifacts: `*_statistics.json`
  (PSURStatistics — deterministic pre-computed metrics), `*_traceability.json`
  (sentence-level source matrix), the PSUR JSON, and the 331-point validation
  result. These are raw material for trace events, not a substitute for them.
- Mock inputs already in `data/input/` (sales, complaints, CAPA, FSCA,
  device_context, RACT, PMS plan, previous PSUR, clinical safety/performance,
  external events, coding dictionary). Column structure is specified in
  `data/templates/INPUT_README.md` + per-type template files.

**grkbSamarticusv1:**
- Landing page `apps/web/src/pages/LandingPage.tsx` — `PRODUCTS` array already
  lists "PSUR Compiler" (CTA `/app`). Routing is **wouter** in
  `apps/web/src/App.tsx`.
- SSE pattern to copy: `GET /api/sandbox/runs/:runId/stream` in
  `apps/api/src/routes/sandbox.ts`; client side `streamSse()` in
  `apps/web/src/auth/useApi.ts`.
- `packages/core/src/traceability/DecisionTraceService.ts` —
  `startTrace()` / `logEvent()` append to the SHA-256 hash chain;
  `ChainVerifier` verifies; `TraceExporter.toAuditPack()` exports.
- `packages/core/src/graph/ObligationGraph.ts` + `GraphQuerier` — obligation
  lookup/search (EU MDR, UK MDR, MDCG 2022-21 are all seeded).
- A toy `psur-compilation` sandbox process exists
  (`packages/sandbox/src/processes/psur-compilation/`). **Leave it untouched**
  — this demo drives the real Python pipeline, not that process.

## Architecture (decided — do not relitigate)

```
apps/web /demo/psur  ──HTTP/SSE──▶  apps/api /api/psur  ──HTTP/SSE──▶  Python service
(public walkthrough)               (bridge + trace writer)            (FastAPI wrapping the
                                        │                              real pipeline)
                                        ▼
                          DecisionTraceService (hash chain, Postgres)
                          ObligationGraph (citation → obligation ID)
```

- The Python pipeline gets a thin **FastAPI service** layer and an internal
  **event emitter**; the pipeline itself stays the source of truth for all
  numbers and prose (deterministic-first statistics is non-negotiable).
- The grkb API is the **only** writer of trace entries. As decision events
  stream in from the Python service, it appends them to the chain in arrival
  order — the same `DecisionTraceService` chain used everywhere else, viewable
  in the existing Traces UI and exportable via the audit-pack path.
- The demo route is **public** (signed-out, like the graph explorer), running
  under a dedicated demo tenant with server-side LLM keys and hard rate
  limits. Real runtime, real cost — guard it.

## Deliverables

### A. Python side (bestpsurgenerator)

1. **De-brand the pipeline (prerequisite).** The repo currently bundles a
   proprietary third-party form as its DOCX template
   (`psur-generator/constraints/*_template.docx`, cloned by
   `rendering/renderer.py`) and its form identifier appears throughout the
   codebase (code, prompts, constraints JSON, skills, docs — grep for the
   identifier in that template's filename). Remove it entirely: author a
   neutral, in-house DOCX template aligned to MDCG 2022-21's PSUR content
   requirements (same section A–M structure and tables, original layout and
   styling), update `template_schema.json` / `section_guidance.json` /
   validation / rendering accordingly, and purge the proprietary identifier
   from every file, output filename, and document-control block. No
   third-party proprietary form identifiers may appear anywhere in either
   repo, in generated outputs, or in the demo UI.
2. **Event emitter** (`psur-generator/events.py`): a `ProgressEmitter` the
   pipeline calls at every phase boundary, per-section start/complete, and at
   every **decision point**. Two event classes:
   - `progress` — phase/section lifecycle for the UI stepper.
   - `decision` — `{decision, inputs_summary, output, reason,
     regulatory_basis: [citations], confidence?}`. Instrument at minimum:
     denominator selection (single-use vs reusable), PSUR-vs-PMSR cadence by
     device class (UK MDR 44ZL/44ZM), UK MDR activation on UK sales detection,
     each IMDRF auto-coding assignment (Annex A + F), each RACT occurrence-code
     assignment (O1–O5) with the rate comparison that produced it, UCL /
     Western Electric trend verdicts, audit-remediation findings and fixes,
     and the final 331-point validation outcome. Every `decision` event must
     carry a human-readable `reason`; cite `regulatory_basis` wherever a reg
     or standard genuinely drives the decision (e.g. "MDCG 2022-21 §3.4",
     "UK MDR 2024 Reg 44ZM(6)", "EU MDR Art. 86(1)") — never invent citations.
   - Wire the emitter through `main.py`'s generate flow and
     `agents/orchestrator.py` as an optional parameter; the CLI keeps working
     unchanged with a no-op emitter.
3. **FastAPI service** (`psur-generator/server/`):
   - `POST /runs` — accepts the full mock-input payload (all input types),
     validates **content freely but structure strictly** against the template
     specs in `data/templates/` (exact column/field sets per
     `INPUT_README.md`; added/removed/renamed columns or type violations →
     422 with a precise message). Pydantic models per input type.
   - `GET /runs/{id}/events` — SSE stream of emitter events (run the sync
     pipeline on a worker thread; queue events; replay-from-start on
     reconnect, mirroring the checkpoint design).
   - `GET /runs/{id}/artifacts` + `GET /runs/{id}/artifacts/{name}` — the
     PSUR/PMSR DOCX, PSUR JSON, statistics JSON, traceability JSON,
     validation report.
   - One concurrent run per process by default; `MAX_CONCURRENT_RUNS` env.
4. **Mock data pack audit**: verify the bundled inputs exercise **every**
   MDCG 2022-21 PSUR section A–M and the UK MDR path. Known gap to
   check: Section J needs a **literature search results** input — add a
   template + mock file if missing. Mock data must include serious incidents
   (Section D), FSCA (H), trend signal that actually trips a Western Electric
   rule (G), UK sales rows (UK MDR activation), and at least one uncoded
   complaint (to demo IMDRF auto-coding). Update `INPUT_README.md` for
   anything added.
5. **Tests**: introduce `pytest` (none exists) minimally — emitter ordering,
   structural-validation accept/reject cases, and an end-to-end run against
   the mock pack with a stubbed LLM client asserting the decision-event set.

### B. grkb side (this repo)

6. **API bridge** (`apps/api/src/routes/psur.ts`, mounted at `/api/psur`):
   - `POST /api/psur/runs` — creates a `processInstanceId`, calls
     `DecisionTraceService.startTrace()` under the demo tenant, forwards
     inputs to the Python service (`PSUR_SERVICE_URL` env).
   - `GET /api/psur/runs/:id/stream` — relays the Python SSE stream to the
     browser **and**, for each `decision` event, appends a trace entry via
     `logEvent()` with `regulatoryContext` resolved to graph obligation IDs.
   - Citation resolution: a checked-in mapping (`apps/api/src/psur/
     obligation-map.ts` or YAML) from citation strings the emitter produces →
     obligation IDs, validated against the graph at startup; unmapped
     citations fall back to `ObligationGraph` search, and if still unresolved
     are logged in the entry as `unresolved_citation` — **never guess an
     obligation ID**.
   - `GET /api/psur/runs/:id/artifacts*` — proxy downloads.
   - Trace retrieval, verification, and audit-pack export reuse the existing
     `/api/traces` surface — do not build a parallel trace API.
   - **Demo guard**: public (no Clerk) but rate-limited — per-IP daily run
     cap + global concurrency cap; clear "demo is busy" SSE event when
     saturated. Zod on every payload.
7. **Walkthrough UI** (`apps/web/src/pages/PsurDemo.tsx` + components, wouter
   route `/demo/psur`, public): the four-step tutorial above. One active step
   on screen; a slim progress rail shows where you are. Inputs step renders
   each input type as an editable grid/form generated **from the structure
   spec** (cells editable; columns immutable; reset-to-default per input).
   Run step: phase stepper, per-section A–M progress, and the live decision
   ticker (decision + reason + citation chips). Results step: download
   buttons (DOCX/JSON), validation summary, decision-trace viewer with
   hash-chain verification badge (calls the existing verify endpoint) and
   Audit Pack export. Match existing component and styling conventions —
   read neighboring pages first.
8. **Landing page**: make the demo the main feature — the hero's primary CTA
   points to `/demo/psur` ("Watch a PSUR draft itself in 20 minutes"), and
   the existing PSUR Compiler product card's CTA goes to the demo, with the
   2-weeks→20-minutes / 99% claim and the decision-trace differentiator in
   its copy.
9. **Deployment**: `Dockerfile.psur` in bestpsurgenerator (or repo root here
   if the Railway context demands it — follow RAILWAY.md conventions), new
   `PSUR_SERVICE_URL` + demo-tenant envs documented in `.env.example` and
   RAILWAY.md.
10. **Tests**: route tests for the bridge (run create, SSE relay with a mocked
   Python service, citation resolution incl. the unresolved path, rate-limit
   rejection); a trace test asserting a completed demo run's chain passes
   `ChainVerifier` and ≥1 obligation citation exists per regulatory decision
   entry.

## Constraints

- **The trace is sacred.** Entries are appended live as events arrive, in
  order, never back-filled, never mutated, never synthesized after the fact.
  A failed run still keeps its partial chain.
- **Deterministic numbers.** The demo must not weaken the
  statistics-first/fabrication-check design; agents consume pre-computed
  stats verbatim, as today.
- **Editable content, locked structure** — enforced in the UI *and*
  re-validated server-side in both the bridge and the Python service.
- **Real runtime, guarded cost.** LLM keys live server-side only. Rate limits
  are not optional. Never proxy arbitrary user files — demo accepts only the
  structured mock-input payload.
- **No proprietary third-party form branding.** The rendered output, schema,
  prompts, code, docs, and UI use only the neutral in-house template from
  deliverable 1; the removed form identifier must not reappear anywhere.
- **No stubs; Zod (TS) / Pydantic (Python) at every boundary; no `any`.**
- Sealed lifecycle and the existing sandbox processes remain untouched.

## Acceptance criteria

- From a clean checkout: Python service up, `pnpm dev` up, visit `/demo/psur`
  signed-out, run with default mock data → completes in **< 20 minutes**,
  yields a downloadable DOCX + JSON that passes the 331-point validator, and
  a decision trace whose chain passes `ChainVerifier`, with every
  regulatory decision citing ≥1 resolved obligation ID.
- Editing mock content (e.g., raise a complaint count) demonstrably changes
  the output and the traced calculations; attempting a structural edit is
  rejected with a precise, human-readable error at both layers.
- Switching the mock device to Class I flips the run to the PMSR path
  (UK MDR 44ZL) and the trace records that cadence decision with its citation.
- `pnpm check` and `pnpm test` pass; `pytest` passes in bestpsurgenerator;
  the original CLI (`python main.py generate ...`) still works unchanged.
- A case-insensitive grep across both repos (and a generated output set) for
  the removed proprietary form identifier returns zero hits.
- The landing page hero links to the demo and the claim copy is live.
