/**
 * Usage logger for MCP enterprise mode.
 * Logs tool invocations to the usage_events table for billing and audit.
 */

import type { DBClient, UsageEvent } from '../services/db-client.js';
import type { McpAuthRequest } from './auth.js';

export interface UsageLogEntry {
  toolName: string;
  latencyMs: number;
  status: string;
}

/**
 * Creates a usage logger function bound to a DBClient.
 * Logs are fire-and-forget — failures are logged to stderr but never block responses.
 */
export function createUsageLogger(dbClient: DBClient) {
  return async (
    req: McpAuthRequest,
    toolName: string,
    latencyMs: number,
    status: string,
  ): Promise<void> => {
    if (!req.apiKey) return;

    const event: UsageEvent = {
      tenantId: req.apiKey.tenantId,
      apiKeyId: req.apiKey.id,
      toolName,
      latencyMs,
      status,
      requestId: req.header('x-request-id') ?? 'unknown',
      occurredAt: new Date(),
    };

    try {
      await dbClient.recordUsage(event);
    } catch (error) {
      // Fire-and-forget: never block the MCP response for usage logging failures
      console.error('Usage logging failed:', error);
    }
  };
}
