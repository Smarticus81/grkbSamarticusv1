import { z } from 'zod';
import type { ChainVerification, DecisionTraceEntry } from './types.js';

/**
 * Audit Pack — the exportable, regulator-facing evidentiary package for a run.
 *
 * One schema and one renderer serve both trace systems: hash-chained process
 * instances (DecisionTraceService) and sandbox runs (GroundedRunManifest).
 * Assembly never mutates trace data, and a broken hash chain still exports —
 * prominently flagged — because hiding a failed verification would itself be
 * falsifying audit evidence.
 */

export const AUDIT_PACK_SCHEMA_VERSION = '1.0';

export const AuditPackVerificationSchema = z.object({
  verdict: z.enum(['VERIFIED', 'FAILED_VERIFICATION', 'EMPTY']),
  valid: z.boolean(),
  totalEntries: z.number().int().nonnegative(),
  verifiedEntries: z.number().int().nonnegative(),
  brokenAt: z.number().int().nonnegative().optional(),
  signatureHash: z.string(),
  verifiedAt: z.string().min(1),
});
export type AuditPackVerification = z.infer<typeof AuditPackVerificationSchema>;

export const AuditPackDecisionSchema = z.object({
  sequenceNumber: z.number().int().nonnegative(),
  eventType: z.string().min(1),
  actor: z.string().min(1),
  timestamp: z.string().min(1),
  currentHash: z.string(),
  previousHash: z.string(),
  decision: z.string().optional(),
  reasons: z.array(z.string()).default([]),
  humanSummary: z.string().optional(),
  obligationId: z.string().optional(),
  citation: z.string().optional(),
  regulation: z.string().optional(),
});
export type AuditPackDecision = z.infer<typeof AuditPackDecisionSchema>;

export const AuditPackObligationSchema = z.object({
  obligationId: z.string().min(1),
  status: z.enum(['satisfied', 'violated', 'referenced']),
  title: z.string().optional(),
  sourceCitation: z.string().optional(),
  jurisdiction: z.string().optional(),
  mandatory: z.boolean().optional(),
  enriched: z.boolean(),
});
export type AuditPackObligation = z.infer<typeof AuditPackObligationSchema>;

export const AuditPackSchema = z.object({
  schemaVersion: z.literal(AUDIT_PACK_SCHEMA_VERSION),
  packType: z.enum(['process-instance', 'sandbox-run']),
  subjectId: z.string().min(1),
  generatedAt: z.string().min(1),
  verification: AuditPackVerificationSchema,
  obligations: z.array(AuditPackObligationSchema),
  decisions: z.array(AuditPackDecisionSchema),
  summary: z.object({
    decisionCount: z.number().int().nonnegative(),
    byEventType: z.record(z.number().int().nonnegative()),
    actors: z.array(z.string()),
    obligations: z.object({
      satisfied: z.number().int().nonnegative(),
      violated: z.number().int().nonnegative(),
      referenced: z.number().int().nonnegative(),
    }),
  }),
  notes: z.array(z.string()),
});
export type AuditPack = z.infer<typeof AuditPackSchema>;

/** Minimal obligation detail used to enrich pack entries from the graph. */
export interface ObligationDetail {
  title?: string;
  sourceCitation?: string;
  jurisdiction?: string;
  mandatory?: boolean;
}

export type ObligationLookup = (obligationId: string) => Promise<ObligationDetail | null>;

export interface AuditPackSource {
  packType: AuditPack['packType'];
  subjectId: string;
  decisions: AuditPackDecision[];
  verification: ChainVerification;
  notes?: string[];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

/** Normalize a hash-chained DecisionTraceEntry into a pack decision record. */
export function decisionFromTraceEntry(entry: DecisionTraceEntry): AuditPackDecision {
  const regCtx = entry.regulatoryContext ?? {};
  const obligationId =
    entry.entityType === 'obligation'
      ? (entry.entityId ?? asString(regCtx['obligationId']))
      : asString(regCtx['obligationId']);
  const createdAt =
    entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt);

  const decision: AuditPackDecision = {
    sequenceNumber: entry.sequenceNumber,
    eventType: entry.eventType,
    actor: entry.actor,
    timestamp: createdAt,
    currentHash: entry.currentHash,
    previousHash: entry.previousHash,
    reasons: entry.reasons ?? [],
  };
  if (entry.decision) decision.decision = entry.decision;
  if (entry.humanSummary) decision.humanSummary = entry.humanSummary;
  if (obligationId) decision.obligationId = obligationId;
  const citation = asString(regCtx['citation']) ?? asString(regCtx['sourceCitation']);
  if (citation) decision.citation = citation;
  const regulation = asString(regCtx['regulation']);
  if (regulation) decision.regulation = regulation;
  return decision;
}

