# Plan: Production-Hardening for Regulatory Ground

Comprehensive remediation of all 13 confirmed blockers + SOTA enhancements + UX. Five phases; each independently shippable. Phases 0–1 are required before any paid customer; 2–5 unlock enterprise + investor narrative. Tenancy uses hybrid denormalized `tenant_id` + Postgres RLS + `withTenant` helper. Skills/agents become hybrid global + nullable tenant override. Compliance becomes a 5-validator pipeline. Web auth = Clerk B2B (Organizations → `tenant_id`).

## Phase 0 — Repo guardrails (parallel, day-zero)

- P0.1 Add `.github/workflows/ci.yml`: matrix on Node 20/22, steps: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm check`, `pnpm test`, `pnpm build`. Add `pnpm audit --prod --audit-level=high` (non-blocking warning) and `actions/dependency-review-action` on PRs.
- P0.2 Add `.github/workflows/container.yml`: build all three Dockerfiles on push to `main`, push to GHCR, tag with commit SHA + `latest`. Add Trivy scan on built images, upload SARIF.
- P0.3 Add `.github/workflows/codeql.yml` for JS/TS scanning.
- P0.4 New `packages/core/src/config/env.ts` — single Zod-validated env loader used by api + mcp-server + sandbox. Fails fast at boot if required vars missing. Audit/refresh `.env.example`.

## Phase 1 — Critical security & correctness (Required to ship)

### 1A. Auth hardening
- New `apps/api/src/config/auth-env.ts` (or fold into Phase 0 env loader): on boot reject if `NODE_ENV==='production'` and (`!JWT_SECRET` OR `JWT_SECRET` ∈ {`change-me`, `change-me-in-production`, length<32}).
- Replace fallback in `apps/api/src/middleware/auth.ts` line 11; remove `?? 'change-me'`. Dev bypass guarded by `NODE_ENV==='development' && AUTH_BYPASS_DEV==='true'` and logs a WARN every request.
- Add token issuer + audience claim validation; introduce key rotation by supporting `JWT_SECRET_PREVIOUS` for grace period.
- Type-augment `Express.Request` with `user`/`tenantId` (replace `(req as any)` in `apps/api/src/middleware/tenancy.ts`).

### 1B. CORS + transport hardening
- `apps/api/src/index.ts` line 18: replace `cors()` with `cors({ origin: parseOriginList(env.ALLOWED_ORIGINS), credentials: true, methods: [...], maxAge: 600 })`. In prod, throw if `ALLOWED_ORIGINS` empty.
- Add `helmet()` with strict CSP (excluding `'unsafe-inline'` from web build), HSTS, frameguard.
- Add global `express-rate-limit` (per-IP) + per-route caps on `/api/api-keys`, `/api/auth/*`.

### 1C. API key tenant-scoping (schema migration)
- `packages/core/src/db/schema.ts` `apiKeys`: add `tenantId varchar(128) NOT NULL`, `createdBy uuid` (refers users), index `(tenantId, active)`, unique `(tenantId, name)`. Generate Drizzle migration.
- Rewrite `apps/api/src/routes/api-keys.ts` GET/POST/PATCH/DELETE to filter `eq(apiKeys.tenantId, req.tenantId)`. Server-side enforced; never trust body `tenantId`.
- Add `scopes` Zod enum (`graph:read`, `graph:validate`, `trace:write`, `trace:read`, `sandbox:run`, `admin:keys`) — single source of truth in `packages/core/src/auth/scopes.ts`, reused by api + mcp-server.

### 1D. Web auth — Clerk B2B integration
- Install `@clerk/clerk-react` + `@clerk/express` (api side for JWT verification of Clerk session tokens).
- `apps/web/src/main.tsx`: wrap app in `<ClerkProvider publishableKey>`. Add `<SignedIn>`/`<SignedOut>` gates on `/app/*` routes; `<RedirectToSignIn>` otherwise.
- New `apps/web/src/auth/useApi.ts`: replaces direct `fetch` use of `apps/web/src/lib/queryClient.ts`. Uses `useAuth().getToken()` and attaches `Authorization: Bearer <token>`. Update `queryClient.ts` `api()` to accept token from a context-set `getToken` function (avoid hook coupling).
- Add Clerk Organizations → maps to our `tenant_id`. JWT template includes `org_id` claim → consumed in `apps/api/src/middleware/auth.ts` → `req.user.tenantId = claim.org_id`.
- Webhook `apps/api/src/routes/clerk-webhook.ts`: on `organization.created` insert tenant row; on `user.created`/`organizationMembership.created` upsert mapping.
- Migrate dev bypass to a Clerk dev instance; document in README.

### 1E. MCP HTTP enterprise mode
- New `packages/mcp-server/src/middleware/auth.ts`: extracts `Authorization: Bearer rg_live_...` (API key). Hashes with same algorithm as api-keys route, lookups against Postgres via standalone client (mirrors `services/graph-client.ts` pattern for db).
- New `packages/mcp-server/src/services/db-client.ts`: zero-monorepo-dep Postgres client (`pg`) for `api_keys` + `usage_events` tables only.
- Per-request: tenant resolution → scope check (per-tool: see scope map below) → token-bucket rate limit (Redis if `REDIS_URL` set, else in-process LRU) → call → log to `usage_events` table → response includes `X-Trace-Id`.
- Tool-to-scope map in `packages/mcp-server/src/auth/tool-scopes.ts`: discover/get/explain/search/stats/list = `graph:read`; check_qualification/validate_compliance = `graph:validate`; (future trace tools) = `trace:read`/`trace:write`.
- stdio transport unchanged (local trust); auth middleware only mounted on `/mcp` route.

### 1F. QualificationGate grading
- Replace return shape in `packages/core/src/guardrails/QualificationGate.ts` with:
  - `status: 'QUALIFIED' | 'QUALIFIED_WITH_WARNINGS' | 'NEEDS_HUMAN_REVIEW' | 'BLOCKED' | 'OUT_OF_SCOPE'`
  - `riskLevel: 'low'|'medium'|'high'|'critical'`
  - `coverageScore: 0..1` (mandatoryCovered/mandatoryTotal weighted by criticality)
  - `missingObligations[]`, `missingEvidence[]`, `unsatisfiedConstraints[]`
  - `recommendedNextActions[]` — derived from missing items via graph lookup of `evidence_provider_processes`
  - `canProceedWithHumanApproval: boolean`
  - All fields Zod-validated. Update `__tests__/guardrails.test.ts` accordingly.
- Update consumers in `packages/core/src/agents/BaseGroundedAgent.ts` to map new status to existing pre/post hook contract without breaking.

### 1G. Compliance validation pipeline (the depth fix)
- Rename current `packages/core/src/guardrails/ComplianceValidator.ts` → `ClaimCoverageValidator.ts` (preserves cheap claim-presence check as one stage).
- New `packages/core/src/guardrails/CompliancePipeline.ts` — orchestrates an ordered list of `Validator` instances; each returns `ValidationFinding[]`; pipeline aggregates into a `ValidationReport`.
- New validators (each a separate file, single responsibility):
  - `EvidenceBackedComplianceValidator` — for each claimed obligation, verify the output's `evidence` field contains atoms matching obligation's required `evidenceTypes` (via graph). Verifies atoms exist in `evidence_atoms` table.
  - `ConstraintEvaluator` — pulls obligation `constraints` (e.g., timing, thresholds) from graph; evaluates each against output payload using a small DSL (mirror existing constraint YAML grammar). Produces deterministic pass/fail per constraint.
  - `CitationVerifier` — every citation string in output (e.g., "EUMDR.ART.83") must resolve to a real graph node; emits findings for dangling references.
  - `RegulatoryContradictionDetector` — checks output against known cross-reference relationships (e.g., FDA-CFR-820.100 ↔ ISO-13485-8.5.2). Flags claims that satisfy one regulation while violating its mapped twin.
  - `SecondaryModelReviewer` (feature-flagged via env `ENABLE_LLM_CROSS_CHECK=true`): runs a different model via `LLMAbstraction` to independently judge compliance; only its disagreements escalate to findings, capped to keep cost predictable.
- `ValidationReport` shape: `{ status, severityCounts, findings: [{ validator, severity, obligationId?, constraintId?, message, remediation? }], passedHardChecks, requiresHumanReview }`.
- Update `BaseGroundedAgent` post-execute hook to call `CompliancePipeline` and persist report (link to trace entry).

## Phase 2 — Multi-tenant data model (Foundation hardening)

### 2A. Tenant identity
- New table `tenants` (id uuid PK, clerk_org_id unique, name, plan, created_at, deleted_at). Plus `users` (id uuid PK, clerk_user_id unique, email, created_at) and `tenant_memberships` (tenant_id, user_id, role enum: owner/admin/member/viewer, PK composite).

### 2B. Hybrid tenancy strategy (SOTA: defense-in-depth)
- **Denormalize** `tenant_id NOT NULL` onto hot-path operational tables: `process_instances`, `decision_trace_entries`, `content_traces`, `evidence_atoms`, `workspace_files`, `hitl_gates`, `qualification_reports`, `api_keys` (Phase 1C), `usage_events` (new). Composite indexes `(tenant_id, <hot col>)`.
- **Plus Postgres RLS** as the safety net: enable `ROW LEVEL SECURITY` on every tenant-scoped table; policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)`. The api connects with a per-request `SET LOCAL app.tenant_id = $req_tenant`. Even if a developer forgets a `WHERE`, RLS blocks cross-tenant reads.
- **Drizzle helper** `packages/core/src/db/tenant.ts`: `withTenant(tx, tenantId, fn)` — opens a txn, sets `app.tenant_id`, runs `fn`. All API routes wrap queries in this helper. Lint rule (custom ESLint or simple grep CI check) flags raw `db.select` outside `withTenant`.

### 2C. Skills / agents — hybrid global+tenant
- Add nullable `tenant_id` to `skills`, `skill_versions`, `agent_configs`, `agent_registrations`. NULL = platform-global. Composite unique `(name, COALESCE(tenant_id, '00000000-...'))`.
- Lookup precedence in registry: tenant-specific override beats global. Document in `packages/core/src/skills/SkillRegistry.ts`.
- Admin scope `admin:platform-skills` required to write rows with `tenant_id IS NULL`.

### 2D. Migration & backfill
- Generate one Drizzle migration per phase (kept reviewable). Backfill existing rows via SQL: assign all current data to a single seeded "legacy" tenant. Provide rollback SQL.
- Add `pnpm db:verify-tenancy` script that checks every customer-data table has `tenant_id NOT NULL` and an RLS policy.

## Phase 3 — MCP enterprise mode (depth) + Observability

### 3A. MCP usage metering & quotas
- New table `usage_events` (id, tenant_id, api_key_id, tool_name, latency_ms, status, token_count_in/out, cost_estimate, request_id, occurred_at). Indexed `(tenant_id, occurred_at)`.
- Per-tenant monthly quota table `tenant_quotas`; middleware in mcp-server checks against current month aggregate before serving; soft-fail with `429` + remediation message.
- Response truncation: `MCP_MAX_RESPONSE_BYTES` env; large graph queries paginated.

### 3B. Observability foundation
- Adopt `pino` for structured logging across api + mcp-server + sandbox; replace `console.*`. Pretty in dev, JSON in prod, redaction for `Authorization`/`apiKey`.
- Adopt OpenTelemetry: `@opentelemetry/sdk-node` + auto-instrumentations for express + http + pg + neo4j-driver. OTLP exporter env-driven (`OTEL_EXPORTER_OTLP_ENDPOINT`).
- Custom spans on: every BaseGroundedAgent lifecycle stage, every CompliancePipeline validator, every Neo4j query, every LLM call (with model+token attributes).
- Emit metrics: `request_duration_ms{route,status}`, `mcp_tool_calls_total{tool,tenant}`, `compliance_validator_findings_total{severity}`, `llm_cost_usd_total{provider,model}`.
- Correlation: `X-Request-Id` middleware (UUIDv7) propagated to logs, traces, decision-trace entries, and MCP response headers.

## Phase 4 — Regulation curation + Eval harness (the moat)

### 4A. Regulation YAML metadata (schema upgrade)
- Extend YAML schema with required fields: `source_url`, `source_document_title`, `effective_date`, `last_reviewed`, `reviewer` (string or list), `approval_status` (enum: `draft|in_review|approved|released|superseded`), `superseded_by?`, `change_log[]`, `checksum` (auto-computed at seed).
- Update `packages/core/src/skills/seed-regulations` (and `pnpm seed:graph`) to validate and reject incomplete YAML.
- Pre-seed graph quality checks: no orphan obligations, no duplicate IDs, no dangling cross-refs, every mandatory obligation has ≥1 evidence type, every regulation has version metadata. CI gate via `scripts/check-graph-quality.mjs`.
- Curation workflow encoded as PR labels + CODEOWNERS; document in `regulations/CURATION.md` (only docs file we add this phase).

### 4B. Eval harness
- New package `packages/evals` (or folder under `core/src/evals`): loads YAML test sets `evals/{capa,complaints,pms,crosswalk,adversarial}.yaml`, each with 100 prompts.
- Metrics per run: obligation-retrieval recall@k, citation accuracy, mandatory-miss rate, false-claim rate, evidence completeness, refusal correctness on adversarial.
- Runner: `pnpm eval --suite=capa --model=claude-3.5-sonnet`; outputs JSON + Markdown report; trend stored in Postgres `eval_runs` table.
- Nightly GitHub Action runs adversarial + crosswalk suites; posts diff vs last green to PR comments when invoked on PRs.

## Phase 5 — UX redesign + Demo killer

### 5A. First-touch flow ("magic in 60s")
- Replace `apps/web/src/pages/LandingPage.tsx` hero with a single interactive widget: process picker → jurisdiction picker → free-text question. Submits to `/api/discover` (existing `regground_discover_obligations` MCP tool exposed via REST).
- Result panel: collapsible cards for mandatory obligations, evidence required, cross-reg links, gaps. Top-right "Connect to Claude/Cursor" surface (copy MCP config snippet with the user's tenant key).

### 5B. Demo-killer: Draft-CAPA validator page
- New `apps/web/src/pages/DraftCheck.tsx`: paste/upload draft CAPA → POSTs to new `/api/validate-draft` route → server runs `CompliancePipeline` against EU MDR + 21 CFR 820 + ISO 13485 → returns missing obligations, missing evidence, suggested remediation, downloadable trace bundle.
- Re-uses Phase 1G pipeline; no new validation logic.
- Export uses existing `export-audit-pack` skill via api wrapper.

### 5C. Information architecture cleanup
- Sidebar reorder: Ask → Validate Draft → Processes → Traces → Regulations → API Access → Settings (org/billing).
- Org switcher in topbar (Clerk `<OrganizationSwitcher>`); plan/usage badge.

## Verification

**Phase 0–1 (must pass to ship):**
1. `pnpm check && pnpm test && pnpm build` — green.
2. New unit tests: auth-env-guard rejects weak/missing secrets; CORS rejects unlisted origin; api-keys route returns 0 rows for foreign tenant; QualificationGate returns each of the 5 statuses on crafted fixtures; CompliancePipeline emits findings from a known-bad agent output (claims obligation but supplies no evidence).
3. Integration test: web → Clerk dev session → `/api/api-keys` round-trip succeeds; without token → 401.
4. MCP HTTP smoke test: `curl /mcp` no key → 401; valid key wrong scope → 403; valid key → 200 with `X-Trace-Id`; rate limit triggers 429 after N calls.
5. CI workflow runs end-to-end on a sample PR; CodeQL + Trivy report uploaded.
6. `pnpm db:verify-tenancy` (Phase 2D) reports 0 unscoped tables.

**Phase 3:**
7. OTEL spans visible in local Jaeger via docker-compose; `pino` JSON logs include `request_id`, `tenant_id`, `tool_name`.
8. Usage metering: hit MCP from two API keys (different tenants), confirm `usage_events` rows isolated per tenant.

**Phase 4:**
9. `pnpm seed:graph` rejects a YAML missing `source_url`.
10. `pnpm eval --suite=adversarial` produces report; nightly action posts diff.

**Phase 5:**
11. Manual: from logged-out → land → ask question → see obligations in <60s.
12. Manual: paste sample CAPA into DraftCheck → see findings + downloadable trace bundle.

## Decisions

- **Tenancy**: Hybrid denormalized `tenant_id` + Postgres RLS + `withTenant` helper. Performance of denorm + safety net of RLS + ergonomics of helper. SOTA pattern (PlanetScale, Supabase, Neon multi-tenant guides).
- **Skills/agents**: Hybrid global + nullable `tenant_id` overrides. Lets you ship a curated catalog while allowing customer customization without forking.
- **Validator**: Pipeline of 5 single-responsibility validators behind `CompliancePipeline`. Each independently testable, evolvable, and feature-flaggable. `SecondaryModelReviewer` cost-gated by env flag.
- **Auth**: Clerk B2B. Organizations map cleanly to `tenant_id`; SSO/SAML/SCIM available on enterprise tier; webhook gives clean tenant provisioning.
- **Observability**: `pino` + OpenTelemetry (vendor-neutral). Avoids lock-in; works with Datadog/Honeycomb/Grafana Cloud.
- **CORS**: Strict allowlist via `ALLOWED_ORIGINS` env; throws in prod if empty.
- **Out of scope (this plan)**: Billing/Stripe, SAML/SCIM beyond what Clerk provides OOTB, Agent Builder UI, GraphQL API surface, mobile apps.

## Further considerations

1. **Redis dependency for rate limit (3A)** — recommended for hosted MCP. Option A: add Redis to Railway and require it in prod. Option B: use Postgres advisory locks for token-bucket (no extra infra, slightly higher latency). Recommendation: A.
2. **Migration sequencing (2D)** — running on a populated Neon Postgres requires backfill window. Option A: blue/green with shadow table. Option B: brief maintenance window (acceptable pre-GA). Recommendation: B for now.
3. **Eval LLM costs (4B)** — nightly adversarial runs across 5 suites × 100 prompts × multiple models is non-trivial spend. Cap with a per-day USD budget in the runner; default $5/day.
