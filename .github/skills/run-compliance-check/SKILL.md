---
name: run-compliance-check
description: "Run compliance coverage analysis for a process instance against its obligation graph. Find gaps, missing evidence, uncovered obligations. Use when: checking compliance, coverage analysis, pre-audit."
---

# Run Compliance Check

Computes obligation coverage for a process instance using
`QualificationGate` + `ComplianceValidator`.

## Procedure
```bash
tsx .github/skills/run-compliance-check/scripts/check-coverage.ts \
  --process-type CAPA \
  --jurisdiction GLOBAL \
  --evidence "complaint_record,nonconformance_record"
```

The script prints:
- Mandatory obligations in scope
- Which are covered by available evidence types
- Which are uncovered (with reason)
- Suggested evidence types to add
