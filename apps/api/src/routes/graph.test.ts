import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('graph route authorization boundaries', () => {
  it('keeps shared regulatory graph writes behind platform-admin authorization', () => {
    const source = readFileSync(join(here, 'graph.ts'), 'utf8');

    expect(source).toContain("import { requirePlatformAdmin } from '../middleware/auth.js';");
    expect(source).toContain("router.post('/obligations', requirePlatformAdmin");
    expect(source).toContain("router.delete('/obligations/:id', requirePlatformAdmin");
  });
});
