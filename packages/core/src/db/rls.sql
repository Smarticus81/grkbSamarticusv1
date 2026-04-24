-- Row-Level Security policies for tenant isolation
-- Applied to all customer-data tables that carry a tenant_id column.
-- Requires app.tenant_id to be set via SET LOCAL before querying.

-- workspaces
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_workspaces ON workspaces
  USING (tenant_id = current_setting('app.tenant_id')::text);

-- process_instances
ALTER TABLE process_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_process_instances ON process_instances
  USING (tenant_id = current_setting('app.tenant_id')::text);

-- decision_trace_entries
ALTER TABLE decision_trace_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_decision_trace_entries ON decision_trace_entries
  USING (tenant_id = current_setting('app.tenant_id')::text);

-- content_traces
ALTER TABLE content_traces ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_content_traces ON content_traces
  USING (tenant_id = current_setting('app.tenant_id')::text);

-- evidence_atoms
ALTER TABLE evidence_atoms ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_evidence_atoms ON evidence_atoms
  USING (tenant_id = current_setting('app.tenant_id')::text);

-- workspace_files
ALTER TABLE workspace_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_workspace_files ON workspace_files
  USING (tenant_id = current_setting('app.tenant_id')::text);

-- hitl_gates
ALTER TABLE hitl_gates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_hitl_gates ON hitl_gates
  USING (tenant_id = current_setting('app.tenant_id')::text);

-- qualification_reports
ALTER TABLE qualification_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_qualification_reports ON qualification_reports
  USING (tenant_id = current_setting('app.tenant_id')::text);

-- usage_events
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_usage_events ON usage_events
  USING (tenant_id = current_setting('app.tenant_id')::text);

-- tenant_quotas
ALTER TABLE tenant_quotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_quotas ON tenant_quotas
  USING (tenant_id::text = current_setting('app.tenant_id')::text);

-- api_keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_api_keys ON api_keys
  USING (tenant_id = current_setting('app.tenant_id')::text);
