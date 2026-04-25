import { createHash, randomUUID } from 'node:crypto';
import { eq, asc } from 'drizzle-orm';
import { getDB, type RegGroundDB } from '../db/connection.js';
import { decisionTraceEntries } from '../db/schema.js';
import type {
  DecisionTraceEntry,
  TraceContext,
  TraceEventInput,
} from './types.js';

const GENESIS_HASH = '0'.repeat(64);

/** Deterministic deep JSON serialization with sorted keys at every level. */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`;
}

/**
 * Append-only, hash-chained decision trace store. Every entry includes the
 * SHA-256 of the previous entry, forming a tamper-evident chain per process
 * instance.
 */
export class DecisionTraceService {
  private _db: RegGroundDB | null;
  constructor(db?: RegGroundDB) {
    this._db = db ?? null;
  }
  private get db(): RegGroundDB {
    if (!this._db) this._db = getDB();
    return this._db;
  }

  async startTrace(processInstanceId: string, tenantId: string, workspaceId?: string): Promise<TraceContext> {
    const traceId = randomUUID();
    const ctx: TraceContext = { processInstanceId, traceId, tenantId, workspaceId };
    await this.logEvent(ctx, {
      eventType: 'PROCESS_STARTED',
      actor: 'system',
      humanSummary: `Process ${processInstanceId} started`,
    });
    return ctx;
  }

  async logEvent(ctx: TraceContext, event: TraceEventInput): Promise<DecisionTraceEntry> {
    const previous = await this.db
      .select()
      .from(decisionTraceEntries)
      .where(eq(decisionTraceEntries.traceId, ctx.traceId))
      .orderBy(asc(decisionTraceEntries.sequenceNumber));

    const sequenceNumber = previous.length;
    const previousHash = previous.length === 0 ? GENESIS_HASH : previous[previous.length - 1]!.currentHash;

    const payload = {
      processInstanceId: ctx.processInstanceId,
      traceId: ctx.traceId,
      sequenceNumber,
      previousHash,
      eventType: event.eventType,
      actor: event.actor,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      decision: event.decision ?? null,
      inputData: event.inputData ?? {},
      outputData: event.outputData ?? {},
      reasons: event.reasons ?? [],
      humanSummary: event.humanSummary ?? null,
      regulatoryContext: event.regulatoryContext ?? {},
      evidenceJustification: event.evidenceJustification ?? {},
      complianceAssertion: event.complianceAssertion ?? {},
    };

    const currentHash = DecisionTraceService.computeHash(payload);

    const inserted = await this.db
      .insert(decisionTraceEntries)
      .values({
        processInstanceId: ctx.processInstanceId,
        tenantId: ctx.tenantId,
        traceId: ctx.traceId,
        sequenceNumber,
        previousHash,
        currentHash,
        eventType: event.eventType,
        actor: event.actor,
        entityType: event.entityType,
        entityId: event.entityId,
        decision: event.decision,
        inputData: event.inputData ?? {},
        outputData: event.outputData ?? {},
        reasons: event.reasons ?? [],
        humanSummary: event.humanSummary,
        regulatoryContext: event.regulatoryContext ?? {},
        evidenceJustification: event.evidenceJustification ?? {},
        complianceAssertion: event.complianceAssertion ?? {},
      })
      .returning();

    const row = inserted[0]!;
    return this.rowToEntry(row);
  }

  async getTraceChain(processInstanceId: string): Promise<DecisionTraceEntry[]> {
    const rows = await this.db
      .select()
      .from(decisionTraceEntries)
      .where(eq(decisionTraceEntries.processInstanceId, processInstanceId))
      .orderBy(asc(decisionTraceEntries.sequenceNumber));
    return rows.map((r) => this.rowToEntry(r));
  }

  async getTraceById(traceId: string): Promise<DecisionTraceEntry[]> {
    const rows = await this.db
      .select()
      .from(decisionTraceEntries)
      .where(eq(decisionTraceEntries.traceId, traceId))
      .orderBy(asc(decisionTraceEntries.sequenceNumber));
    return rows.map((r) => this.rowToEntry(r));
  }

  static computeHash(payload: Record<string, unknown>): string {
    return createHash('sha256').update(canonicalStringify(payload)).digest('hex');
  }

  static genesisHash(): string {
    return GENESIS_HASH;
  }

  private rowToEntry(row: typeof decisionTraceEntries.$inferSelect): DecisionTraceEntry {
    return {
      id: row.id,
      processInstanceId: row.processInstanceId,
      traceId: row.traceId,
      sequenceNumber: row.sequenceNumber,
      previousHash: row.previousHash,
      currentHash: row.currentHash,
      eventType: row.eventType,
      actor: row.actor,
      entityType: row.entityType ?? undefined,
      entityId: row.entityId ?? undefined,
      decision: row.decision ?? undefined,
      inputData: row.inputData as Record<string, unknown>,
      outputData: row.outputData as Record<string, unknown>,
      reasons: row.reasons as string[],
      humanSummary: row.humanSummary ?? undefined,
      regulatoryContext: row.regulatoryContext as Record<string, unknown>,
      evidenceJustification: row.evidenceJustification as Record<string, unknown>,
      complianceAssertion: row.complianceAssertion as Record<string, unknown>,
      createdAt: row.createdAt,
    };
  }
}
