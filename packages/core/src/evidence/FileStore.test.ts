import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateWorkspaceFileName } from './FileStore.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('FileStore workspace safety', () => {
  it('rejects file names that can escape a workspace storage directory', () => {
    expect(validateWorkspaceFileName(' complaints.csv ')).toBe('complaints.csv');

    for (const name of ['', '   ', '.', '..', '../secret.txt', '..\\secret.txt', 'nested/file.csv', 'nested\\file.csv', 'bad\0name']) {
      expect(() => validateWorkspaceFileName(name), name).toThrow('Invalid workspace file name');
    }
  });

  it('keeps every file read/list/delete query scoped to tenant ownership', () => {
    const source = readFileSync(join(here, 'FileStore.ts'), 'utf8');

    expect(source).toContain('async getByFileId(fileId: string, scope: FileScope)');
    expect(source).toContain('async readContent(fileId: string, scope: FileScope)');
    expect(source).toContain('async deleteFile(fileId: string, scope: FileScope)');
    expect(source).toContain('async getMultipleByFileIds(fileIds: string[], scope: FileScope)');
    expect(source).toContain('async listByWorkspace(workspaceId: string, tenantId: string)');
    expect(source).toContain('eq(workspaceFiles.tenantId, scope.tenantId)');
    expect(source).toContain('eq(workspaceFiles.workspaceId, scope.workspaceId)');
    expect(source).toContain('eq(workspaceFiles.workspaceId, workspaceId), eq(workspaceFiles.tenantId, tenantId)');
    expect(source).not.toContain('const rows = await this.db.select().from(workspaceFiles);');
  });
});
