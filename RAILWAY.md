# Deploying Regulatory Ground to Railway

Three services, one repo. Neo4j is external (Aura), Postgres can be Railway-provisioned or external.

## One-time setup (Railway dashboard)

1. **New Project → Deploy from GitHub repo** → select this repo.
2. The first service Railway creates will fail until you point it at a config. Either delete it or rename it to `api` and configure as below.
3. Create **3 services** in the same project, all pointing at this same repo:

| Service name | Root Directory | Config-as-code path                  |
| ------------ | -------------- | ------------------------------------ |
| `api`        | `/`            | `apps/api/railway.json`              |
| `mcp-server` | `/`            | `packages/mcp-server/railway.json`   |
| `web`        | `/`            | `apps/web/railway.json`              |

   Set this in each service: **Settings → Source → Config-as-code Path**.
   Keep **Root Directory** as `/` so the Docker build context sees the whole monorepo (required for pnpm workspace resolution).

4. (Optional) **+ New → Database → Add PostgreSQL** if you want Railway-managed PG.

## Environment variables (per service)

### `api`
```
DATABASE_URL          = ${{ Postgres.DATABASE_URL }}   # or your external PG URL
NEO4J_URI             = neo4j+s://<your-aura-id>.databases.neo4j.io
NEO4J_USER            = neo4j
NEO4J_PASSWORD        = <aura-password>
NEO4J_DATABASE        = neo4j
JWT_SECRET            = <generate a long random string>
CLERK_SECRET_KEY      = sk_live_...
CLERK_WEBHOOK_SIGNING_SECRET = whsec_...
ALLOWED_ORIGINS       = https://<your-web-domain>
PSUR_SERVICE_URL      = https://<psur-service-domain>
PLATFORM_ADMIN_USER_IDS = user_...     # optional comma-separated Clerk user ids for shared graph administration
NODE_ENV              = production
AUTH_BYPASS_DEV       = false
# OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY as needed
```

Production readiness expects:
- `JWT_SECRET` to be at least 32 characters and not a default/dev value.
- `CLERK_SECRET_KEY` to be a production `sk_live_...` key.
- `VITE_CLERK_PUBLISHABLE_KEY` to be a production `pk_live_...` key in the web build args.
- `VITE_SESSION_IDLE_TIMEOUT_MINUTES`, `VITE_SESSION_AWAY_TIMEOUT_MINUTES`, and
  `VITE_SESSION_WARNING_SECONDS` to be positive numbers, with the warning
  window shorter than both timeout windows.
- `ALLOWED_ORIGINS` to contain only HTTPS, non-local browser origins.
- `NEO4J_URI` to use a TLS scheme such as `neo4j+s://`.
- `VITE_API_URL` and `PSUR_SERVICE_URL` to use deployed `https://` service URLs.
- `PSUR_SERVICE_URL` to point at the deployed PSUR service when live signed-in PSUR runs are enabled.
Graph writes under `/api/graph/obligations` require a platform admin role or a user id listed in `PLATFORM_ADMIN_USER_IDS`; tenant admins can manage workspaces but cannot mutate the shared regulatory graph.
Railway injects `PORT` automatically — the API now binds to it.

### `mcp-server`
```
NEO4J_URI             = neo4j+s://<your-aura-id>.databases.neo4j.io
NEO4J_USER            = neo4j
NEO4J_PASSWORD        = <aura-password>
NEO4J_DATABASE        = neo4j
MCP_TRANSPORT         = http
NODE_ENV              = production
```

### `web`
The Vite bundle is built into static assets, so `VITE_API_URL` must be set as a **build arg**, not a runtime env.

In the `web` service:
- **Settings → Build → Build Args**, add:
  ```
  VITE_API_URL = https://${{ api.RAILWAY_PUBLIC_DOMAIN }}
  VITE_CLERK_PUBLISHABLE_KEY = pk_live_...
  VITE_SESSION_IDLE_TIMEOUT_MINUTES = 15
  VITE_SESSION_AWAY_TIMEOUT_MINUTES = 10
  VITE_SESSION_WARNING_SECONDS = 60
  ```
  (Use the literal public domain of your `api` service, e.g. `https://regground-api-production.up.railway.app`. Railway's variable reference works because it's resolved at build time.)
- No runtime env vars are required, but you can set `NODE_ENV=production`.

## Generate public domains

For each service: **Settings → Networking → Generate Domain**. Then update the `web` service's `VITE_API_URL` build arg with the API's domain and redeploy `web`.

