import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, and } from 'drizzle-orm';
import { getDB, type RegGroundDB } from '../db/connection.js';
import { workspaceFiles, type WorkspaceFileRow } from '../db/schema.js';

export interface FileUploadInput {
  workspaceId: string;
  tenantId: string;
  name: string;
  mimeType: string;
  data: Buffer;
  metadata?: Record<string, unknown>;
}

export interface FileRecord {
  id: string;
  workspaceId: string;
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Workspace-scoped file storage.
 * Writes raw files to disk at {basePath}/{workspaceId}/{fileId}/{filename}.
 * Metadata + references stored in PostgreSQL via Drizzle.
 */
export class FileStore {
  private db: RegGroundDB;
  private basePath: string;

  constructor(db?: RegGroundDB, basePath?: string) {
    this.db = db ?? getDB();
    this.basePath = basePath ?? process.env.FILE_STORE_PATH ?? './uploads';
  }

  async upload(input: FileUploadInput): Promise<FileRecord> {
    const fileId = `file-${randomUUID().slice(0, 12)}`;
    const contentHash = createHash('sha256').update(input.data).digest('hex');
    const dir = join(this.basePath, input.workspaceId, fileId);
    await mkdir(dir, { recursive: true });
    const storageKey = join(dir, input.name);
    await writeFile(storageKey, input.data);

    const [row] = await this.db
      .insert(workspaceFiles)
      .values({
        workspaceId: input.workspaceId,
        tenantId: input.tenantId,
        fileId,
        name: input.name,
        mimeType: input.mimeType,
        sizeBytes: input.data.length,
        contentHash,
        storageKey,
        metadata: input.metadata ?? {},
      })
      .returning();

    return this.rowToRecord(row!);
  }

  async getByFileId(fileId: string): Promise<FileRecord | null> {
    const rows = await this.db
      .select()
      .from(workspaceFiles)
      .where(eq(workspaceFiles.fileId, fileId))
      .limit(1);
    if (rows.length === 0) return null;
    return this.rowToRecord(rows[0]!);
  }

  async listByWorkspace(workspaceId: string): Promise<FileRecord[]> {
    const rows = await this.db
      .select()
      .from(workspaceFiles)
      .where(eq(workspaceFiles.workspaceId, workspaceId))
      .orderBy(workspaceFiles.createdAt);
    return rows.map((r) => this.rowToRecord(r));
  }

  async readContent(fileId: string): Promise<Buffer | null> {
    const record = await this.getByFileId(fileId);
    if (!record) return null;
    const row = await this.db
      .select()
      .from(workspaceFiles)
      .where(eq(workspaceFiles.fileId, fileId))
      .limit(1);
    if (row.length === 0) return null;
    try {
      return await readFile(row[0]!.storageKey);
    } catch {
      return null;
    }
  }

  async deleteFile(fileId: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(workspaceFiles)
      .where(eq(workspaceFiles.fileId, fileId))
      .limit(1);
    if (rows.length === 0) return false;
    const row = rows[0]!;

    // Remove from disk (best-effort)
    try {
      await unlink(row.storageKey);
    } catch {
      // File may already be gone
    }

    const deleted = await this.db
      .delete(workspaceFiles)
      .where(eq(workspaceFiles.fileId, fileId))
      .returning();
    return deleted.length > 0;
  }

  async getMultipleByFileIds(fileIds: string[]): Promise<FileRecord[]> {
    if (fileIds.length === 0) return [];
    const rows = await this.db.select().from(workspaceFiles);
    return rows
      .filter((r) => fileIds.includes(r.fileId))
      .map((r) => this.rowToRecord(r));
  }

  private rowToRecord(row: WorkspaceFileRow): FileRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      fileId: row.fileId,
      name: row.name,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      contentHash: row.contentHash,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
  }
}
