# @regground/mcp-server

The Smarticus MCP server gives your AI tools (Claude, Cursor, Windsurf) access to the regulatory compliance knowledge base at runtime. When your AI agent runs a QMS task, it calls these tools to stay grounded in the applicable regulations, validate its outputs against real requirements, and record traceable decisions.

## Quick start

### 1. Install

```bash
npm install -g @regground/mcp-server
```

### 2. Set up environment variables

Create a `.env` file or set these in your shell:

```
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
```

These connect to the Neo4j knowledge base containing 303 regulatory requirements across 8 regulations (EU MDR, ISO 13485, ISO 14971, 21 CFR 820, UK MDR, MDCG 2022-21, IMDRF).

### 3. Add to your AI tool

Add the following to your MCP configuration file:

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "smarticus": {
      "command": "regground-mcp",
      "env": {
        "NEO4J_URI": "neo4j+s://your-instance.databases.neo4j.io",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "your-password"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "smarticus": {
      "command": "regground-mcp",
      "env": {
        "NEO4J_URI": "neo4j+s://your-instance.databases.neo4j.io",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "your-password"
      }
    }
  }
}
```

**Claude Code** (`.claude/settings.json`):
```json
{
  "mcpServers": {
    "smarticus": {
      "command": "regground-mcp",
      "env": {
        "NEO4J_URI": "neo4j+s://your-instance.databases.neo4j.io",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "your-password"
      }
    }
  }
}
```

### 4. Try it

Once connected, ask your AI tool:

> "What requirements apply to a CAPA process for EU and FDA markets?"

The AI tool will call `regground_discover_obligations` and return the applicable requirements from the actual regulation text.

## Available tools

The server provides 11 compliance tools:

| Tool | What it does |
|------|-------------|
| `regground_discover_obligations` | Find all requirements for a process type and jurisdiction |
| `regground_check_qualification` | Pre-execution gate: can this process run with the current evidence? |
| `regground_validate_compliance` | Post-execution: does the output comply with the applicable requirements? |
| `regground_get_obligation` | Look up a single requirement by ID |
| `regground_explain_obligation` | Full explanation with conditions, documentation needs, and cross-references |
| `regground_search_obligations` | Free-text search across all requirements |
| `regground_get_evidence_requirements` | What documentation is needed for this process? |
| `regground_find_obligation_path` | Find regulatory cross-reference chains between requirements |
| `regground_get_graph_stats` | Summary statistics of the knowledge base |
| `regground_list_process_types` | Available QMS process types (CAPA, complaint handling, design control, etc.) |
| `regground_list_jurisdictions` | Available regulatory jurisdictions (EU, FDA, etc.) |

## Runtime flow

When your AI agent handles a QMS task with Smarticus connected, the typical flow is:

1. **Discover** — Agent calls `regground_discover_obligations` with the process type and target markets. Gets back every applicable requirement.

2. **Qualify** — Agent calls `regground_check_qualification` to confirm prerequisites are in place before starting. If something is missing, the tool explains what and why.

3. **Execute with validation** — As the agent generates content (a PSUR section, a CAPA report, a risk assessment), it calls `regground_validate_compliance` on each output. The tool checks it against the specific requirements and rejects anything that doesn't comply.

4. **Trace** — Every decision is automatically logged with what was decided, the reasoning, and the specific regulation that supports it.

## HTTP mode

For cloud deployment or programmatic access, the server also runs in HTTP mode:

```bash
# Default port 3100
regground-mcp http

# Custom port
MCP_PORT=8080 regground-mcp http
```

Health check: `GET /health`
MCP endpoint: `POST /mcp` (requires `Accept: application/json, text/event-stream`)

## Process types

The knowledge base covers these QMS process types:

- CAPA (corrective and preventive action)
- Complaint handling
- Clinical evaluation
- Design controls
- Document control
- Internal audit
- Management review
- Nonconformance management
- Post-market surveillance
- Production and process controls
- Purchasing controls
- Risk management
- Supplier management
- Technical documentation
- Trend reporting
- Vigilance reporting
- PSUR generation

## Regulatory coverage

| Regulation | Requirements | Scope |
|-----------|-------------|-------|
| EU MDR 2017/745 | 120+ | Classification, clinical evaluation, PMS, vigilance, PSURs, technical documentation |
| ISO 13485:2016 | 70+ | CAPA, design controls, document control, internal audit, management review |
| ISO 14971:2019 | 30+ | Risk management process, hazard identification, risk control |
| 21 CFR Part 820 | 40+ | CAPA, complaint handling, design controls, document controls |
| UK MDR 2002 | 15+ | Post-Brexit UK device regulation for MHRA |
| MDCG 2022-21 | 15+ | PSUR guidance for EU MDR |
| IMDRF AE Terms | 10+ | Adverse event terminology |
| IMDRF Coding | 5+ | Device problem report coding |

## Requirements

- Node.js 18+
- Neo4j database seeded with the regulatory knowledge base

## License

Proprietary — Thinkertons Ltd.
