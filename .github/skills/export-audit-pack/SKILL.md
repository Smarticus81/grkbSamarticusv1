---
name: export-audit-pack
description: "Export a complete audit package for a process instance: JSONL traces, PDF report, coverage matrix, chain verification stamp. Use when: preparing for audit, exporting compliance records, regulatory submission."
---

# Export Audit Pack

Bundles a process instance's full evidentiary package using `TraceExporter`.

## Procedure
```bash
tsx .github/skills/export-audit-pack/scripts/export.ts \
  --process-instance <id> \
  --out ./audit-pack
```

Outputs to `<out>/`:
- `trace.jsonl` — line-delimited decision trace
- `trace.dot` — graphviz visualization
- `audit-report.json` — structured audit pack with verification stamp
- `verification.json` — `ChainVerifier` report
