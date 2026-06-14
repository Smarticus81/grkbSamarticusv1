import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const coreRoot = join(here, '../..');

const requiredTenantTables = [
  'workspaces',
  'process_instances',
  'decision_trace_entries',
  'content_traces',
  'evidence_atoms',
  'workspace_files',
  'hitl_gates',
  'qualification_reports',
  'usage_events',
  'tenant_quotas',
  'api_keys',
  'builder_agents',
  'process_workflows',
  'grounded_runs',
  'managed_agent_runs',
  'psur_runs',
];

const nullableTenantCatalogTables = [
  'agent_registrations',
  'skills',
  'skill_versions',
  'agent_configs',
];

describe('tenant row-level security policy coverage', () => {
  it('enables tenant isolation for every persisted workspace/runtime table', () => {
    const schema = readFileSync(join(here, 'schema.ts'), 'utf8');
    const rls = readFileSync(join(here, 'rls.sql'), 'utf8');

    for (const table of requiredTenantTables) {
      expect(schema, `schema declares ${table}`).toContain(`'${table}'`);
      expect(rls, `RLS enabled for ${table}`).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(rls, `RLS forced for ${table}`).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
      expect(rls, `tenant policy exists for ${table}`).toContain(`CREATE POLICY tenant_isolation_${table} ON ${table}`);
      expect(rls, `tenant policy scopes ${table} to app.tenant_id`).toContain(
        table === 'tenant_quotas'
          ? "tenants.tenant_key = current_setting('app.tenant_id')::text"
          : "USING (tenant_id = current_setting('app.tenant_id')::text)",
      );
      expect(rls, `tenant writes are checked for ${table}`).toContain(
        table === 'tenant_quotas'
          ? "tenants.id = tenant_quotas.tenant_id"
          : "WITH CHECK (tenant_id = current_setting('app.tenant_id')::text)",
      );
    }
  });

  it('allows shared catalog reads but restricts catalog writes to the active tenant', () => {
    const schema = readFileSync(join(here, 'schema.ts'), 'utf8');
    const rls = readFileSync(join(here, 'rls.sql'), 'utf8');

    for (const table of nullableTenantCatalogTables) {
      expect(schema, `schema declares ${table}`).toContain(`'${table}'`);
      expect(rls, `RLS enabled for ${table}`).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      expect(rls, `RLS forced for ${table}`).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
      expect(rls, `shared read policy exists for ${table}`).toContain(`CREATE POLICY tenant_select_${table} ON ${table}`);
      expect(rls, `shared rows remain readable for ${table}`).toContain(
        "USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id')::text)",
      );
      expect(rls, `tenant insert policy exists for ${table}`).toContain(`CREATE POLICY tenant_insert_${table} ON ${table}`);
      expect(rls, `tenant update policy exists for ${table}`).toContain(`CREATE POLICY tenant_update_${table} ON ${table}`);
      expect(rls, `tenant delete policy exists for ${table}`).toContain(`CREATE POLICY tenant_delete_${table} ON ${table}`);
      expect(rls, `catalog writes are tenant-owned for ${table}`).toContain(
        "WITH CHECK (tenant_id = current_setting('app.tenant_id')::text)",
      );
    }
  });

  it('ships a deployable tenant-key upgrade before RLS is applied', () => {
    const schema = readFileSync(join(here, 'schema.ts'), 'utf8');
    const upgrade = readFileSync(join(here, 'tenant-upgrade.sql'), 'utf8');
    const pkg = readFileSync(join(coreRoot, 'package.json'), 'utf8');

    expect(schema).toContain("tenantKey: varchar('tenant_key'");
    expect(upgrade).toContain('ADD COLUMN IF NOT EXISTS tenant_key varchar(128)');
    expect(upgrade).toContain('SET tenant_key = COALESCE(clerk_org_id, id::text)');
    expect(upgrade).toContain('ALTER COLUMN tenant_key SET NOT NULL');
    expect(upgrade).toContain('CREATE UNIQUE INDEX IF NOT EXISTS tenants_tenant_key_unique');
    expect(pkg).toContain('"db:tenant-upgrade": "tsx src/db/apply-sql.cli.ts src/db/tenant-upgrade.sql"');
    expect(pkg).toContain('"db:rls": "tsx src/db/apply-sql.cli.ts src/db/rls.sql"');
    expect(pkg).toContain('"db:secure": "pnpm db:push && pnpm db:tenant-upgrade && pnpm db:rls"');
  });
});
