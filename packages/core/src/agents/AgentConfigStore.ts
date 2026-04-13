import { eq } from 'drizzle-orm';
import { getDB, type RegGroundDB } from '../db/connection.js';
import { agentConfigs, type AgentConfigRow } from '../db/schema.js';
import { AgentConfigSchema, type AgentConfig, type CreateAgentConfig } from './AgentConfig.js';

/**
 * CRUD store for agent configurations in PostgreSQL via Drizzle.
 */
export class AgentConfigStore {
  private db: RegGroundDB;

  constructor(db?: RegGroundDB) {
    this.db = db ?? getDB();
  }

  async create(input: CreateAgentConfig): Promise<AgentConfig> {
    const [row] = await this.db
      .insert(agentConfigs)
      .values({
        name: input.name,
        description: input.description,
        version: input.version,
        task: input.task,
        processTypes: input.processTypes,
        jurisdictions: input.jurisdictions,
        persona: input.persona,
        systemPrompt: input.systemPrompt,
        inputSchema: input.inputSchema as Record<string, unknown>,
        outputSchema: input.outputSchema as Record<string, unknown>,
        attachedFileIds: input.attachedFileIds ?? [],
        attachedSkillIds: input.attachedSkillIds ?? [],
      })
      .returning();
    return this.rowToConfig(row!);
  }

  async getById(id: string): Promise<AgentConfig | null> {
    const rows = await this.db
      .select()
      .from(agentConfigs)
      .where(eq(agentConfigs.id, id))
      .limit(1);
    if (rows.length === 0) return null;
    return this.rowToConfig(rows[0]!);
  }

  async list(): Promise<AgentConfig[]> {
    const rows = await this.db.select().from(agentConfigs).orderBy(agentConfigs.createdAt);
    return rows.map((r) => this.rowToConfig(r));
  }

  async update(id: string, input: Partial<CreateAgentConfig>): Promise<AgentConfig | null> {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) values.name = input.name;
    if (input.description !== undefined) values.description = input.description;
    if (input.version !== undefined) values.version = input.version;
    if (input.task !== undefined) values.task = input.task;
    if (input.processTypes !== undefined) values.processTypes = input.processTypes;
    if (input.jurisdictions !== undefined) values.jurisdictions = input.jurisdictions;
    if (input.persona !== undefined) values.persona = input.persona;
    if (input.systemPrompt !== undefined) values.systemPrompt = input.systemPrompt;
    if (input.inputSchema !== undefined) values.inputSchema = input.inputSchema;
    if (input.outputSchema !== undefined) values.outputSchema = input.outputSchema;
    if (input.attachedFileIds !== undefined) values.attachedFileIds = input.attachedFileIds;
    if (input.attachedSkillIds !== undefined) values.attachedSkillIds = input.attachedSkillIds;

    const [row] = await this.db
      .update(agentConfigs)
      .set(values)
      .where(eq(agentConfigs.id, id))
      .returning();
    if (!row) return null;
    return this.rowToConfig(row);
  }

  async updateDiscoveredObligations(id: string, obligationIds: string[]): Promise<void> {
    await this.db
      .update(agentConfigs)
      .set({ discoveredObligationIds: obligationIds, updatedAt: new Date() })
      .where(eq(agentConfigs.id, id));
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(agentConfigs).where(eq(agentConfigs.id, id)).returning();
    return result.length > 0;
  }

  private rowToConfig(row: AgentConfigRow): AgentConfig {
    return AgentConfigSchema.parse({
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      task: row.task,
      processTypes: row.processTypes,
      jurisdictions: row.jurisdictions,
      persona: row.persona,
      systemPrompt: row.systemPrompt,
      inputSchema: row.inputSchema,
      outputSchema: row.outputSchema,
      attachedFileIds: row.attachedFileIds,
      attachedSkillIds: row.attachedSkillIds,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
