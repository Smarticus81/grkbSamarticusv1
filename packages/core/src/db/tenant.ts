import { sql } from 'drizzle-orm';
import type { RegGroundDB } from './connection.js';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction, QueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema.js';

type DrizzleTransaction = PgTransaction<
  QueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type TenantTransaction = DrizzleTransaction;

/**
 * Execute a function within a tenant-scoped transaction.
 *
 * Sets `app.tenant_id` as a LOCAL session variable so that
 * Postgres RLS policies can enforce row-level tenant isolation.
 * The setting is automatically rolled back when the transaction ends.
 */
export async function withTenant<T>(
  db: RegGroundDB,
  tenantId: string,
  fn: (tx: DrizzleTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Use set_config(name, value, is_local=true) rather than `SET LOCAL ... = $1`.
    // Postgres's SET command does not accept bind parameters, so a parameterized
    // SET raises `syntax error at or near "$1"`. set_config is a function and
    // binds normally; is_local=true scopes it to the current transaction.
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
