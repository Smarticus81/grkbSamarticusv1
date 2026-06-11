---
description: Goal G-2 — encode a new regulation into YAML obligation files and seed it into the graph (coverage velocity)
---

# /goal-encode-regulation — Coverage Velocity

**Mandate reference:** UNICORN_MANDATE.md §G-2 and 90-day sprint item 4.
**Why:** "The graph is the moat; coverage velocity is the strategy." Priority
targets: FDA QMSR (2026 ISO 13485 harmonization), EU IVDR, Health Canada CMDR,
TGA, PMDA, MDSAP.

## Arguments

`$ARGUMENTS` = the regulation to encode (e.g. `fda-qmsr`, `eu-ivdr`). If empty,
list which mandate-priority regulations are missing from
`packages/core/regulations/` and ask the user to pick one — do not guess.

## Procedure

1. **Read the schema first**:
   `.github/skills/seed-regulations/references/yaml-schema.md`, and study 2–3
   existing regulation YAMLs (EU MDR and ISO 13485 are the richest examples)
   for ID conventions, obligation granularity, evidence-type naming, and
   citation format.
2. **Research the regulation text** (WebSearch/WebFetch official sources —
   eCFR for FDA, EUR-Lex for EU). Work from the actual regulation text, never
   from memory. Record source URLs in each obligation's citation field.
3. **Create** `packages/core/regulations/<reg-name>/` with one YAML per major
   topic area (mirror how EU MDR splits into 21 topical files). Each obligation
   needs: stable ID following existing conventions, title, requirement text
   summary, mandatory flag, evidence types (reuse existing evidence-type names
   from other regulations wherever the concept matches — that's what makes
   cross-regulation queries work), and source citation.
4. **Cross-reference**: add `CROSS_REFERENCES` relationships to equivalent
   obligations in existing regulations (FDA QMSR ↔ ISO 13485 is nearly 1:1 by
   design; EU IVDR ↔ EU MDR shares most of its structure). Cross-references
   are the lattice that makes the graph defensible — do not skip them.
5. **Validate and seed**: run `pnpm seed:graph` against the local Neo4j; fix
   schema validation errors until it loads cleanly. If no local Neo4j is
   reachable, validate via the loader's schema check and say so explicitly in
   the report.

## Quality bar

- Obligation granularity matches existing files: one obligation = one
  auditable requirement, not one section heading.
- Every obligation cites its source clause precisely (article/section number).
- No regulation knowledge in code — YAML only (CLAUDE.md convention).
- Flag any clause you could not confidently encode as a TODO list in the
  report, with the source text quoted — never encode a guess silently.

## Acceptance criteria

- `pnpm seed:graph` loads the new regulation without validation errors.
- Spot-check: 3 random obligations traced back to the official text are
  accurate.
- Report: obligation count, evidence types reused vs newly introduced,
  cross-references added, and clauses deferred.
