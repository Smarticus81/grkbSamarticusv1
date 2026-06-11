# THE UNICORN MANDATE
## Regulatory Ground — State of the Application & the Path to $1B

> *"If you were Elon Musk, Richard Branson, Boris Cherny, Steve Jobs, Wayne
> Huizenga, and Marc Lore, and you were challenged to make this application
> the next unicorn — what would you say it is, what would you say it must
> become, and how would you get there?"*

**Document status:** Founding mandate — June 2026
**Audience:** Founders, early team, investors, and every agent (human or AI) that touches this codebase.

---

## 0. The One-Sentence Thesis

**Regulatory Ground is the compliance grounding layer for AI agents in regulated
industries — the infrastructure that makes any AI agent provably
regulatory-aware, starting with the $600B medical device industry.**

It is not a QMS platform. It is not a document tool. It is the **trust layer**
that every AI agent operating in a regulated industry will be required to stand
on — the same way every payment flow stands on Stripe and every identity flow
stands on Auth0.

When an FDA investigator, a notified body auditor, or a general counsel asks
*"how do you know your AI did the compliant thing?"* — Regulatory Ground is the
answer. A hash-chained, graph-grounded, independently verifiable answer.

---

## 1. Why This Is a Unicorn (The Panel's Verdict)

### The Musk lens — first principles, not analogy
Strip the problem to physics. Regulated industries run on **obligations**:
discrete, citable, machine-checkable requirements. Today those obligations live
in PDFs and in the heads of consultants billed at $400/hour. AI agents are about
to do the *work* of regulated industries, but no frontier model can prove it
followed 21 CFR 820 §100. The first-principles insight: **obligations are a
graph, not a document** — and whoever owns the canonical, queryable,
runtime-callable obligation graph owns the choke point between AI labor and
regulated work. That choke point compounds: every regulation added makes the
graph harder to replicate, the way every Supercharger made Tesla harder to
catch. The cost asymmetry is absurd — encoding a regulation once (weeks) versus
every company in the industry re-interpreting it forever (decades of consultant
hours). Collapse that asymmetry and capture a fraction of it.

### The Jobs lens — the product is the *experience of trust*
Nobody wants a knowledge graph. They want to **ship their device, close their
CAPA, and sleep before the audit.** The product is the moment a quality manager
watches an agent compile a PSUR in nine minutes — with every claim traced to an
obligation and every obligation traced to the regulation text — and realizes the
audit *defends itself*. Everything in the UI exists to manufacture that moment:
the Workflow Studio, the one-click Managed Agent deploy, the trace viewer.
Ruthless focus: we do not build chat toys, dashboards for their own sake, or a
47-feature QMS suite. We build the shortest path from "regulatory anxiety" to
"verifiable proof." Say no to everything else.

### The Cherny lens — developers are the distribution channel
The strategic masterstroke already in the codebase: **the MCP server is the
primary product.** Claude Code, Cursor, Windsurf, and every custom agent
framework can call `regground_check_qualification` before acting and
`regground_validate_compliance` after. Compliance grounding becomes a
*capability you install*, not a platform you migrate to. This is the Claude
Code playbook: meet builders where they already work, make the tool feel
inevitable in the first five minutes, and let bottom-up adoption pull
enterprise contracts behind it. The free tier of the MCP server is the growth
engine; the graph behind it is the paywall.

### The Branson lens — brand the rebellion
The incumbent experience is misery: $200K GRC suites, 18-month implementations,
consultants who bill to tell you what Annex III says. Regulatory Ground is the
**Virgin Atlantic of compliance** — the challenger that makes the incumbents
look like the bureaucracy they sell. The brand promise: *compliance that moves
at the speed of your agents.* Open-source regulation YAMLs are the
community-building act — the Thinkertons-curated commons that turns customers
into contributors and contributors into evangelists.

### The Huizenga lens — roll up the fragmentation
Wayne built three Fortune 500 companies by consolidating fragmented,
unglamorous service industries (waste, video, cars). Compliance knowledge is
exactly that: fragmented across 8 (soon 80) regulations, thousands of
consultancies, and millions of SOPs. The roll-up here is **knowledge, not
companies**: every regulation encoded into The Ground is a small consultancy's
crown jewels absorbed into infrastructure. Repeat the playbook vertical by
vertical — medical devices, then pharma (GxP), then finance (SR 11-7, DORA),
then aviation (DO-178C). Same graph engine, same guardrails, same trace chain.
Each vertical is a Blockbuster-sized market consolidated into one queryable
asset.

