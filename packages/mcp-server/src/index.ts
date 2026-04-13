#!/usr/bin/env node
/**
 * Regulatory Ground MCP Server
 *
 * Exposes the obligation knowledge graph to any MCP-compatible AI agent.
 * Ground your agents in regulatory compliance — 303 obligations across
 * 7 regulations (EU MDR, ISO 13485, ISO 14971, 21 CFR 820, IMDRF, UK MDR, MDCG).
 *
 * Tools:
 *   - regground_discover_obligations: Auto-discover applicable obligations
 *   - regground_get_obligation: Look up a single obligation by ID
 *   - regground_explain_obligation: Full explanation with constraints, evidence, cross-refs
 *   - regground_search_obligations: Free-text search across all obligations
 *   - regground_get_evidence_requirements: Evidence types needed for a process
 *   - regground_find_obligation_path: Find regulatory cross-reference chain
 *   - regground_check_qualification: Pre-execution gate — can this process run?
 *   - regground_validate_compliance: Post-execution check — did the output comply?
 *   - regground_get_graph_stats: Graph summary stats
 *   - regground_list_process_types: Available process types
 *   - regground_list_jurisdictions: Available jurisdictions
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { z } from 'zod';
import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GraphClient } from './services/graph-client.js';

// ---- Config ----

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });
dotenv.config({ path: resolve(__dirname, '../.env') });
dotenv.config();

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USER;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'neo4j';

if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
  console.error('ERROR: NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD environment variables are required');
  process.exit(1);
}

const graph = new GraphClient(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE);
const CHARACTER_LIMIT = 25000;

// ---- Helpers ----

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT) + '\n\n[Response truncated. Use filters or pagination to narrow results.]';
}

function handleError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('ServiceUnavailable')) {
      return 'Error: Neo4j database is unavailable. Check your connection settings.';
    }
    if (error.message.includes('AuthenticationError')) {
      return 'Error: Neo4j authentication failed. Check NEO4J_USER and NEO4J_PASSWORD.';
    }
    return `Error: ${error.message}`;
  }
  return `Error: ${String(error)}`;
}

// ---- MCP Server Factory ----

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'regground-mcp-server',
    version: '0.1.0',
  });
  registerAllTools(server);
  return server;
}

function registerAllTools(server: McpServer): void {

// ========== TOOL 1: Discover Obligations ==========

server.registerTool(
  'regground_discover_obligations',
  {
    title: 'Discover Regulatory Obligations',
    description: `Discover all regulatory obligations applicable to given process types and jurisdictions.
This is the PRIMARY tool for grounding an agent — call it first to know what obligations your process must satisfy.

Returns: obligations, constraints, definitions, evidence types, and a human-readable summary.

Args:
  - process_types (string[]): Process types, e.g. ["CAPA", "COMPLAINT", "NONCONFORMANCE", "TREND_REPORTING", "CHANGE_CONTROL", "AUDIT"]
  - jurisdictions (string[]): Jurisdictions, e.g. ["FDA", "EU_MDR", "GLOBAL", "UK_MDR", "ISO_13485", "ISO_14971"]

Returns JSON: { obligations[], constraints[], definitions[], evidenceTypes[], summary }

Examples:
  - "What obligations apply to a CAPA in the EU?" → process_types=["CAPA"], jurisdictions=["EU_MDR"]
  - "What do I need for a complaint process under FDA and ISO?" → process_types=["COMPLAINT"], jurisdictions=["FDA","ISO_13485"]`,
    inputSchema: {
      process_types: z.array(z.string()).min(1).describe('Process types to discover obligations for'),
      jurisdictions: z.array(z.string()).min(1).describe('Jurisdictions to include'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ process_types, jurisdictions }) => {
    try {
      const scope = await graph.discoverObligations(process_types, jurisdictions);
      const output = JSON.stringify(scope, null, 2);
      return {
        content: [{ type: 'text', text: truncate(output) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: handleError(error) }] };
    }
  }
);

// ========== TOOL 2: Get Obligation ==========

server.registerTool(
  'regground_get_obligation',
  {
    title: 'Get Obligation by ID',
    description: `Look up a single regulatory obligation by its ID.

Args:
  - obligation_id (string): The obligation ID, e.g. "CFR820.100.OBL.001" or "EUMDR.ART.83.OBL.001"

Returns: Full obligation details including title, text, citation, jurisdiction, evidence types.
Returns null message if not found.`,
    inputSchema: {
      obligation_id: z.string().min(1).describe('Obligation ID to look up'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ obligation_id }) => {
    try {
      const obl = await graph.getObligation(obligation_id);
      if (!obl) {
        return { content: [{ type: 'text', text: `No obligation found with ID: ${obligation_id}` }] };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(obl, null, 2) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: handleError(error) }] };
    }
  }
);

// ========== TOOL 3: Explain Obligation ==========

server.registerTool(
  'regground_explain_obligation',
  {
    title: 'Explain Regulatory Obligation',
    description: `Get a full explanation of a regulatory obligation including its constraints, required evidence, parent obligations, cross-references, and a plain English breakdown.

Args:
  - obligation_id (string): The obligation ID to explain

Returns: { obligation, parents[], constraints[], requiredEvidence[], crossReferences[], plainEnglishChain[] }`,
    inputSchema: {
      obligation_id: z.string().min(1).describe('Obligation ID to explain'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ obligation_id }) => {
    try {
      const explanation = await graph.explainObligation(obligation_id);
      if (!explanation) {
        return { content: [{ type: 'text', text: `No obligation found with ID: ${obligation_id}` }] };
      }
      return {
        content: [{ type: 'text', text: truncate(JSON.stringify(explanation, null, 2)) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: handleError(error) }] };
    }
  }
);

// ========== TOOL 4: Search Obligations ==========

server.registerTool(
  'regground_search_obligations',
  {
    title: 'Search Obligations',
    description: `Free-text search across all obligations by title, text, ID, or citation.

Args:
  - query (string): Search term (case-insensitive, partial match)
  - limit (number): Max results, default 20

Examples:
  - "risk management" → obligations mentioning risk management
  - "CAPA" → CAPA-related obligations
  - "21 CFR" → FDA regulations`,
    inputSchema: {
      query: z.string().min(1).describe('Search query'),
      limit: z.number().int().min(1).max(100).default(20).describe('Maximum results'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ query, limit }) => {
    try {
      const results = await graph.searchObligations(query, limit);
      const output = { total: results.length, obligations: results };
      return {
        content: [{ type: 'text', text: truncate(JSON.stringify(output, null, 2)) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: handleError(error) }] };
    }
  }
);

// ========== TOOL 5: Evidence Requirements ==========

server.registerTool(
  'regground_get_evidence_requirements',
  {
    title: 'Get Evidence Requirements',
    description: `Get all required evidence types for mandatory obligations in a process/jurisdiction.
Use this to know what evidence your agent must produce or reference.

Args:
  - process_type (string): Process type
  - jurisdiction (string): Jurisdiction

Returns: Array of { obligationId, title, evidenceTypes[] }`,
    inputSchema: {
      process_type: z.string().min(1).describe('Process type'),
      jurisdiction: z.string().min(1).describe('Jurisdiction'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ process_type, jurisdiction }) => {
    try {
      const requirements = await graph.getEvidenceRequirements(process_type, jurisdiction);
      return {
        content: [{ type: 'text', text: truncate(JSON.stringify(requirements, null, 2)) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: handleError(error) }] };
    }
  }
);

// ========== TOOL 6: Find Obligation Path ==========

server.registerTool(
  'regground_find_obligation_path',
  {
    title: 'Find Obligation Path',
    description: `Find the shortest regulatory cross-reference chain between two obligations.
Useful for understanding how regulations connect (e.g., how an ISO 14971 risk obligation relates to a 21 CFR 820 CAPA obligation).

Args:
  - from_id (string): Starting obligation ID
  - to_id (string): Target obligation ID

Returns: { path: obligationId[], relationships: relType[] } or null if no path exists.`,
    inputSchema: {
      from_id: z.string().min(1).describe('Starting obligation ID'),
      to_id: z.string().min(1).describe('Target obligation ID'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ from_id, to_id }) => {
    try {
      const path = await graph.findObligationPath(from_id, to_id);
      if (!path) {
        return { content: [{ type: 'text', text: `No path found between ${from_id} and ${to_id}` }] };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(path, null, 2) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: handleError(error) }] };
    }
  }
);

// ========== TOOL 7: Check Qualification ==========

server.registerTool(
  'regground_check_qualification',
  {
    title: 'Check Agent Qualification',
    description: `Pre-execution gate: check if an agent/process can run given available evidence.
Returns QUALIFIED if all mandatory obligations have their required evidence types available, BLOCKED otherwise.

Call this BEFORE executing a compliance-sensitive process to ensure you have what you need.

Args:
  - process_type (string): Process type
  - jurisdiction (string): Jurisdiction
  - available_evidence (string[]): Evidence types currently available

Returns: { status: "QUALIFIED"|"BLOCKED", mandatoryTotal, mandatoryCovered, missingObligations[], blockingErrors[] }`,
    inputSchema: {
      process_type: z.string().min(1).describe('Process type'),
      jurisdiction: z.string().min(1).describe('Jurisdiction'),
      available_evidence: z.array(z.string()).describe('Evidence types currently available'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ process_type, jurisdiction, available_evidence }) => {
    try {
      const result = await graph.checkQualification(process_type, jurisdiction, available_evidence);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: handleError(error) }] };
    }
  }
);

// ========== TOOL 8: Validate Compliance ==========

server.registerTool(
  'regground_validate_compliance',
  {
    title: 'Validate Compliance',
    description: `Post-execution check: validate that an agent's output addresses the required regulatory obligations.
Returns a compliance score (0-1), lists of satisfied/unsatisfied obligations, warnings, and a SHA-256 signature.

Call this AFTER your agent produces output to verify regulatory compliance.

Args:
  - addressed_obligation_ids (string[]): Obligation IDs the output claims to address
  - process_type (string): Process type
  - jurisdiction (string): Jurisdiction

Returns: { valid: boolean, score: number, satisfied[], unsatisfied[], warnings[], signatureHash }`,
    inputSchema: {
      addressed_obligation_ids: z.array(z.string()).min(1).describe('Obligation IDs addressed by the output'),
      process_type: z.string().min(1).describe('Process type'),
      jurisdiction: z.string().min(1).describe('Jurisdiction'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ addressed_obligation_ids, process_type, jurisdiction }) => {
    try {
      const result = await graph.validateCompliance(addressed_obligation_ids, process_type, jurisdiction);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: handleError(error) }] };
    }
  }
);

// ========== TOOL 9: Graph Stats ==========

server.registerTool(
  'regground_get_graph_stats',
  {
    title: 'Get Graph Statistics',
    description: `Get summary statistics about the obligation knowledge graph: counts of obligations, constraints, definitions, evidence types, and lists of jurisdictions, process types, and regulations covered.`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    try {
      const stats = await graph.getStats();
      return {
        content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: handleError(error) }] };
    }
  }
);

// ========== TOOL 10: List Process Types ==========

server.registerTool(
  'regground_list_process_types',
  {
    title: 'List Process Types',
    description: `List all process types available in the obligation graph.
Use this to discover what process types you can query for obligations.

Returns: string[] of process types (e.g., "CAPA", "COMPLAINT", "NONCONFORMANCE", etc.)`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    try {
      const types = await graph.listProcessTypes();
      return {
        content: [{ type: 'text', text: JSON.stringify(types, null, 2) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: handleError(error) }] };
    }
  }
);

// ========== TOOL 11: List Jurisdictions ==========

server.registerTool(
  'regground_list_jurisdictions',
  {
    title: 'List Jurisdictions',
    description: `List all jurisdictions in the obligation graph.
Returns: string[] of jurisdictions (e.g., "FDA", "EU_MDR", "GLOBAL", "UK_MDR", etc.)`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    try {
      const jurisdictions = await graph.listJurisdictions();
      return {
        content: [{ type: 'text', text: JSON.stringify(jurisdictions, null, 2) }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: handleError(error) }] };
    }
  }
);

} // end registerAllTools

// ---- Transport ----

async function runStdio(): Promise<void> {
  const stdioServer = createMcpServer();
  const transport = new StdioServerTransport();
  await stdioServer.connect(transport);
  console.error('Regulatory Ground MCP server running via stdio');
  console.error(`Connected to Neo4j: ${NEO4J_URI}`);
}

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  // For stateless JSON mode, each request needs a fresh McpServer+transport pair
  // since the McpServer can only connect to one transport
  app.post('/mcp', async (req, res) => {
    try {
      const perRequestServer = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => transport.close());
      await perRequestServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP request error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Health check
  app.get('/health', async (_req, res) => {
    try {
      const stats = await graph.getStats();
      res.json({ status: 'healthy', obligations: stats.obligationCount, jurisdictions: stats.jurisdictions });
    } catch {
      res.status(503).json({ status: 'unhealthy', error: 'Cannot connect to Neo4j' });
    }
  });

  const port = parseInt(process.env.MCP_PORT || process.env.PORT || '3100');
  app.listen(port, () => {
    console.error(`Regulatory Ground MCP server running on http://localhost:${port}/mcp`);
    console.error(`Health check: http://localhost:${port}/health`);
  });
}

// ---- Main ----

const transport = process.env.MCP_TRANSPORT || process.argv[2] || 'stdio';

if (transport === 'http') {
  runHTTP().catch(error => {
    console.error('Server error:', error);
    process.exit(1);
  });
} else {
  runStdio().catch(error => {
    console.error('Server error:', error);
    process.exit(1);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await graph.close();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await graph.close();
  process.exit(0);
});
