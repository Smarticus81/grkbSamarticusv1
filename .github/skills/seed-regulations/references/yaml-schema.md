# Regulation YAML Schema

```yaml
regulation: "ISO 13485:2016"     # Required: human-readable regulation name
section: "§8.5.2"                 # Optional: top-level section this file covers
jurisdiction: "GLOBAL"            # Required: GLOBAL | EU_MDR | FDA | UK_MHRA | etc.
processType: "CAPA"               # Required: which sandbox process this binds to
artifactType: "CAPA"              # Required: artifact category
version: "1.0.0"                  # Required: semver of THIS file's content
effectiveFrom: "2016-03-01"       # Optional: ISO 8601 date

obligations:
  - obligationId: "ISO13485.8.5.2.OBL.001"
    kind: obligation              # obligation | constraint | definition
    title: "Determine need for CAPA"
    text: "The organization shall determine and implement..."
    sourceCitation: "ISO 13485:2016 §8.5.2(a)"
    mandatory: true
    requiredEvidenceTypes:
      - nonconformance_record
      - complaint_record
      - audit_finding
    metadata: {}                  # Optional free-form

constraints:
  - constraintId: "ISO13485.8.5.2.CON.001"
    appliesTo: "ISO13485.8.5.2.OBL.001"
    text: "Corrective actions shall be proportionate to the effects."
    severity: hard                # hard | soft

definitions:
  - definitionId: "ISO13485.DEF.CORRECTIVE_ACTION"
    term: "Corrective Action"
    text: "Action to eliminate the cause of a detected nonconformity."
    sourceCitation: "ISO 9000:2015 §3.12.2"

relationships:
  - from: "ISO13485.8.5.2.OBL.001"
    to:   "ISO13485.8.5.2.OBL.002"
    type: PART_OF
  - from: "ISO13485.8.5.2.OBL.003"
    to:   "ISO13485.8.5.3.OBL.001"
    type: CROSS_REFERENCES
    props:
      note: "Corrective links to preventive"
```

## Field rules

- `obligationId` is globally unique across all regulations. Convention:
  `<REG>.<SECTION>.<KIND>.<NNN>`.
- `kind` must be `obligation`, `constraint`, or `definition`.
- `mandatory` defaults to `true`. Set to `false` only when the regulator
  expressly says so.
- `requiredEvidenceTypes` reference types registered with `EvidenceTypeRegistry`.
- `relationships.type` must be one of:
  `REQUIRES_EVIDENCE`, `CONSTRAINED_BY`, `SUPERSEDES`, `APPLIES_TO`,
  `PART_OF`, `CROSS_REFERENCES`, `TRIGGERS`, `SATISFIES`, `CONFLICTS_WITH`.