### The Lore lens — win on the economics of the transaction
Marc Lore wins by re-architecting unit economics until the incumbent model is
structurally unprofitable by comparison. A PSUR costs $30K–$80K in consultant
fees and 6–10 weeks. A grounded agent run costs dollars of inference and
minutes of wall clock, **plus a verifiable trace the consultant can't produce
at any price.** Price per-outcome (per qualified run, per validated artifact),
not per-seat — align revenue with the value moment, make adoption a no-brainer
at the line-item level where a quality director can expense it without a
procurement cycle. Then expand to the platform contract once five processes run
through us.

**Unanimous verdict: this is a unicorn if — and only if — it becomes the
*default* grounding layer before a hyperscaler or GRC incumbent bolts on a
shallow imitation. Speed of graph coverage and developer adoption is the whole
game.**

---

## 2. State of the Application — What Is Actually Built (June 2026)

This section is the audited baseline. Everything below exists in the repository
today, deployed on Railway, written in strict TypeScript (ES2022, ESM, Zod at
every boundary, no stubs policy).

### 2.1 The Ground — the obligation knowledge graph (the moat)

- **Neo4j graph** seeded from open-source YAML: **303 obligations, 98
  constraints, 55 definitions, 347 evidence types** across **7 regulations,
  47 YAML files**:
  - EU MDR (21 files — classification, conformity, clinical evaluation,
    technical documentation, labeling, PMS, vigilance, PSUR, market
    surveillance, certificates, annexes)
  - ISO 13485 (11 files — CAPA, complaints, nonconformances, change control,
    audit, management review, design controls, purchasing, production,
    document control, monitoring)
  - 21 CFR 820 (7 files), ISO 14971 (4 files), IMDRF adverse-event coding (2),
    MDCG 2022-21 PSUR guidance (1), UK MDR (1)
- Obligations carry mandatory flags, evidence types, source citations, and
  `CROSS_REFERENCES` relationships between regulations — the graph answers
  *"what does EU MDR Art. 83 require, what evidence proves it, and what is the
  ISO 13485 equivalent"* in one query.
- Seeding, embedding, and coverage CLIs exist (`pnpm seed:graph`); regulation
  knowledge lives **only** in YAML → graph, never in code.

### 2.2 The MCP Server — the primary product surface (`@regground/mcp-server`)

- **12 tools** registered and shipping: discover, get, explain, search
  obligations; evidence requirements; obligation path-finding; **pre-execution
  qualification gate**; **post-execution compliance validation** (scored 0–1);
  graph stats; process-type and jurisdiction discovery; definition lookup.
- **Two transports:** stdio (Claude Code / Cursor / IDE-native) and HTTP
  (StreamableHTTP via Express, Railway-deployed).
- **Enterprise-grade HTTP tier already built:** JWT + API-key auth, per-key
  rate limiting, tool-scoped permissions, usage logging to Postgres.
- **Zero monorepo dependency** — standalone `GraphClient`, independently
  publishable and deployable. This is deliberate: the distribution mechanism
  must never be coupled to the platform.

### 2.3 Guardrails & Traceability — the trust engine

- **Qualification gates** (pre-execution: *may this process run?*) and a
  **compliance pipeline** (post-execution) with five validators: claim
  coverage, evidence-backed claims, constraint satisfaction, citation
  integrity, regulatory contradiction detection.
- **StrictGate** Zod validation on every agent output; **BoundaryPolicy** for
  scope enforcement.
- **SHA-256 hash-chained decision and content traces** with `ChainVerifier`,
  `ProvenanceRegistry`, and `TraceExporter` — every agent decision is appended
  to an independently verifiable chain. This is the artifact an auditor signs
  off on.

### 2.4 The Agent Runtime — sealed, grounded, orchestrated

- **Sealed lifecycle** (`BaseGroundedAgent`): qualify → execute → validate →
  trace. Subclasses override hooks, never the lifecycle. A grounded agent
  *cannot* skip its compliance checks by construction.
- `DynamicGroundedAgent`, `AgentRegistry`, `AgentOrchestrator`,
  `PromptComposer`, `AgentMetrics`, config and skill stores — 13 modules.
- **Capability-based LLM abstraction** (12 modules): code requests
  capabilities (`tool_use`, `long_context`, `vision`), `CapabilityNegotiator`
  selects the provider, `FallbackChain` handles degradation. Frontier-model
  agnostic by design — Claude, GPT, Gemini, and whatever comes next.
- **Evidence pipeline:** atomizer, slot mapper, registry, and four parsers
  (JSON, CSV, Excel, PDF) — raw quality records become typed evidence atoms.
- **Test harness:** `TestHarness` + `MockGraph` + `MockLLM` +
  compliance/trace assertions; scenario YAMLs per process;
  `pnpm test:harness`.

### 2.5 The Sandbox — 10 working QMS processes

