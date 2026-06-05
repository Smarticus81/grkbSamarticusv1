# EU MDR Ingestion Review Summary

**Date:** 2026-05-31
**Source:** Regulation (EU) 2017/745, consolidated 02017R0745 — EN — 01.01.2026 — 006.001
**Extraction method:** LLM-assisted (Claude), machine-extracted, pending SME review

## Coverage

| Section | File | Obligations | Constraints | Definitions | Relationships |
|---------|------|-------------|-------------|-------------|---------------|
| Chapter I (Art. 1-4) | `chapter-I-scope-definitions.yaml` | 12 | 5 | 39 | 44 |
| Chapter II (Art. 5-24) | `chapter-II-obligations.yaml` | 65 | 13 | 9 | 29 |
| Chapter III-IV (Art. 25-26, 30-34) | `chapter-III-IV-identification-registration.yaml` | 23 | 9 | 4 | 14 |
| Chapter V (Art. 35-50) | `chapter-V-classification-conformity-full.yaml` | 40 | 11 | 6 | 17 |
| Chapter VI (Art. 51-60, Annex VIII) | `classification-conformity.yaml` (existing) | 19 | 6 | 5 | 6 |
| Chapter VII (Art. 62-82) | `chapter-VII-clinical-investigations.yaml` | 51 | 10 | 7 | 21 |
| Art. 61, Annex XIV-XV | `clinical-evaluation.yaml` (existing) | 20 | 5 | 5 | 5 |
| Chapter VIII (Art. 83-86) | `pms-obligations.yaml` (existing) | 4 | 0 | 0 | 0 |
| Art. 86 PSUR | `psur-obligations.yaml` (existing) | 2 | 0 | 0 | 0 |
| Art. 87-92 Vigilance | `vigilance-obligations.yaml` (existing) | 3 | 1 | 0 | 0 |
| Art. 93-100 Market Surveillance | `chapter-VIII-market-surveillance.yaml` | 22 | 6 | 4 | 11 |
| Chapters IX-X (Art. 101-123) | `chapter-IX-X-final-provisions.yaml` | 29 | 7 | 5 | 15 |
| Annex I GSPR (Sections 1-22) | `annex-I-gspr.yaml` | 52 | 15 | 6 | 23 |
| Annex I Ch III (Labeling/IFU) | `labeling-ifu.yaml` (existing) | 15 | 5 | 3 | 5 |
| Annexes II-III | `technical-documentation.yaml` (existing) | 18 | 5 | 4 | 5 |
| Annexes IV-VII | `annex-IV-V-VI-VII.yaml` | 27 | 12 | 4 | 24 |
| Annexes IX-XI | `annex-IX-X-XI-conformity-procedures.yaml` | 28 | 12 | 4 | 34 |
| Annexes XII-XIII | `annex-XII-XIII-certificates-clinical.yaml` | 22 | 8 | 5 | 9 |
| Annexes XVI-XVII | `annex-XVI-XVII-special-devices.yaml` | 9 | 5 | 3 | 9 |
| Cross-cutting constraints | `constraints.yaml` (existing) | 0 | 3 | 0 | 0 |
| AgentOS bindings | `agentos.yaml` (existing) | 0 | 0 | 0 | 0 |
| **TOTAL** | **21 files** | **461** | **138** | **113** | **271** |

## Review Status

All machine-extracted obligations are marked with:
```yaml
metadata:
  review: "pending"
  extractedBy: "llm"
  extractedAt: "2026-05-31T00:00:00Z"
```

### Items requiring SME review (`needs-sme`)

1. **Annex I GSPR Sections affected by amendment (EU) 2025/2457** — Annex I was partially
   replaced by this amendment effective 2026-01-01. The new YAML captures the pre-amendment
   text. An SME should verify which sections have been superseded and create new obligation
   nodes with SUPERSEDES edges.

2. **Transitional provisions (Articles 114-120)** — These have complex date-dependent
   applicability and interaction with MDD/AIMDD legacy devices. An SME should confirm the
   obligation text accurately reflects the current state after multiple amendment extensions.

3. **Cross-regulation IMPLEMENTS/HARMONIZED_BY edges** — Cross-references to ISO 13485,
   ISO 14971, and IMDRF obligation IDs are based on semantic mapping. An SME should verify
   the specific target obligation IDs exist and the relationship type is correct.

## ID Convention

- Articles: `EUMDR.<article>.OBL.<NNN>` (e.g., `EUMDR.10.OBL.001`)
- Annex I: `EUMDR.AI.<section>.OBL.<NNN>` (e.g., `EUMDR.AI.2.OBL.001`)
- Other Annexes: `EUMDR.A<roman>.OBL.<NNN>` (e.g., `EUMDR.AIX.1.OBL.001`)
- Constraints: `EUMDR.<scope>.CON.<NNN>`
- Definitions: `EUMDR.DEF.<TERM>` (e.g., `EUMDR.DEF.MEDICAL_DEVICE`)

## Next Steps

1. SME review of all `review: "pending"` items (prioritize Annex I GSPRs and Chapter II)
2. Apply amendment (EU) 2025/2457 via SUPERSEDES edges (GraphVersioning.applyAmendment)
3. Run `pnpm seed:graph` to load into Neo4j
4. Run `pnpm embed:graph` to generate embeddings
5. Run `pnpm --filter @regground/core check:coverage` to verify 100% coverage
