---
description: "Explain a regulatory obligation in plain English with full context chain"
---
Given obligation ID: `{{obligationId}}`, use `GraphQuerier.explain(obligationId)`
to retrieve the obligation, its constraints, required evidence, parents, and
cross-references.

Then explain in plain English:
1. What the obligation requires (preserving "shall" language).
2. Why it exists (regulatory intent / risk addressed).
3. What evidence types satisfy it.
4. Which constraints apply and how they limit acceptable approaches.
5. Cross-referenced obligations and supersession status.

Always cite `sourceCitation` for every claim. Do not invent text not present
in the graph.
