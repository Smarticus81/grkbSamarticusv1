import type { BoundaryPolicy, BoundaryPolicyId } from './types.js';

/**
 * Sealed, hardcoded non-negotiables. These cannot be configured, disabled, or
 * overridden — they are the floor of the platform.
 */
export const BOUNDARY_POLICIES: readonly BoundaryPolicy[] = Object.freeze([
  {
    id: 'MUST_TRACE_EVERY_DECISION',
    description: 'Every agent decision must be appended to the decision trace.',
    rationale: 'Auditability requires no silent decisions.',
  },
  {
    id: 'MUST_NOT_FABRICATE_EVIDENCE',
    description: 'Agents may not reference evidence atoms that do not exist.',
    rationale: 'Hallucinated evidence destroys regulatory trust.',
  },
  {
    id: 'MUST_NOT_SKIP_MANDATORY_OBLIGATIONS',
    description: 'Mandatory obligations must be addressed before completion.',
    rationale: 'Mandatory means mandatory.',
  },
  {
    id: 'MUST_RESPECT_HITL_GATES',
    description: 'Agents may not auto-approve human-in-the-loop gates.',
    rationale: 'Human approval is non-delegable.',
  },
  {
    id: 'MUST_USE_APPROVED_TERMINOLOGY',
    description: 'Use IMDRF/regulator-approved coding instead of free text.',
    rationale: 'Standardized terminology supports cross-jurisdiction reporting.',
  },
  {
    id: 'MUST_HASH_CHAIN_TRACES',
    description: 'Every trace entry includes the SHA-256 of the previous entry.',
    rationale: 'Tamper-evidence requires hash chaining.',
  },
  {
    id: 'MUST_VALIDATE_OUTPUT_SCHEMA',
    description: 'All agent outputs must pass Zod schema validation.',
    rationale: 'Type safety at runtime, not just compile time.',
  },
  {
    id: 'MUST_LOG_LLM_CALLS',
    description: 'Every LLM call is logged with model, tokens, cost.',
    rationale: 'Cost control and reproducibility.',
  },
  {
    id: 'MUST_SCOPE_TO_JURISDICTION',
    description: 'A run executes within a single jurisdiction context.',
    rationale: 'Mixing jurisdictions yields invalid filings.',
  },
  {
    id: 'MUST_VERSION_OBLIGATIONS',
    description: 'Every obligation reference includes a version.',
    rationale: 'Regulations change; traces must be reproducible.',
  },
]);

export function getPolicy(id: BoundaryPolicyId): BoundaryPolicy {
  const found = BOUNDARY_POLICIES.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown boundary policy: ${id}`);
  return found;
}

export function listPolicies(): readonly BoundaryPolicy[] {
  return BOUNDARY_POLICIES;
}
