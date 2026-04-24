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
NODE_ENV              = production
# OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY as needed
```
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
  ```
  (Use the literal public domain of your `api` service, e.g. `https://regground-api-production.up.railway.app`. Railway's variable reference works because it's resolved at build time.)
- No runtime env vars are required, but you can set `NODE_ENV=production`.

## Generate public domains

For each service: **Settings → Networking → Generate Domain**. Then update the `web` service's `VITE_API_URL` build arg with the API's domain and redeploy `web`.

## Deploy

Push to your default branch — Railway auto-deploys all three services. Or trigger manually from the dashboard.

## Verify

```
curl https://<api-domain>/health
curl https://<mcp-domain>/health
open  https://<web-domain>
```

## Notes

- Build context is the repo root for all three services so pnpm can resolve `workspace:*` deps. The `.dockerignore` keeps the upload size sane.
- `DATABASE_URL` from Railway Postgres includes SSL — Drizzle handles it.
- For Neo4j Aura, always use the `neo4j+s://` scheme (TLS).
- `apps/api/uploads` is excluded from the image; if you need persistent uploads, attach a Railway Volume to the `api` service at `/app/apps/api/uploads`.
- To seed the graph, run `pnpm seed:graph` locally (or as a one-off Railway job) with the same `NEO4J_*` vars pointing at Aura.
