#!/usr/bin/env node

/**
 * check-tenancy.mjs
 *
 * Connects to Postgres and verifies that every customer-data table:
 *   1. Has a `tenant_id` column
 *   2. Has RLS enabled
 *
 * Exits with code 1 if any violations are found.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/check-tenancy.mjs
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

// Tables that must have tenant_id + RLS.
// These are the customer-data tables; excludes reference/global tables
// like obligations, process_definitions, tenants, users, tenant_memberships.
const TENANT_SCOPED_TABLES = [
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
];

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  const violations = [];

  // 1. Check tenant_id column exists on each table
  for (const table of TENANT_SCOPED_TABLES) {
    const colResult = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenant_id'`,
      [table],
    );
    if (colResult.rows.length === 0) {
      violations.push(`MISSING tenant_id column on table: ${table}`);
    }
  }

  // 2. Check RLS is enabled on each table
  for (const table of TENANT_SCOPED_TABLES) {
    const rlsResult = await client.query(
      `SELECT relrowsecurity FROM pg_class
       WHERE relname = $1 AND relnamespace = (
         SELECT oid FROM pg_namespace WHERE nspname = 'public'
       )`,
      [table],
    );
    if (rlsResult.rows.length === 0) {
      violations.push(`TABLE NOT FOUND: ${table}`);
    } else if (!rlsResult.rows[0].relrowsecurity) {
      violations.push(`RLS NOT ENABLED on table: ${table}`);
    }
  }

  await client.end();

  if (violations.length > 0) {
    console.error('Tenancy check FAILED. Violations:\n');
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
    console.error(`\n${violations.length} violation(s) found.`);
    process.exit(1);
  }

  console.log(`Tenancy check PASSED. All ${TENANT_SCOPED_TABLES.length} tables have tenant_id and RLS enabled.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
