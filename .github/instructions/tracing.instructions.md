---
applyTo: "**/traceability/**/*.ts"
---
# Decision Trace Patterns

- Trace entries are append-only and hash-chained (SHA-256 of canonical JSON +
  previousHash).
- Use `DecisionTraceService.startTrace(processInstanceId)` to create the root.
- Use `logEvent(ctx, { eventType, actor, ... })` for every event. Event types
  are constrained by the `traceEventType` Postgres enum.
- Never mutate a trace entry after insert. Mutation = chain break.
- `ChainVerifier` is the only authoritative way to assert chain integrity.
- For element-level provenance (HOW/WHY for individual content units), use
  `ContentTraceService` instead of squeezing it into decision traces.
