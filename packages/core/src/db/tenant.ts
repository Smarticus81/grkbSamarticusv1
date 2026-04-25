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
    await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`);
    return fn(tx);
  });
}