Multi-tenant runtime (`SandboxRunner`, SSE streaming, state machine, HITL
gates) executing ten grounded processes end-to-end:

1. **CAPA** (root cause, action plan, effectiveness, closure)
2. **Complaints** (intake, triage, investigation, trend detection)
3. **Nonconformances** (classification, investigation, disposition)
4. **Trend Reporting** (statistics + narrative)
5. **Change Control** (impact analysis, verification)
6. **Internal Audit** (planning, findings, reporting)
7. **Adverse Event Reportability** (decision agent)
8. **Complaint Classification** (IMDRF coding)
9. **Management Review** (inputs aggregation, decisions)
10. **PSUR Compilation** (structure + content)

Each ships with a `ProcessDefinition`, task agents, an obligation subset YAML,
and harness scenarios. Plus template generators for SKILL.md / .agent.md /
hooks.json — grounded agents are exportable as portable artifacts.

### 2.6 The Web App — Workflow Studio & Managed Agents

React + Vite SPA with Clerk auth, eight routes:

- **Command Center** (`/app`) — operational home
- **Workflow Studio** (`/app/designer`) — low-code workflow designer with a
  template rail, save/load, draft persistence, and deep-linkable URL state
- **Managed Agents** (`/app/builder`) — configure a grounded agent, attach
  data slots, and **deploy to Claude Managed Agents** (Anthropic's cloud
  runtime) as the saved-agent runtime; start runs and stream results live via
  SSE
- **Agent Builds / Sandbox** (`/app/sandbox`) — execute QMS processes with
  LLM-default execution and auto-context
- **Regulation Manager**, **API Access**, public **Landing** and **Pricing**

The last six commits are all Workflow Studio + Managed Agents lifecycle work —
the Agent Builder pillar of the vision is no longer "future"; it is live.

### 2.7 The API — Express, production-hardened

Authenticated REST surface (Clerk JWT, Helmet CSP, CORS, rate limiting,
request/trace ID injection): graph queries, trace retrieval and verification,
API-key CRUD, sandbox execution and draft validation, the full builder surface
(agents, processes, workflows, attach/launch/deploy/runs/stream), usage
telemetry, and Clerk webhook for organization sync.

### 2.8 Deployment — live, repeatable, documented

- Three multi-stage Dockerfiles (api, mcp, web) on **Railway**, documented in
  RAILWAY.md with config-as-code (`railway.json` per service).
- Neo4j Aura (external), Postgres (Railway), Redis and OpenTelemetry wired in
  `.env.example`.
- An `@regground/evals` package scaffolded for systematic agent evaluation.

### 2.9 Honest gaps (the panel does not tolerate self-deception)

- **Test depth:** 3 unit test suites + harness scenarios. The trust layer must
  be the most-tested code any customer has ever seen. (See Goal G-4.)
- **One vertical, 7 regulations.** The moat is real but shallow — coverage
  velocity is existential.
- **No published npm package yet** for the MCP server; no public usage
  metrics, no design partners formally signed.
