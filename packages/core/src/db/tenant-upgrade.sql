-- Tenant identity upgrade for runtime tenant keys.
--
-- Apply after drizzle schema push when upgrading an existing database:
--   pnpm --filter @regground/core db:tenant-upgrade
--
-- app.tenant_id is the runtime tenant key used by auth/RLS:
--   - Clerk organization workspace: org_id
--   - Personal workspace: Clerk user sub
--
-- Historical tenant rows may only have clerk_org_id. This script backfills
-- tenant_key safely before enforcing NOT NULL + uniqueness.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tenant_key varchar(128);

UPDATE tenants
SET tenant_key = COALESCE(clerk_org_id, id::text)
WHERE tenant_key IS NULL OR tenant_key = '';

ALTER TABLE tenants
  ALTER COLUMN tenant_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_tenant_key_unique
  ON tenants (tenant_key);
