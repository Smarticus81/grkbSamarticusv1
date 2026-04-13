# Sealed Agent Lifecycle

`BaseGroundedAgent.run()` is final. Subclasses cannot override it. The lifecycle:

```
1. QUALIFICATION GATE
   QualificationGate.check({ processType, jurisdiction, availableEvidence,
     requiredObligations })
   ↓ if BLOCKED → trace QUALIFICATION_BLOCKED → return failure

2. LOAD OBLIGATIONS + CONSTRAINTS from ObligationGraph

3. trace AGENT_SPAWNED

4. initialize(input, obligations)            ← subclass hook (optional)

5. execute(input, obligations, constraints)  ← subclass hook (REQUIRED)

6. STRICT GATE: validate output against getOutputSchema()
   ↓ if invalid → throw → trace AGENT_FAILED

7. COMPLIANCE VALIDATION:
   ComplianceValidator.validate(output, obligations, context)
   - Reads `output.addressedObligations`
   - Checks every mandatory obligationId is satisfied

8. trace AGENT_COMPLETED

9. cleanup()                                  ← subclass hook (always runs)
```

## Subclass hooks
- `execute` — required. Must return a `TOutput` that passes the output schema.
- `getRequiredObligations` — required. List of obligationIds.
- `getOutputSchema` — required. Zod schema. Must include `addressedObligations`.
- `initialize` — optional. Pre-execute setup.
- `cleanup` — optional. Always runs (finally).
- `calculateConfidence` — optional. Default: compliance score.

## LLM helpers
- `this.invokeLLM({ userPrompt, obligations, traceCtx, operation })`
- `this.invokeLLMForJSON({ userPrompt, schema, obligations, traceCtx, operation })`

Both auto-trace `LLM_REQUEST_SENT` / `LLM_RESPONSE_RECEIVED` and update metrics.