- **GraphQL API tier** (vision surface #2) not yet built; REST only.
- **Evals package** is scaffolding, not yet a regression-gated benchmark.

---

## 3. The Goal State — What "Unicorn" Concretely Means

A $1B valuation is an output. These are the inputs the panel commits to.

### North Star Metric
**Verified compliant agent-runs per month** — the number of agent executions
that pass qualification, complete, pass validation, and append to a verifiable
trace chain. Everything we build must move this number. (Lore: "pick the metric
that *is* the transaction, then price it.")

### G-1 — Become the default grounding layer for AI devtools (Cherny)
- `@regground/mcp-server` published to npm; installable in Claude Code, Cursor,
  and Windsurf in **under 5 minutes** with a free graph tier.
- **Target:** 10,000 monthly-active MCP installations; the phrase "ground it in
  regground" appears in other people's agent repos.
- The MCP server stays standalone, free at the discovery tier, and ruthlessly
  reliable — it is the funnel, not the margin.

### G-2 — Own the obligation graph for regulated industry (Musk / Huizenga)
- **Phase 1 (12 months):** Complete medical device coverage — FDA QMSR (the
  2026 ISO 13485 harmonization), EU IVDR, Health Canada, TGA, PMDA, MDSAP.
  ~30 regulations, 2,000+ obligations, full cross-reference lattice.
- **Phase 2 (24 months):** Second vertical (pharma GxP or financial model risk —
  decided by design-partner pull, not opinion). The graph engine, guardrails,
  and trace chain port unchanged; only YAML is new. That is the roll-up.
- Open-source YAML commons with Thinkertons curation: contributors add
  regulations, we certify them. Community velocity becomes moat velocity.

### G-3 — Make the trace the product an auditor accepts (Jobs)
- One-click **Audit Pack export**: every run's decisions, obligations,
  evidence, and hash chain in a format a notified body or FDA investigator
  accepts without explanation.
- A quality manager goes from signup → first verified PSUR section → exported
  audit pack in **one session**. That demo closes every deal; polish it like
  the original iPhone keynote.
- **Target:** the first regulatory submission that cites a Regulatory Ground
  trace chain as evidence of process control. That event is the category's
  Netscape moment — engineer it deliberately with a design partner.

### G-4 — Earn the right to be trusted (non-negotiable engineering bar)
- The guardrails and traceability subsystems reach **>95% test coverage** with
  adversarial suites (agents that *try* to bypass qualification, forge traces,
  smuggle ungrounded claims).
- `@regground/evals` becomes a regression-gated benchmark: no release ships if
  compliance-validation accuracy drops.
- SOC 2 Type II within 12 months; the multi-tenant Sandbox isolation gets an
  external penetration test. We sell trust; we must be over-engineered on it.

### G-5 — Revenue architecture (Lore / Branson)
- **Free:** MCP discovery tools against the public graph (growth engine).
- **Pro (per-outcome):** qualification gates, compliance validation, trace
  chains — priced per verified run. A line-item a quality director expenses.
- **Enterprise (platform):** multi-tenant Sandbox, Managed Agents deployment,
  SSO, private regulation overlays (a customer's own SOPs encoded into their
  private subgraph — the stickiest feature imaginable), usage analytics, SLAs.
- **Targets:** 5 paying design partners in 6 months → $1M ARR in 12 →
  $10M ARR in 30 with >130% net revenue retention (the private-overlay
  expansion engine).

### G-6 — The brand (Branson)
- Position against the misery: *"Your agents move at machine speed. Your
  compliance should too."*
- The open YAML commons, public obligation-graph explorer, and a published
  grounded-agent benchmark make Regulatory Ground the place the industry
  *argues about regulation in public* — the community owns the category
  conversation, and we own the community.

---

## 4. Execution Doctrine — How This Team Operates

1. **The graph is the moat; coverage velocity is the strategy.** Every week,
   more obligations, more cross-references, more jurisdictions. (Musk: the
   factory is the product.)
2. **MCP-first distribution.** If a feature doesn't make the 5-minute install
   more magical or the graph more valuable, question it. (Cherny)
3. **The trace is sacred.** No agent output exists without a chain entry. No
   chain entry is ever mutable. This is the product's soul. (Jobs)
4. **Per-outcome pricing, land small, expand on private overlays.** (Lore)
5. **Same engine, new vertical, repeat.** Never fork the platform per
   industry; only the YAML changes. (Huizenga)
6. **Make compliance feel like rebellion against bureaucracy, not submission
   to it.** (Branson)
7. **No stubs, Zod at every boundary, sealed lifecycles, graph-first.** The
   existing engineering conventions in CLAUDE.md are not style — they are the
   trust posture. They hold at any scale.

---

## 5. The 90-Day Sprint (from today, June 11 2026)

| # | Deliverable | Owner lens | Why |
|---|------------|-----------|-----|
| 1 | Publish `@regground/mcp-server` to npm + 5-minute quickstart | Cherny | Open the funnel |
| 2 | Sign 3 design partners (mid-size MDR/FDA device makers) running Complaints + CAPA in production | Lore | Revenue truth-test |
| 3 | Audit Pack export (`export-audit-pack` skill → product feature) | Jobs | The closing demo |
| 4 | FDA QMSR + EU IVDR encoded; cross-referenced to ISO 13485 / 21 CFR 820 | Musk/Huizenga | Coverage velocity |
| 5 | Adversarial test suite for guardrails + traceability; evals gate in CI | All | Trust bar |
| 6 | Public obligation-graph explorer on the landing page | Branson | Brand & community |

---

## 6. Closing Statement from the Panel

Every great company is a bet on an inevitability arriving faster than the
incumbents believe. The inevitability here: **AI agents will do the regulated
work of the world, and regulators will demand proof.** The proof layer does
not exist yet at scale. This repository is the furthest-along attempt we have
seen: the graph is real, the guardrails are sealed, the traces are
cryptographic, the distribution wedge (MCP) is already the industry standard,
and the builder surface is live on Anthropic's managed runtime.

The application's state is no longer "promising prototype." It is a deployed,
multi-surface platform one vertical deep. The unicorn question is now purely a
question of **velocity**: regulations encoded per month, installs per month,
verified runs per month.

Ship the npm package. Sign the design partners. Encode the next thirty
regulations. Make the first auditor accept the first trace chain.

Then do it again in the next vertical.

— *The Panel*
