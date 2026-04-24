import { z } from 'zod';

/**
 * Canonical scope definitions for Regulatory Ground API keys.
 *
 * This is the single source of truth — imported by the API, MCP server,
 * and any middleware that validates key permissions.
 */
export const VALID_SCOPES = [
  'graph:read',
  'graph:validate',
  'trace:write',
  'trace:read',
  'sandbox:run',
  'admin:keys',
  'admin:platform-skills',
] as const;

export const ScopeSchema = z.enum(VALID_SCOPES);

export type Scope = z.infer<typeof ScopeSchema>;
