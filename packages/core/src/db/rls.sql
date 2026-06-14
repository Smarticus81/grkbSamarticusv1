-- Row-Level Security policies for tenant isolation.
--
-- Runtime queries must execute inside withTenant(...), which sets:
--   SET LOCAL app.tenant_id = '<tenant id>'
--
-- current_setting('app.tenant_id') intentionally omits missing_ok so queries
-- fail closed when tenant context is absent.

-- Strict tenant-owned tables -------------------------------------------------

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_workspaces ON workspaces
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE process_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_instances FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_process_instances ON process_instances
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE decision_trace_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_trace_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_decision_trace_entries ON decision_trace_entries
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE content_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_traces FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_content_traces ON content_traces
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE evidence_atoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_atoms FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_evidence_atoms ON evidence_atoms
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE workspace_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_files FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_workspace_files ON workspace_files
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE hitl_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hitl_gates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_hitl_gates ON hitl_gates
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE qualification_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualification_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_qualification_reports ON qualification_reports
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_usage_events ON usage_events
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE tenant_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_quotas FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_quotas ON tenant_quotas
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM tenants
      WHERE tenants.id = tenant_quotas.tenant_id
        AND tenants.tenant_key = current_setting('app.tenant_id')::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM tenants
      WHERE tenants.id = tenant_quotas.tenant_id
        AND tenants.tenant_key = current_setting('app.tenant_id')::text
    )
  );

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_api_keys ON api_keys
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE builder_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE builder_agents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_builder_agents ON builder_agents
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE process_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_workflows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_process_workflows ON process_workflows
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE grounded_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE grounded_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_grounded_runs ON grounded_runs
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE managed_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE managed_agent_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_managed_agent_runs ON managed_agent_runs
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE psur_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE psur_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_psur_runs ON psur_runs
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);

-- Nullable tenant catalog tables -------------------------------------------
--
-- tenant_id IS NULL means a shared platform catalog row. Tenant sessions may
-- read shared rows, but writes/deletes must target their own tenant_id.

ALTER TABLE agent_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_registrations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select_agent_registrations ON agent_registrations
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id')::text);
CREATE POLICY tenant_insert_agent_registrations ON agent_registrations
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);
CREATE POLICY tenant_update_agent_registrations ON agent_registrations
  FOR UPDATE
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);
CREATE POLICY tenant_delete_agent_registrations ON agent_registrations
  FOR DELETE
  USING (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select_skills ON skills
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id')::text);
CREATE POLICY tenant_insert_skills ON skills
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);
CREATE POLICY tenant_update_skills ON skills
  FOR UPDATE
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);
CREATE POLICY tenant_delete_skills ON skills
  FOR DELETE
  USING (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select_skill_versions ON skill_versions
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id')::text);
CREATE POLICY tenant_insert_skill_versions ON skill_versions
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);
CREATE POLICY tenant_update_skill_versions ON skill_versions
  FOR UPDATE
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);
CREATE POLICY tenant_delete_skill_versions ON skill_versions
  FOR DELETE
  USING (tenant_id = current_setting('app.tenant_id')::text);

ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_configs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_select_agent_configs ON agent_configs
  FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id')::text);
CREATE POLICY tenant_insert_agent_configs ON agent_configs
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);
CREATE POLICY tenant_update_agent_configs ON agent_configs
  FOR UPDATE
  USING (tenant_id = current_setting('app.tenant_id')::text)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::text);
CREATE POLICY tenant_delete_agent_configs ON agent_configs
  FOR DELETE
  USING (tenant_id = current_setting('app.tenant_id')::text);
