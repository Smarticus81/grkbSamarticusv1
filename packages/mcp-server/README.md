# @regground/mcp-server

**Ground any AI agent in regulatory compliance.**

The Regulatory Ground MCP server gives MCP-compatible AI tools (Claude Code,
Claude Desktop, Cursor, Windsurf, custom agents) runtime access to an
obligation knowledge graph: 303 obligations, 98 constraints, 55 definitions,
and 347 evidence types across 7 regulations (EU MDR, ISO 13485, ISO 14971,
21 CFR 820, UK MDR, MDCG 2022-21, IMDRF). Your agent discovers what the
regulations require, gates itself before acting, and validates its output
after — every answer cited to the actual regulation text.

## 5-minute quickstart

You need Node.js ≥ 20 and connection details for a Neo4j instance seeded with
the Regulatory Ground graph (your own instance seeded via the
[regulatory-ground repo](https://github.com/Smarticus81/grkbSamarticusv1), or
credentials provided by Thinkertons).

### Claude Code

One command:

```bash
claude mcp add regground \
  --env NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io \
  --env NEO4J_USER=neo4j \
  --env NEO4J_PASSWORD=your-password \
  -- npx -y @regground/mcp-server
```

### Cursor (`.cursor/mcp.json`) / Windsurf / Claude Desktop

```json
{
  "mcpServers": {
    "regground": {
      "command": "npx",
      "args": ["-y", "@regground/mcp-server"],
      "env": {
        "NEO4J_URI": "neo4j+s://your-instance.databases.neo4j.io",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "your-password"
      }
    }
  }
}
```

(Claude Desktop uses the same block in `claude_desktop_config.json`; Windsurf
in its MCP settings file.)

### HTTP mode (cloud / programmatic)

```bash
# Default port 3100
MCP_TRANSPORT=http npx -y @regground/mcp-server

# Custom port
MCP_TRANSPORT=http MCP_PORT=8080 npx -y @regground/mcp-server
```

- MCP endpoint: `POST /mcp` (send `Accept: application/json, text/event-stream`)
- Health check: `GET /health` (no auth)
- Setting `DATABASE_URL` (Postgres) switches HTTP mode into **enterprise
  mode**: API-key auth, per-key rate limiting, tool-scoped permissions, and
  usage logging. Without it the server runs open, with no auth.

### Try it

Ask your AI tool:

> "What obligations apply to a CAPA process for EU and FDA markets?"

The agent calls `regground_discover_obligations` with
`process_types=["CAPA"]`, `jurisdictions=["EU_MDR","FDA"]` and gets back every
applicable obligation, constraint, definition, and required evidence type —
each with its source citation.

## Environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `NEO4J_URI` | yes | — | Neo4j connection URI (`neo4j+s://` for Aura) |
| `NEO4J_USER` | yes | — | Neo4j username |
| `NEO4J_PASSWORD` | yes | — | Neo4j password |
| `NEO4J_DATABASE` | no | `neo4j` | Neo4j database name |
| `MCP_TRANSPORT` | no | `stdio` | `stdio` or `http` (also settable as first CLI arg: `regground-mcp http`) |
| `MCP_PORT` / `PORT` | no | `3100` | HTTP mode listen port |
| `DATABASE_URL` | no | — | Postgres URL; enables enterprise mode (auth, rate limits, usage logging) in HTTP mode |
| `MCP_MAX_RESPONSE_BYTES` | no | unlimited | Hard cap on HTTP response size |

The server also loads `.env` from its package directory and the repo root.

## Available tools (12)

| Tool | What it does |
|------|-------------|
| `regground_discover_obligations` | Find all obligations for process types + jurisdictions — call this first |
| `regground_check_qualification` | Pre-execution gate: can this process run with the available evidence? |
| `regground_validate_compliance` | Post-execution check: does the output address the required obligations? Returns a 0–1 score and SHA-256 signature |
| `regground_get_obligation` | Look up a single obligation by ID |
| `regground_explain_obligation` | Full explanation: constraints, required evidence, parents, cross-references, plain-English chain |
| `regground_search_obligations` | Free-text search across all obligations |
| `regground_get_evidence_requirements` | Evidence types required for a process + jurisdiction |
| `regground_find_obligation_path` | Shortest cross-reference chain between two obligations |
| `regground_get_definition` | Look up or search regulatory definitions |
| `regground_get_graph_stats` | Graph summary statistics |
| `regground_list_process_types` | Process types available in the graph |
| `regground_list_jurisdictions` | Jurisdictions available in the graph |

## Runtime flow

1. **Discover** — `regground_discover_obligations` with the process type and
   target markets returns every applicable obligation.
2. **Qualify** — `regground_check_qualification` confirms the required
   evidence exists before the agent starts. Returns `QUALIFIED` or `BLOCKED`
   with the missing obligations listed.
3. **Execute with validation** — as the agent produces output (a PSUR
   section, a CAPA report, a risk assessment), `regground_validate_compliance`
   scores it against the mandatory obligations and flags anything
   unaddressed.
4. **Trace** — validation results carry a SHA-256 signature hash so the check
   itself is verifiable later.

## Regulatory coverage

| Regulation | Scope |
|-----------|-------|
| EU MDR 2017/745 | Classification, conformity, clinical evaluation, technical documentation, labeling, PMS, vigilance, PSUR, market surveillance |
| ISO 13485:2016 | CAPA, complaints, nonconformances, change control, design controls, document control, audit, management review |
| ISO 14971:2019 | Risk management process, benefit-risk analysis, risk control |
| 21 CFR Part 820 | CAPA, complaints, design controls, production controls, records |
| UK MDR 2002 | Post-Brexit UK device regulation (MHRA) |
| MDCG 2022-21 | PSUR guidance for EU MDR |
| IMDRF | Adverse event terminology and device problem coding |

## Development

```bash
npm install
npm run build     # compile TypeScript → dist/
npm run smoke     # spawn the built server over stdio and assert all 12 tools register
npm run dev       # tsx watch mode
```

`npm publish` runs build + smoke automatically via `prepublishOnly`.

This package is standalone — it has zero dependency on the rest of the
Regulatory Ground monorepo and can be installed, deployed, and run
independently.

## License

Proprietary — Thinkertons Ltd. See [LICENSE.md](./LICENSE.md). Free to
install and run against a Regulatory Ground graph; not legal or regulatory
advice.
