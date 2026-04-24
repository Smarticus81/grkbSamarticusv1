/**
 * Standalone Postgres client for MCP enterprise features.
 * Zero dependency on @regground/core — uses `pg` directly.
 * Only touches `api_keys` and `usage_events` tables.
 */

import pg from 'pg';

// ---- Types ----

export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  scopes: string[];
  rateLimit: number;
  expiresAt: Date | null;
}

export interface UsageEvent {
  tenantId: string;
  apiKeyId: string;
  toolName: string;
  latencyMs: number;
  status: string;
  requestId: string;
  occurredAt: Date;
}

// ---- Client ----

export class DBClient {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
  }

  /**
   * Look up an API key by its SHA-256 hash.
   * Returns null if not found, inactive, or expired.
   */
  async lookupApiKey(keyHash: string): Promise<ApiKeyRecord | null> {
    const result = await this.pool.query<{
      id: string;
      tenant_id: string;
      scopes: string[];
      rate_limit: number;
      expires_at: Date | null;
    }>(
      `SELECT id, tenant_id, scopes, rate_limit, expires_at
       FROM api_keys
       WHERE key_hash = $1 AND active = true`,
      [keyHash],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    // Check expiry
    if (row.expires_at && row.expires_at.getTime() < Date.now()) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      scopes: row.scopes,
      rateLimit: row.rate_limit,
      expiresAt: row.expires_at,
    };
  }

  /**
   * Record a usage event for billing and audit.
   */
  async recordUsage(event: UsageEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO usage_events (tenant_id, api_key_id, tool_name, latency_ms, status, request_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.tenantId,
        event.apiKeyId,
        event.toolName,
        event.latencyMs,
        event.status,
        event.requestId,
        event.occurredAt,
      ],
    );
  }

  /**
   * Gracefully close the connection pool.
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