## Clerk production setup

In Clerk, create or select the production application, enable organizations,
and add the production web domain as an allowed origin. Then create a webhook
endpoint:

```
https://<api-domain>/api/clerk-webhook
```

Subscribe it to:

- `user.created`
- `user.updated`
- `organization.created`
- `organization.updated`
- `organization.deleted`
- `organizationMembership.created`
- `organizationMembership.updated`
- `organizationMembership.deleted`

Copy the webhook signing secret into the API service as
`CLERK_WEBHOOK_SIGNING_SECRET`.

## PSUR demo service (Python)

The PSUR demo at `/demo/psur` has two modes: signed-out visitors get a fully
client-side simulation (no backend needed), while signed-in users drive a
Python FastAPI service that wraps the real PSUR pipeline. The service lives in
the **bestpsurgenerator** repo (deployed from its `Dockerfile.psur`), not in
this monorepo. If `PSUR_SERVICE_URL` is unset or the service is down, the
live-mode demo returns 502 on `/api/psur/defaults`.

1. Create a fourth Railway service, `psur-service`, pointing at the
   bestpsurgenerator repo with `Dockerfile.psur` as its config. Give it the
   LLM provider keys it needs (`ANTHROPIC_API_KEY`, optionally
   `OPENAI_API_KEY`); keys stay server-side; the browser never sees them.
2. Generate an HTTPS domain for it and point the `api` service at it:

   ```
   PSUR_SERVICE_URL = https://<psur-service-domain>
   ```

The `/api/psur` routes require sign-in (Clerk/JWT bearer token) and are
multi-user and tenant-scoped. Runs are traced under the signed-in caller's
tenant in Postgres. Capacity limits for real generation live in the Python
PSUR service, which returns `demo_busy` when saturated.

## Deploy

Push to your default branch — Railway auto-deploys all three services. Or trigger manually from the dashboard.

Before deploying from local configuration, run the redacted environment doctor:

```
pnpm env:doctor -- --production
```

It checks `.env` for duplicate keys, empty effective values, local URLs that
would override deployed services, weak JWT secrets, missing Clerk webhook
configuration, and missing server-side LLM provider keys. It never prints raw
secret values. Fix all `ERROR` lines before using the file as a source for
Railway variables or local production smoke testing.

## Database hardening

Before sending production users to the app, run the secure database upgrade
against the production Postgres instance:

```
pnpm install
DATABASE_URL="postgres://..." pnpm db:secure
```

This runs the Drizzle schema push, backfills the stable `tenant_key` used for
Clerk organization and personal workspaces, and applies Postgres row-level
security policies. Re-run it whenever tenant schema or RLS policy files change.

## Verify

```
curl https://<api-domain>/health
curl https://<api-domain>/ready
curl "https://<api-domain>/ready?deep=1"
curl https://<mcp-domain>/health
open  https://<web-domain>
```

`/ready` returns non-secret production readiness status. It should report
`status: "ready"` before production traffic. If it reports `not_ready`, fix the
failed checks before continuing. `/ready?deep=1` also verifies live Postgres
connectivity, tenant key schema, forced RLS on tenant-owned tables, Neo4j
connectivity, that the obligation graph has been seeded, and that the signed-in
PSUR service responds on `/health` or `/healthz`.

You can run the same verification as a repeatable VS Code terminal check:

```
API_URL=https://<api-domain> WEB_URL=https://<web-domain> MCP_URL=https://<mcp-domain> pnpm smoke:prod
```

The smoke script checks API health, API readiness, deep readiness, public graph
stats, direct SPA loads for `/`, `/demo/psur`, `/app`, `/app/psur/build`, and
`/pricing`, plus MCP health when `MCP_URL` is provided.

Set `SMOKE_SKIP_DEEP=1` only when the deployed database or Neo4j is intentionally
offline during infrastructure setup.

## Notes

- Build context is the repo root for all three services so pnpm can resolve `workspace:*` deps. The `.dockerignore` keeps the upload size sane.
- `DATABASE_URL` from Railway Postgres includes SSL — Drizzle handles it.
- For Neo4j Aura, always use the `neo4j+s://` scheme (TLS).
- `apps/api/uploads` is excluded from the image; if you need persistent uploads, attach a Railway Volume to the `api` service at `/app/apps/api/uploads`.
- To seed the graph, run `pnpm seed:graph` locally (or as a one-off Railway process) with the same `NEO4J_*` vars pointing at Aura.
