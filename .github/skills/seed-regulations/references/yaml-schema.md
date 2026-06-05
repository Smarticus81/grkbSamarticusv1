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
    applicability:                # Optional: structured filters for discovery
      deviceClasses:              #   MDR risk classes (I, IIa, IIb, III, etc.)
        - IIb
        - III
      operatorRoles:              #   Economic operator roles
        - manufacturer
      deviceTypes:                #   Device categories
        - active
      conditions:                 #   Free-form conditions
        - "only when device incorporates medicinal substance"
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
  - from: "EUMDR.10.9.OBL.001"        # Cross-regulation edge example
    to:   "ISO13485.4.1.OBL.001"
    type: IMPLEMENTS
    props:
      note: "EU MDR QMS requirement implemented via ISO 13485 QMS clause"
```

## Field rules

- `obligationId` is globally unique across all regulations. Convention:
  `<REG>.<SECTION>.<KIND>.<NNN>`.
  - EU MDR convention: `EUMDR.<article>.OBL.<NNN>` for articles,
    `EUMDR.ANNEX<N>.<sub>.OBL.<NNN>` for annexes,
    `EUMDR.<...>.CON.<NNN>` for constraints, `EUMDR.DEF.<TERM>` for definitions.
- `kind` must be `obligation`, `constraint`, or `definition`.
- `mandatory` defaults to `true`. Set to `false` only when the regulator
  expressly says so.
- `requiredEvidenceTypes` reference types registered with `EvidenceTypeRegistry`.
- `applicability` is optional. When present, it provides structured filters so
  `ObligationDiscovery` can filter by device class, operator role, device type,
  or free-form conditions. All sub-fields are optional arrays. If omitted,
  the obligation applies universally within its jurisdiction/processType scope.
- `relationships.type` must be one of:

  **Core regulatory relations:**
  `REQUIRES_EVIDENCE`, `CONSTRAINED_BY`, `SUPERSEDES`, `APPLIES_TO`,
  `PART_OF`, `CROSS_REFERENCES`, `TRIGGERS`, `SATISFIES`, `CONFLICTS_WITH`.

  **Cross-regulation relations:**
  | Type | Meaning | Example |
  |---|---|---|
  | `IMPLEMENTS` | Source implements a requirement in a target standard | EU MDR Art. 10(9) → ISO 13485 §4.1 |
  | `HARMONIZED_BY` | Source is harmonized by a harmonized standard | EU MDR Annex I GSPR → EN ISO 14971 |
  | `DERIVED_FROM` | Source is derived from a higher-level requirement | UK MDR reg → EU MDR article |
  | `DEPENDS_ON` | Source depends on target being satisfied first | CE marking → conformity assessment |
  | `EXEMPTS` | Source grants an exemption from the target | Class I self-cert → notified body |
