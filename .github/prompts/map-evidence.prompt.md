---
description: "Map uploaded evidence to regulatory obligations and identify coverage gaps"
---
Given evidence of type `{{evidenceType}}` for process `{{processType}}` in
jurisdiction `{{jurisdiction}}`:

1. Use `ObligationGraph.getObligationsForProcess(processType, jurisdiction)`
   to fetch the obligation set.
2. Use `SlotMapper` to map the available evidence atoms to obligation slots.
3. List satisfied obligations with their `obligationId` and `sourceCitation`.
4. List unsatisfied slots and the obligations that depend on them.
5. Suggest concrete evidence types from `EvidenceTypeRegistry` that would
   close the gaps.

Output as a markdown table grouped by `mandatory` then `optional`.
