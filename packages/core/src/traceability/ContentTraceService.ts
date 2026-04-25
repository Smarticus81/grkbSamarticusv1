import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDB, type RegGroundDB } from '../db/connection.js';
import { contentTraces } from '../db/schema.js';
import type { ContentTraceInput } from './types.js';

/**
 * Element-level traces capturing HOW/WHY/WHAT for individual content units
 * (e.g., a single sentence in a generated narrative, a single calculation).
 */
export class ContentTraceService {
  constructor(private readonly db: RegGroundDB = getDB()) {}

  async log(input: ContentTraceInput & { content: string }): Promise<void> {
    const contentHash = createHash('sha256').update(input.content).digest('hex');
    await this.db.insert(contentTraces).values({
      tenantId: input.tenantId,
      processInstanceId: input.processInstanceId,
      stepId: input.stepId,
      contentType: input.contentType,
      contentId: input.contentId,
      contentIndex: input.contentIndex ?? 0,
      contentPreview: input.content.slice(0, 500),
      contentHash,
      rationale: input.rationale,
      methodology: input.methodology,
      standardReference: input.standardReference,
      evidenceType: input.evidenceType,
      atomIds: input.atomIds ?? [],
      obligationId: input.obligationId,
      obligationTitle: input.obligationTitle,
      agentId: input.agentId,
      agentName: input.agentName,
    });
  }

  async forProcessInstance(processInstanceId: string) {
    return this.db
      .select()
      .from(contentTraces)
      .where(eq(contentTraces.processInstanceId, processInstanceId));
  }
}
