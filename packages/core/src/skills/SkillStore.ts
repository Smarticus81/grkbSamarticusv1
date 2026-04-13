import { createHash, randomUUID } from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { getDB, type RegGroundDB } from '../db/connection.js';
import { skills, skillVersions, type SkillRow, type SkillVersionRow } from '../db/schema.js';

export interface SkillDefinition {
  triggers: string[];
  instructions: string;
  schema?: Record<string, unknown>;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  tags: string[];
  author: string;
  latestVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillVersionRecord {
  id: string;
  skillId: string;
  versionTag: string;
  definition: SkillDefinition;
  rawContent: string | null;
  fileHash: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface CreateSkillInput {
  name: string;
  description: string;
  tags?: string[];
  author: string;
  definition: SkillDefinition;
  rawContent?: string;
}

export interface CreateVersionInput {
  definition: SkillDefinition;
  rawContent?: string;
}

/**
 * Manages the skill library: CRUD for skills and their versions.
 * Skills are versioned capability packages that can be attached to agents.
 */
export class SkillStore {
  private db: RegGroundDB;

  constructor(db?: RegGroundDB) {
    this.db = db ?? getDB();
  }

  async create(input: CreateSkillInput): Promise<SkillRecord & { version: SkillVersionRecord }> {
    const now = new Date();
    const versionTag = this.generateVersionTag();
    const content = input.rawContent ?? JSON.stringify(input.definition);
    const fileHash = createHash('sha256').update(content).digest('hex');
    const sizeBytes = Buffer.byteLength(content, 'utf-8');

    // Insert skill first
    const [skillRow] = await this.db
      .insert(skills)
      .values({
        name: input.name,
        description: input.description,
        tags: input.tags ?? [],
        author: input.author,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Insert first version
    const [versionRow] = await this.db
      .insert(skillVersions)
      .values({
        skillId: skillRow!.id,
        versionTag,
        definition: input.definition,
        rawContent: input.rawContent ?? null,
        fileHash,
        sizeBytes,
        createdAt: now,
      })
      .returning();

    // Update latestVersionId
    await this.db
      .update(skills)
      .set({ latestVersionId: versionRow!.id, updatedAt: now })
      .where(eq(skills.id, skillRow!.id));

    return {
      ...this.rowToSkill({ ...skillRow!, latestVersionId: versionRow!.id }),
      version: this.rowToVersion(versionRow!),
    };
  }

  async list(): Promise<SkillRecord[]> {
    const rows = await this.db.select().from(skills).orderBy(skills.createdAt);
    return rows.map((r) => this.rowToSkill(r));
  }

  async getById(id: string): Promise<SkillRecord | null> {
    const rows = await this.db.select().from(skills).where(eq(skills.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.rowToSkill(rows[0]!);
  }

  async getByName(name: string): Promise<SkillRecord | null> {
    const rows = await this.db.select().from(skills).where(eq(skills.name, name)).limit(1);
    if (rows.length === 0) return null;
    return this.rowToSkill(rows[0]!);
  }

  async deleteSkill(id: string): Promise<boolean> {
    // Cascade deletes versions (FK onDelete: 'cascade')
    const result = await this.db.delete(skills).where(eq(skills.id, id)).returning();
    return result.length > 0;
  }

  async listVersions(skillId: string): Promise<SkillVersionRecord[]> {
    const rows = await this.db
      .select()
      .from(skillVersions)
      .where(eq(skillVersions.skillId, skillId))
      .orderBy(desc(skillVersions.createdAt));
    return rows.map((r) => this.rowToVersion(r));
  }

  async getVersion(versionId: string): Promise<SkillVersionRecord | null> {
    const rows = await this.db
      .select()
      .from(skillVersions)
      .where(eq(skillVersions.id, versionId))
      .limit(1);
    if (rows.length === 0) return null;
    return this.rowToVersion(rows[0]!);
  }

  async getLatestVersion(skillId: string): Promise<SkillVersionRecord | null> {
    const skill = await this.getById(skillId);
    if (!skill?.latestVersionId) return null;
    return this.getVersion(skill.latestVersionId);
  }

  async addVersion(skillId: string, input: CreateVersionInput): Promise<SkillVersionRecord> {
    const now = new Date();
    const versionTag = this.generateVersionTag();
    const content = input.rawContent ?? JSON.stringify(input.definition);
    const fileHash = createHash('sha256').update(content).digest('hex');
    const sizeBytes = Buffer.byteLength(content, 'utf-8');

    const [versionRow] = await this.db
      .insert(skillVersions)
      .values({
        skillId,
        versionTag,
        definition: input.definition,
        rawContent: input.rawContent ?? null,
        fileHash,
        sizeBytes,
        createdAt: now,
      })
      .returning();

    // Update skill's latestVersionId
    await this.db
      .update(skills)
      .set({ latestVersionId: versionRow!.id, updatedAt: now })
      .where(eq(skills.id, skillId));

    return this.rowToVersion(versionRow!);
  }

  /**
   * Resolve skill IDs (with optional @versionTag pinning) to definitions.
   * Format: "skillId" (latest) or "skillId@versionTag" (pinned)
   */
  async resolveSkills(
    skillRefs: string[],
  ): Promise<Array<{ skill: SkillRecord; version: SkillVersionRecord }>> {
    const results: Array<{ skill: SkillRecord; version: SkillVersionRecord }> = [];

    for (const ref of skillRefs) {
      const [skillId, versionTag] = ref.includes('@') ? ref.split('@') : [ref, undefined];
      const skill = await this.getById(skillId!);
      if (!skill) continue;

      let version: SkillVersionRecord | null = null;
      if (versionTag) {
        const versions = await this.listVersions(skill.id);
        version = versions.find((v) => v.versionTag === versionTag) ?? null;
      } else {
        version = await this.getLatestVersion(skill.id);
      }
      if (version) {
        results.push({ skill, version });
      }
    }

    return results;
  }

  private generateVersionTag(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  private rowToSkill(row: SkillRow): SkillRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tags: row.tags,
      author: row.author,
      latestVersionId: row.latestVersionId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private rowToVersion(row: SkillVersionRow): SkillVersionRecord {
    return {
      id: row.id,
      skillId: row.skillId,
      versionTag: row.versionTag,
      definition: row.definition as SkillDefinition,
      rawContent: row.rawContent,
      fileHash: row.fileHash,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt,
    };
  }
}
