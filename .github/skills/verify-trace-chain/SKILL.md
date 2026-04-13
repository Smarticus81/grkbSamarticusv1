---
name: verify-trace-chain
description: "Verify hash chain integrity of decision traces for a process instance. Detect tampering, broken chains, missing entries. Use when: auditing, compliance check, verifying trace integrity."
---

# Verify Trace Chain

Run `ChainVerifier` against a process instance and produce a verification
report.

## Procedure
```bash
tsx .github/skills/verify-trace-chain/scripts/verify.ts <processInstanceId>
```

The script prints:
- `valid`, `totalEntries`, `verifiedEntries`
- `brokenAt` and `brokenEntry` if the chain is invalid
- `signatureHash` (rollup hash of all entries)

Exits non-zero if the chain is invalid.

## Hard rules
- Never edit a trace entry to "fix" verification — that defeats the purpose.
- A broken chain is a security incident. Escalate to the compliance owner.
