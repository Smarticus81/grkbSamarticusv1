/**
 * MCP HTTP authentication middleware.
 * Validates Bearer tokens with `rg_` prefix against the api_keys table.
 */

import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { DBClient, ApiKeyRecord } from '../services/db-client.js';

export interface McpAuthRequest extends Request {
  apiKey?: {
    id: string;
    tenantId: string;
    scopes: string[];
    rateLimit: number;
  };
}

/**
 * Creates Express middleware that authenticates MCP requests via API key.
 *
 * Expects `Authorization: Bearer rg_<key>` header.
 * On success, attaches `req.apiKey` with tenant info and scopes.
 */
export function createMcpAuth(dbClient: DBClient) {
  return async (req: McpAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const header = req.header('authorization');

    if (!header?.startsWith('Bearer rg_')) {
      res.status(401).json({
        error: 'Missing or invalid API key',
        hint: 'Provide Authorization: Bearer rg_<your-key>',
      });
      return;
    }

    const rawKey = header.slice(7); // strip "Bearer "
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    let record: ApiKeyRecord | null;
    try {
      record = await dbClient.lookupApiKey(keyHash);
    } catch (error) {
      console.error('Auth DB lookup failed:', error);
      res.status(503).json({ error: 'Authentication service unavailable' });
      return;
    }

    if (!record) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    req.apiKey = {
      id: record.id,
      tenantId: record.tenantId,
      scopes: record.scopes,
      rateLimit: record.rateLimit,
    };

    next();
  };
}
