# Common QMS Process Patterns

## CAPA (ISO 13485 §8.5.2 / 21 CFR 820.100)
Initiation → Investigation → Root Cause → Action Plan → HITL Approval →
Implementation Tracking → Effectiveness Check → Closure.

## Complaint Handling (ISO 13485 §8.2.2)
Intake → Triage → Investigation → Trend Detection → HITL Review → Closure.

## Nonconformance (ISO 13485 §8.3)
Detection → Classification → Investigation → Disposition → Closure.

## Trend Reporting (EU MDR Art 88)
Data Collection → Statistical Analysis (UCL/LCL, Poisson) → Narrative → Report.

## Patterns
- **Always** start with an intake/initiation step that produces a typed input
  for downstream agents.
- **Always** add a HITL gate before any action that affects production records.
- **Effectiveness checks** are themselves grounded agents — they read the
  upstream chain and assert outcomes against the original obligation.
- **Trend detectors** must call out the statistical method (UCL/LCL, Poisson,
  binomial) and bind to constraints in the graph.