/** Extra obligation IDs an entry references beyond its primary one. */
export function referencedObligationIds(entry: DecisionTraceEntry): string[] {
  return asStringArray((entry.regulatoryContext ?? {})['obligationIds']);
}

function statusForEventType(eventType: string): AuditPackObligation['status'] {
  const lower = eventType.toLowerCase();
  if (lower.includes('violated') || lower.includes('missed')) return 'violated';
  if (lower.includes('satisfied')) return 'satisfied';
  return 'referenced';
}

/** violated must never be masked by a later satisfied event. */
function mergeStatus(
  current: AuditPackObligation['status'] | undefined,
  next: AuditPackObligation['status'],
): AuditPackObligation['status'] {
  if (current === 'violated' || next === 'violated') return 'violated';
  if (current === 'satisfied' || next === 'satisfied') return 'satisfied';
  return 'referenced';
}

/**
 * Assemble a validated audit pack from already-normalized decisions and a
 * chain verification result. Pure aside from the optional graph lookup; the
 * source trace data is never modified.
 */
export async function assembleAuditPack(
  source: AuditPackSource,
  lookupObligation?: ObligationLookup,
  extraObligationIds: string[] = [],
): Promise<AuditPack> {
  const notes = [...(source.notes ?? [])];

  // Collect obligations with worst-case status preserved.
  const statuses = new Map<string, AuditPackObligation['status']>();
  for (const decision of source.decisions) {
    if (decision.obligationId) {
      statuses.set(
        decision.obligationId,
        mergeStatus(statuses.get(decision.obligationId), statusForEventType(decision.eventType)),
      );
    }
  }
  for (const id of extraObligationIds) {
    if (!statuses.has(id)) statuses.set(id, 'referenced');
  }

  let lookupFailed = false;
  const obligations: AuditPackObligation[] = [];
  for (const [obligationId, status] of statuses) {
    const record: AuditPackObligation = { obligationId, status, enriched: false };
    if (lookupObligation && !lookupFailed) {
      try {
        const detail = await lookupObligation(obligationId);
        if (detail) {
          record.enriched = true;
          if (detail.title) record.title = detail.title;
          if (detail.sourceCitation) record.sourceCitation = detail.sourceCitation;
          if (detail.jurisdiction) record.jurisdiction = detail.jurisdiction;
          if (detail.mandatory !== undefined) record.mandatory = detail.mandatory;
        }
      } catch {
        lookupFailed = true;
        notes.push(
          'Obligation enrichment unavailable: the knowledge graph could not be reached. ' +
            'Obligation IDs are reported as recorded in the trace.',
        );
      }
    }
    obligations.push(record);
  }

  const byEventType: Record<string, number> = {};
  const actors = new Set<string>();
  for (const decision of source.decisions) {
    byEventType[decision.eventType] = (byEventType[decision.eventType] ?? 0) + 1;
    actors.add(decision.actor);
  }

  const v = source.verification;
  const verdict: AuditPackVerification['verdict'] =
    v.totalEntries === 0 ? 'EMPTY' : v.valid ? 'VERIFIED' : 'FAILED_VERIFICATION';
  if (verdict === 'FAILED_VERIFICATION') {
    notes.push(
      `Hash chain verification FAILED at entry #${v.brokenAt ?? '?'}. ` +
        'One or more entries were altered, removed, or reordered after recording. ' +
        'This pack must not be relied upon as evidence of process control.',
    );
  }

  const verification: AuditPackVerification = {
    verdict,
    valid: v.valid,
    totalEntries: v.totalEntries,
    verifiedEntries: v.verifiedEntries,
    signatureHash: v.signatureHash,
    verifiedAt: v.verifiedAt instanceof Date ? v.verifiedAt.toISOString() : String(v.verifiedAt),
  };
  if (v.brokenAt !== undefined) verification.brokenAt = v.brokenAt;

  return AuditPackSchema.parse({
    schemaVersion: AUDIT_PACK_SCHEMA_VERSION,
    packType: source.packType,
    subjectId: source.subjectId,
    generatedAt: new Date().toISOString(),
    verification,
    obligations,
    decisions: source.decisions,
    summary: {
      decisionCount: source.decisions.length,
      byEventType,
      actors: Array.from(actors).sort(),
      obligations: {
        satisfied: obligations.filter((o) => o.status === 'satisfied').length,
        violated: obligations.filter((o) => o.status === 'violated').length,
        referenced: obligations.filter((o) => o.status === 'referenced').length,
      },
    },
    notes,
  });
}

