---
description: "Comprehensive gap analysis for a process instance against its obligation set"
---
For process instance `{{processInstanceId}}`:

1. Load the process definition and its `obligationIds`.
2. Run `QualificationGate.check(...)` with the instance's available evidence.
3. Walk the decision trace via `DecisionTraceService.getTraceChain(...)` and
   collect every `addressedObligations` claim.
4. Diff: obligations addressed by trace vs obligations required by definition.
5. For every gap:
   - Cite `sourceCitation`
   - State the missing evidence type(s)
   - Recommend a concrete remediation action (e.g., "Run
     CAPAInvestigationAgent with the missing complaint_record atom").
6. Verify the chain via `ChainVerifier`. If invalid, halt and report the break.

Output a single markdown report with sections: Summary, Gaps, Remediation,
Chain Verification.
