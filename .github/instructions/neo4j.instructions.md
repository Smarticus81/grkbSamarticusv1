---
applyTo: "packages/core/src/graph/**/*.ts"
---
# Neo4j Coding Patterns

- Always acquire sessions via `this.session()` and close in a `finally` block.
- Use `MERGE` for upserts on unique keys (`obligationId`, `constraintId`, `definitionId`, `evidenceType`).
- Use parameterized Cypher queries — never string-concatenate user input.
- Schema constraints are bootstrapped via `ObligationGraph.ensureConstraints()`.
- Properties stored on nodes must be primitive or stringified JSON. Complex
  metadata should be JSON-encoded into a `metadata` property.
- Relationship types are restricted to `RelationType` (see `relationships.ts`).
- Date properties are stored as ISO 8601 strings; convert with `new Date(...)`
  on read.
