---
name: seed-regulations
description: "Seed regulatory obligation YAML files into the Neo4j obligation graph. Use when: adding new regulations, updating obligations, seeding the graph, importing regulatory requirements."
---

# Seed Regulations

Validate and load regulation YAML files into the Neo4j obligation graph.

## Procedure

1. Place YAML files under `packages/core/regulations/{regulation-name}/`. Each
   file must conform to the schema in `references/yaml-schema.md`.
2. Validate every file (without writing to Neo4j):
   ```bash
   tsx .github/skills/seed-regulations/scripts/validate-yaml.ts packages/core/regulations
   ```
3. Seed the graph:
   ```bash
   pnpm seed:graph
   ```
   This calls `GraphSeeder.seedAllRegulations(packages/core/regulations)` which
   bootstraps Neo4j constraints, then walks all `.yaml` / `.yml` files and
   upserts obligations, constraints, definitions, and relationships.
4. Verify with a query:
   ```ts
   const graph = new ObligationGraph();
   const obligations = await graph.getObligationsForProcess('CAPA', 'GLOBAL');
   console.log(obligations.length);
   ```

## Hard rules

- Never put regulation text in code. It belongs in YAML.
- Every obligation must have a `sourceCitation` field.
- Never delete obligations from production graphs without a SUPERSEDES edge.