function mdEscape(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function statusLabel(status: AuditPackObligation['status']): string {
  switch (status) {
    case 'satisfied':
      return 'Satisfied';
    case 'violated':
      return 'NOT SATISFIED';
    case 'referenced':
      return 'Referenced';
  }
}

/**
 * Render the pack as a human-readable report for a notified body or FDA
 * investigator: plain language, every claim tied to an obligation ID, the
 * verification verdict impossible to miss.
 */
export function renderAuditPackMarkdown(pack: AuditPack): string {
  const lines: string[] = [];
  const subjectLabel = pack.packType === 'sandbox-run' ? 'Run' : 'Process instance';

  lines.push(`# Audit Pack — ${subjectLabel} \`${pack.subjectId}\``);
  lines.push('');
  lines.push(
    `Generated ${pack.generatedAt} · Regulatory Ground audit pack schema v${pack.schemaVersion}`,
  );
  lines.push('');

  lines.push('## 1. Integrity verification');
  lines.push('');
  if (pack.verification.verdict === 'VERIFIED') {
    lines.push(
      `**VERIFIED** — all ${pack.verification.totalEntries} decision records passed ` +
        'SHA-256 hash-chain verification. The record below is complete and unaltered ' +
        'since it was written.',
    );
  } else if (pack.verification.verdict === 'EMPTY') {
    lines.push('**EMPTY** — no decision records exist for this identifier.');
  } else {
    lines.push(
      `> ⚠️ **FAILED VERIFICATION** — the hash chain is broken at entry ` +
        `#${pack.verification.brokenAt ?? '?'} (${pack.verification.verifiedEntries} of ` +
        `${pack.verification.totalEntries} entries verified). One or more records were ` +
        'altered, removed, or reordered after recording. **This pack must not be relied ' +
        'upon as evidence of process control.**',
    );
  }
  lines.push('');
  if (pack.verification.signatureHash) {
    lines.push(`Chain signature (SHA-256): \`${pack.verification.signatureHash}\``);
    lines.push('');
  }

  lines.push(`## 2. Obligations addressed (${pack.obligations.length})`);
  lines.push('');
  if (pack.obligations.length === 0) {
    lines.push('No regulatory obligations were recorded against this run.');
  } else {
    lines.push('| Obligation | Status | Source citation | Title |');
    lines.push('|---|---|---|---|');
    for (const o of pack.obligations) {
      lines.push(
        `| \`${mdEscape(o.obligationId)}\` | ${statusLabel(o.status)} | ` +
          `${o.sourceCitation ? mdEscape(o.sourceCitation) : '—'} | ` +
          `${o.title ? mdEscape(o.title) : '—'} |`,
      );
    }
    const counts = pack.summary.obligations;
    lines.push('');
    lines.push(
      `${counts.satisfied} satisfied · ${counts.violated} not satisfied · ` +
        `${counts.referenced} referenced without a recorded outcome.`,
    );
  }
  lines.push('');

  lines.push(`## 3. Decision log (${pack.decisions.length} entries)`);
  lines.push('');
  for (const d of pack.decisions) {
    const heading = `### ${d.sequenceNumber}. ${d.eventType}`;
    lines.push(heading);
    lines.push('');
    lines.push(`- **Actor:** ${d.actor}`);
    lines.push(`- **When:** ${d.timestamp}`);
    if (d.decision) lines.push(`- **Decision:** ${d.decision}`);
    if (d.humanSummary) lines.push(`- **Summary:** ${d.humanSummary}`);
    if (d.reasons.length > 0) lines.push(`- **Reasons:** ${d.reasons.join('; ')}`);
    if (d.obligationId) lines.push(`- **Obligation:** \`${d.obligationId}\``);
    if (d.citation) lines.push(`- **Citation:** ${d.citation}`);
    if (d.regulation) lines.push(`- **Regulation:** ${d.regulation}`);
    lines.push(`- **Hash:** \`${d.currentHash}\` ← prev \`${d.previousHash}\``);
    lines.push('');
  }

  lines.push('## 4. Summary');
  lines.push('');
  lines.push(`- Decisions recorded: ${pack.summary.decisionCount}`);
  lines.push(`- Actors: ${pack.summary.actors.join(', ') || '—'}`);
  for (const [eventType, count] of Object.entries(pack.summary.byEventType)) {
    lines.push(`- ${eventType}: ${count}`);
  }
  lines.push('');

  if (pack.notes.length > 0) {
    lines.push('## Notes');
    lines.push('');
    for (const note of pack.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(
    'This audit pack was generated from a SHA-256 hash-chained decision trace. ' +
      'Each entry’s hash covers its full content and the hash of the previous entry, ' +
      'so any alteration, removal, or reordering of records after the fact is detectable. ' +
      'Verification can be re-run independently at any time against the stored chain.',
  );
  lines.push('');
  return lines.join('\n');
}
