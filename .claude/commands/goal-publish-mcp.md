---
description: Goal G-1 — make @regground/mcp-server npm-publishable with a 5-minute quickstart (the distribution funnel)
---

# /goal-publish-mcp — Open the Funnel

**Mandate reference:** UNICORN_MANDATE.md §G-1 and 90-day sprint item 1.
**Why:** The MCP server is the primary distribution mechanism. A developer in
Claude Code, Cursor, or Windsurf must go from zero to querying the obligation
graph in under 5 minutes.

## Scope

Work only inside `packages/mcp-server/` plus root-level docs. Do NOT publish to
npm yourself — prepare everything so a human can run `npm publish` as the final
step (publishing is outward-facing and needs the owner's npm credentials).

## Deliverables

1. **Publish-ready package.json**: correct `name` (`@regground/mcp-server`),
   semver version, `description`, `keywords` (mcp, compliance, medical-device,
   regulatory, knowledge-graph), `license`, `repository`, `bin` entry so
   `npx @regground/mcp-server` works, `files` whitelist (dist + README only),
   `exports` map, `engines.node >= 20`. Remove `"private"` if present.
2. **Build verification**: `npm run build` succeeds from a clean state; `dist/`
   contains no source maps pointing at missing files; the compiled server starts
   in stdio mode and responds to an MCP `initialize`/`tools/list` handshake.
3. **README quickstart** at `packages/mcp-server/README.md` with three install
   paths, each copy-pasteable:
   - Claude Code: `claude mcp add regground -- npx -y @regground/mcp-server`
   - Cursor/Windsurf: the JSON config block for `mcpServers`
   - HTTP mode: `MCP_TRANSPORT=http` with env vars table
   Include required env vars (`NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`),
   the full 12-tool reference table, and one worked example ("discover EU MDR
   obligations for a complaints process").
4. **Smoke-test script** (`packages/mcp-server/scripts/smoke.ts` or similar)
   that spawns the built server over stdio, calls `tools/list`, and asserts 12
   tools — wired into `package.json` as `npm run smoke`.
5. **`prepublishOnly`** hook that runs build + smoke so a broken package can
   never ship.

## Acceptance criteria

- `pnpm --filter @regground/mcp-server build` then `npm run smoke` both pass.
- `npm pack --dry-run` from `packages/mcp-server` lists only dist, README,
  LICENSE, package.json — no src, no tests, no env files.
- The README quickstart is verified against the actual CLI flags/env vars in
  `src/index.ts` (read the code; do not trust existing docs).
- `pnpm check` still passes for the package.

## Final step

Report what a human must do to finish: `npm login` + `npm publish --access public`
from `packages/mcp-server`. Do not run these.
