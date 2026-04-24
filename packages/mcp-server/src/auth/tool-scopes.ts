/**
 * Tool-to-scope mapping for MCP enterprise authorization.
 *
 * Each MCP tool requires a specific scope. API keys are granted scopes
 * at creation time. The `admin:keys` scope acts as a superuser bypass.
 */

export const TOOL_SCOPE_MAP: Record<string, string> = {
  regground_discover_obligations: 'graph:read',
  regground_get_obligation: 'graph:read',
  regground_explain_obligation: 'graph:read',
  regground_search_obligations: 'graph:read',
  regground_get_evidence_requirements: 'graph:read',
  regground_find_obligation_path: 'graph:read',
  regground_check_qualification: 'graph:validate',
  regground_validate_compliance: 'graph:validate',
  regground_get_graph_stats: 'graph:read',
  regground_list_process_types: 'graph:read',
  regground_list_jurisdictions: 'graph:read',
};

/**
 * Check whether the required scope is satisfied by the granted scopes.
 * `admin:keys` is a superuser scope that grants access to all tools.
 */
export function checkScope(requiredScope: string, grantedScopes: string[]): boolean {
  return grantedScopes.includes(requiredScope) || grantedScopes.includes('admin:keys');
}

/**
 * Get all unique scopes referenced in the tool map.
 */
export function getAllScopes(): string[] {
  return [...new Set(Object.values(TOOL_SCOPE_MAP))];
}
