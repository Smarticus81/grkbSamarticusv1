import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useAuthenticatedApi } from '../auth/useApi.js';

/**
 * ProcessDesigner — chat-driven, KB-grounded process composer.
 *
 * Three panes:
 *   1) Templates rail (collapsible)      — shipped boilerplate processes; click to expand and load.
 *   2) Chat composer                     — describe the process; agent emits a WorkflowDraft.
 *   3) Workflow canvas (pan/zoom/fit)    — operational nodes with automation lanes and grounded refs.
 */

// ─── Types mirrored from packages/core/src/process/builder ────────────────

type WorkflowNodeKind =
  | 'start'
  | 'task'
  | 'agent_task'
  | 'human_task'
  | 'decision'
  | 'evidence_capture'
  | 'hitl_gate'
  | 'notification'
  | 'wait'
  | 'subprocess'
  | 'compliance_check'
  | 'end_success'
  | 'end_fail';

type WorkflowRefKind =
  | 'Obligation'
  | 'AgentRole'
  | 'EvidenceType'
  | 'GovernancePolicy'
  | 'HITLGate'
  | 'ObservabilitySLO'
  | 'ProcessTrigger'
  | 'None';

type AutomationKind = 'system' | 'agent' | 'human' | 'hybrid';

interface WorkflowGroundingRef {
  refId: string;
  refKind: WorkflowRefKind;
  note?: string;
}

interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  description: string;
  automation: AutomationKind;
  responsible: string[];
  inputs: string[];
  outputs: string[];
  durationEstimate?: string;
  groundedRefs: WorkflowGroundingRef[];
  rationale: string;
  jurisdiction?: string;
}

interface WorkflowEdge {
  from: string;
  to: string;
  label?: string;
}

interface WorkflowDraft {
  name: string;
  description: string;
  jurisdiction: string;
  processType: string;
  regulations: string[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  rationale: string;
  openQuestions: string[];
}

interface DraftValidation {
  valid: boolean;
  unknownRefs: Array<{ nodeId: string; refId: string; refKind: WorkflowRefKind }>;
  danglingEdges: Array<{ from: string; to: string }>;
  missingStart: boolean;
  missingEnd: boolean;
  ungroundedSteps: Array<{ nodeId: string; label: string }>;
  invalidDecisions: Array<{ nodeId: string; label: string; outboundCount: number }>;
}

interface BuildResult {
  draft: WorkflowDraft;
  validation: DraftValidation;
  catalogSummary: {
    obligations: number;
    agentRoles: number;
    hitlGates: number;
    policies: number;
    slos: number;
    triggers: number;
    evidenceTypes: number;
    jurisdictionUsed: string | null;
    processTypeUsed: string | null;
  };
  llmModel: string;
  llmProvider: string;
  attempts: number;
  generatedAt: string;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

interface TemplateSummary {
  id: string;
  processId: string;
  name: string;
  description: string;
  version: string;
  regulations: string[];
  jurisdictions: string[];
  steps: Array<{
    id: string;
    name: string;
    description: string;
    agentType: string;
    obligationIds: string[];
    dependsOn: string[];
    hitlGateId: string | null;
  }>;
  requiredEvidenceTypes: string[];
  requiredAgentTypes: string[];
  hitlGates: Array<{ gateId: string; approverRole: string; description: string }>;
}

interface TemplateDraftResponse {
  draft: WorkflowDraft;
  template: TemplateSummary;
  generatedAt: string;
}

interface CatalogSnapshot {
  jurisdictions: string[];
  processTypes: string[];
  obligations: unknown[];
}

// ─── Visual constants ─────────────────────────────────────────────────────

const KIND_GLYPH: Record<WorkflowNodeKind, string> = {
  start: '▶',
  task: '◻',
  agent_task: '✦',
  human_task: '☻',
  decision: '◇',
  evidence_capture: '🗎',
  hitl_gate: '🔒',
  notification: '✉',
  wait: '⏳',
  subprocess: '⊟',
  compliance_check: '✓',
  end_success: '●',
  end_fail: '✕',
};

const KIND_LABEL: Record<WorkflowNodeKind, string> = {
  start: 'Start',
  task: 'Task',
  agent_task: 'Agent Task',
  human_task: 'Human Task',
  decision: 'Decision',
  evidence_capture: 'Evidence',
  hitl_gate: 'HITL Gate',
  notification: 'Notify',
  wait: 'Wait',
  subprocess: 'Subprocess',
  compliance_check: 'Compliance',
  end_success: 'End — OK',
  end_fail: 'End — Fail',
};

// SOTA palette — high-contrast accent stripe + low-key card body so labels pop.
const AUTOMATION_COLOR: Record<AutomationKind, { bg: string; border: string; ink: string; lane: string; accent: string }> = {
  system: { bg: '#10161d', border: '#1f2a36', ink: '#eaf3ff', lane: 'System',  accent: '#3eb0f2' },
  agent:  { bg: '#121524', border: '#222a40', ink: '#eef0ff', lane: 'Agent',   accent: '#8aa6ff' },
  human:  { bg: '#1d1416', border: '#3a2326', ink: '#ffe7e7', lane: 'Human',   accent: '#ff8a8a' },
  hybrid: { bg: '#1a1322', border: '#33233f', ink: '#f3e6ff', lane: 'Hybrid',  accent: '#c98aff' },
};

// Brighter, screen-friendly inks (we don't trust the global CSS vars to have enough contrast).
const INK = {
  primary: '#f3f5f7',
  secondary: '#b8c0cc',
  muted: '#7a8492',
  faint: '#525a66',
  rule: '#1f242c',
  bg0: '#08090b',
  bg1: '#0d1014',
  bg2: '#12161c',
  accent: '#3eb0f2',
} as const;

const AUTOMATION_ORDER: AutomationKind[] = ['system', 'agent', 'human', 'hybrid'];

const REFKIND_COLOR: Record<WorkflowRefKind, string> = {
  Obligation:       '#ff5c7a',
  AgentRole:        '#8aa6ff',
  EvidenceType:     '#6cd98a',
  GovernancePolicy: '#c98aff',
  HITLGate:         '#ff9b6c',
  ObservabilitySLO: '#6cd9d9',
  ProcessTrigger:   '#3eb0f2',
  None:             '#525a66',
};

const REFKIND_LABEL: Record<WorkflowRefKind, string> = {
  Obligation:       'Obligation',
  AgentRole:        'Agent',
  EvidenceType:     'Evidence',
  GovernancePolicy: 'Policy',
  HITLGate:         'Gate',
  ObservabilitySLO: 'SLO',
  ProcessTrigger:   'Trigger',
  None:             '—',
};

// ─── Component ────────────────────────────────────────────────────────────

export function ProcessDesigner() {
  const { api } = useAuthenticatedApi();

  // Chat state
  const [chat, setChat] = useState<ChatTurn[]>([
    {
      role: 'assistant',
      content:
        'Describe a regulated process — or pick a template on the left.',
      ts: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [jurisdiction, setJurisdiction] = useState<string>('');
  const [processType, setProcessType] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Catalog (for picker dropdowns)
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);

  // Templates
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  // Saved workflows
  type SavedWorkflowRow = {
    id: string;
    name: string;
    processType: string;
    jurisdiction: string;
    description: string | null;
    source: string;
    sourceTemplateId: string | null;
    updatedAt: string;
  };
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflowRow[] | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const refreshWorkflows = useCallback(async () => {
    try {
      const rows = await api<SavedWorkflowRow[]>('/api/builder/workflows');
      setSavedWorkflows(rows);
    } catch {
      setSavedWorkflows([]);
    }
  }, [api]);

  const loadedOnce = useRef(false);
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void (async () => {
      try {
        const c = await api<{ snapshot: CatalogSnapshot }>('/api/builder/catalog');
        setCatalog(c.snapshot);
      } catch {
        /* silent */
      }
      try {
        const t = await api<{ templates: TemplateSummary[] }>('/api/builder/templates');
        setTemplates(t.templates);
      } catch {
        setTemplates([]);
      }
      void refreshWorkflows();
      // Auto-load workflow from ?workflow=:id
      try {
        const params = new URLSearchParams(window.location.search);
        const wfId = params.get('workflow');
        const tplId = params.get('template');
        if (wfId) {
          const row = await api<{
            id: string;
            name: string;
            processType: string;
            jurisdiction: string;
            description: string | null;
            source: string;
            sourceTemplateId: string | null;
            draft: WorkflowDraft;
          }>(`/api/builder/workflows/${wfId}`);
          const fake: BuildResult = {
            draft: row.draft,
            validation: {
              valid: true,
              unknownRefs: [],
              danglingEdges: [],
              missingStart: false,
              missingEnd: false,
              ungroundedSteps: [],
              invalidDecisions: [],
            },
            catalogSummary: {
              obligations: 0,
              agentRoles: 0,
              hitlGates: 0,
              policies: 0,
              slos: 0,
              triggers: 0,
              evidenceTypes: 0,
              jurisdictionUsed: row.jurisdiction,
              processTypeUsed: row.processType,
            },
            llmModel: 'saved',
            llmProvider: 'saved',
            attempts: 0,
            generatedAt: new Date().toISOString(),
          };
          setResult(fake);
          setActiveWorkflowId(row.id);
        } else if (tplId) {
          // delegated below via loadTemplate after definition
          void (async () => {
            try {
              const r = await api<TemplateDraftResponse>(`/api/builder/templates/${tplId}/draft`);
              setResult({
                draft: r.draft,
                validation: {
                  valid: true,
                  unknownRefs: [],
                  danglingEdges: [],
                  missingStart: false,
                  missingEnd: false,
                  ungroundedSteps: [],
                  invalidDecisions: [],
                },
                catalogSummary: {
                  obligations: 0,
                  agentRoles: 0,
                  hitlGates: 0,
                  policies: 0,
                  slos: 0,
                  triggers: 0,
                  evidenceTypes: 0,
                  jurisdictionUsed: r.draft.jurisdiction,
                  processTypeUsed: r.draft.processType,
                },
                llmModel: 'template',
                llmProvider: 'template',
                attempts: 0,
                generatedAt: r.generatedAt,
              });
            } catch {
              /* ignore */
            }
          })();
        }
      } catch {
        /* ignore */
      }
    })();
  }, [api, refreshWorkflows]);

  const saveWorkflow = useCallback(async () => {
    if (!result) return;
    setSavingWorkflow(true);
    setSavedToast(null);
    try {
      const defaultName = result.draft.name?.trim() || 'Untitled workflow';
      const name = window.prompt('Save workflow as:', defaultName) ?? '';
      if (!name.trim()) {
        setSavingWorkflow(false);
        return;
      }
      const body = {
        name: name.trim(),
        processType: result.draft.processType,
        jurisdiction: result.draft.jurisdiction,
        description: result.draft.rationale?.slice(0, 1000) ?? null,
        draft: result.draft as unknown as Record<string, unknown>,
        source: result.llmProvider === 'template' ? 'template' : result.llmProvider === 'saved' ? 'manual' : 'chat',
      };
      const saved = await api<SavedWorkflowRow>('/api/builder/workflows', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setActiveWorkflowId(saved.id);
      setSavedToast(`Saved "${saved.name}"`);
      void refreshWorkflows();
      window.setTimeout(() => setSavedToast(null), 2500);
    } catch (e) {
      setSavedToast(e instanceof Error ? `Save failed: ${e.message}` : 'Save failed.');
    } finally {
      setSavingWorkflow(false);
    }
  }, [api, refreshWorkflows, result]);

  const loadSavedWorkflow = useCallback(
    async (id: string) => {
      setError(null);
      setBusy(true);
      try {
        const row = await api<{
          id: string;
          name: string;
          processType: string;
          jurisdiction: string;
          description: string | null;
          source: string;
          draft: WorkflowDraft;
        }>(`/api/builder/workflows/${id}`);
        setResult({
          draft: row.draft,
          validation: {
            valid: true,
            unknownRefs: [],
            danglingEdges: [],
            missingStart: false,
            missingEnd: false,
            ungroundedSteps: [],
            invalidDecisions: [],
          },
          catalogSummary: {
            obligations: 0,
            agentRoles: 0,
            hitlGates: 0,
            policies: 0,
            slos: 0,
            triggers: 0,
            evidenceTypes: 0,
            jurisdictionUsed: row.jurisdiction,
            processTypeUsed: row.processType,
          },
          llmModel: 'saved',
          llmProvider: 'saved',
          attempts: 0,
          generatedAt: new Date().toISOString(),
        });
        setActiveWorkflowId(row.id);
        setChat((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Loaded saved workflow "${row.name}".`,
            ts: new Date().toISOString(),
          },
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [api],
  );

  const deleteSavedWorkflow = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this saved workflow?')) return;
      try {
        await api<void>(`/api/builder/workflows/${id}`, { method: 'DELETE' });
        if (activeWorkflowId === id) setActiveWorkflowId(null);
        void refreshWorkflows();
      } catch (e) {
        setSavedToast(e instanceof Error ? e.message : 'Delete failed.');
      }
    },
    [api, activeWorkflowId, refreshWorkflows],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    const userTurn: ChatTurn = { role: 'user', content: text, ts: new Date().toISOString() };
    const nextChat = [...chat, userTurn];
    setChat(nextChat);
    setInput('');
    try {
      const conversation = nextChat
        .filter((t) => t.role === 'user' || t.role === 'assistant')
        .map((t) => ({ role: t.role, content: t.content }));
      const r = await api<BuildResult>('/api/builder/draft', {
        method: 'POST',
        body: JSON.stringify({
          description: text,
          jurisdiction: jurisdiction || undefined,
          processType: processType || undefined,
          conversation: conversation.slice(0, -1),
        }),
      });
      setResult(r);
      setChat([
        ...nextChat,
        {
          role: 'assistant',
          content:
            `Drafted "${r.draft.name}" — ${r.draft.nodes.length} nodes, ${r.draft.edges.length} edges (attempt ${r.attempts}).\n\n${r.draft.rationale}` +
            (r.draft.openQuestions.length
              ? `\n\nOpen questions:\n• ${r.draft.openQuestions.join('\n• ')}`
              : ''),
          ts: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setChat([
        ...nextChat,
        {
          role: 'assistant',
          content: `I couldn't ground this in the KB: ${msg}`,
          ts: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [api, busy, chat, input, jurisdiction, processType]);

  const loadTemplate = useCallback(
    async (templateId: string) => {
      setError(null);
      setBusy(true);
      try {
        const r = await api<TemplateDraftResponse>(`/api/builder/templates/${templateId}/draft`);
        const fakeResult: BuildResult = {
          draft: r.draft,
          validation: {
            valid: true,
            unknownRefs: [],
            danglingEdges: [],
            missingStart: false,
            missingEnd: false,
            ungroundedSteps: [],
            invalidDecisions: [],
          },
          catalogSummary: {
            obligations: 0,
            agentRoles: 0,
            hitlGates: 0,
            policies: 0,
            slos: 0,
            triggers: 0,
            evidenceTypes: 0,
            jurisdictionUsed: r.draft.jurisdiction,
            processTypeUsed: r.draft.processType,
          },
          llmModel: 'template',
          llmProvider: 'template',
          attempts: 0,
          generatedAt: r.generatedAt,
        };
        setResult(fakeResult);
        setChat((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Loaded shipped template "${r.template.name}" (${r.template.steps.length} steps). Ask me to extend, branch, swap obligations, or restrict to a jurisdiction.`,
            ts: new Date().toISOString(),
          },
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [api],
  );

  const railWidth = railOpen ? 280 : 44;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `${railWidth}px 360px 1fr`,
        gap: 0,
        height: 'calc(100vh - 56px)',
        background: INK.bg0,
        color: INK.primary,
      }}
    >
      {/* ── Templates rail ─────────────────────────────────────────────── */}
      <TemplatesRail
        open={railOpen}
        onToggle={() => setRailOpen((v) => !v)}
        templates={templates}
        expandedId={expandedTemplateId}
        onExpand={(id) => setExpandedTemplateId((v) => (v === id ? null : id))}
        onLoad={loadTemplate}
        busy={busy}
        savedWorkflows={savedWorkflows}
        activeWorkflowId={activeWorkflowId}
        onLoadSaved={loadSavedWorkflow}
        onDeleteSaved={deleteSavedWorkflow}
      />

      {/* ── Chat composer ──────────────────────────────────────────────── */}
      <ChatComposer
        chat={chat}
        input={input}
        setInput={setInput}
        send={send}
        busy={busy}
        error={error}
        jurisdiction={jurisdiction}
        setJurisdiction={setJurisdiction}
        processType={processType}
        setProcessType={setProcessType}
        catalog={catalog}
        result={result}
      />

      {/* ── Canvas ─────────────────────────────────────────────────────── */}
      <CanvasPane
        result={result}
        selectedNodeId={selectedNodeId}
        onSelect={setSelectedNodeId}
        onSave={saveWorkflow}
        savingWorkflow={savingWorkflow}
        savedToast={savedToast}
        activeWorkflowId={activeWorkflowId}
      />
    </div>
  );
}

// ─── Templates rail ───────────────────────────────────────────────────────

function TemplatesRail(props: {
  open: boolean;
  onToggle: () => void;
  templates: TemplateSummary[] | null;
  expandedId: string | null;
  onExpand: (id: string) => void;
  onLoad: (id: string) => void;
  busy: boolean;
  savedWorkflows: Array<{
    id: string;
    name: string;
    processType: string;
    jurisdiction: string;
    updatedAt: string;
  }> | null;
  activeWorkflowId: string | null;
  onLoadSaved: (id: string) => void;
  onDeleteSaved: (id: string) => void;
}) {
  const {
    open,
    onToggle,
    templates,
    expandedId,
    onExpand,
    onLoad,
    busy,
    savedWorkflows,
    activeWorkflowId,
    onLoadSaved,
    onDeleteSaved,
  } = props;
  return (
    <div
      style={{
        borderRight: `1px solid ${INK.rule}`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: INK.bg1,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: open ? 'space-between' : 'center',
          padding: open ? '14px 14px' : '12px 6px',
          borderBottom: `1px solid ${INK.rule}`,
        }}
      >
        {open && (
          <div>
            <div style={{ fontSize: 10, color: INK.muted, letterSpacing: '0.12em', fontWeight: 600 }}>
              TEMPLATES
            </div>
            <div style={{ fontSize: 14, marginTop: 4, color: INK.primary, fontWeight: 500 }}>
              {templates ? `${templates.length} shipped processes` : 'Loading…'}
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          title={open ? 'Collapse' : 'Expand templates'}
          style={{
            background: INK.bg2,
            border: `1px solid ${INK.rule}`,
            color: INK.secondary,
            borderRadius: 6,
            cursor: 'pointer',
            width: 28,
            height: 28,
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          {open ? '‹' : '›'}
        </button>
      </div>

      {open && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
          {/* ── Saved workflows ── */}
          {savedWorkflows && savedWorkflows.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  fontWeight: 600,
                  color: INK.muted,
                  padding: '4px 4px 8px',
                }}
              >
                MY WORKFLOWS · {savedWorkflows.length}
              </div>
              {savedWorkflows.map((w) => {
                const isActive = activeWorkflowId === w.id;
                return (
                  <div
                    key={w.id}
                    style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      marginBottom: 6,
                      border: `1px solid ${isActive ? '#198754' : INK.rule}`,
                      borderRadius: 6,
                      background: isActive ? '#0b3a25' : INK.bg1,
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => onLoadSaved(w.id)}
                      disabled={busy}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 0,
                        color: INK.primary,
                        textAlign: 'left',
                        padding: '8px 10px',
                        cursor: busy ? 'wait' : 'pointer',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{w.name}</div>
                      <div style={{ fontSize: 10, color: INK.muted, marginTop: 2 }}>
                        {w.processType} · {w.jurisdiction}
                      </div>
                    </button>
                    <button
                      onClick={() => onDeleteSaved(w.id)}
                      title="Delete"
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: INK.muted,
                        cursor: 'pointer',
                        padding: '0 8px',
                        fontSize: 14,
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <div
                style={{
                  height: 1,
                  background: INK.rule,
                  margin: '14px 0 10px',
                }}
              />
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  fontWeight: 600,
                  color: INK.muted,
                  padding: '0 4px 8px',
                }}
              >
                SHIPPED TEMPLATES
              </div>
            </div>
          )}
          {templates === null && (
            <div style={{ padding: 12, fontSize: 12, color: INK.muted }}>Loading templates…</div>
          )}
          {templates && templates.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: INK.muted }}>
              No templates registered.
            </div>
          )}
          {templates?.map((t) => {
            const expanded = expandedId === t.id;
            return (
              <div
                key={t.id}
                style={{
                  marginBottom: 8,
                  border: `1px solid ${expanded ? '#2a3340' : INK.rule}`,
                  borderRadius: 8,
                  background: expanded ? INK.bg2 : INK.bg1,
                  overflow: 'hidden',
                  transition: 'border-color 120ms',
                }}
              >
                <button
                  onClick={() => onExpand(t.id)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    color: INK.primary,
                    border: 0,
                    padding: '12px 12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: INK.primary }}>{t.name}</span>
                    <span style={{ fontSize: 10, color: INK.muted }}>{expanded ? '▾' : '▸'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: INK.secondary, marginTop: 4 }}>
                    {t.steps.length} step{t.steps.length === 1 ? '' : 's'}
                    {t.hitlGates.length > 0 ? ` · ${t.hitlGates.length} gate${t.hitlGates.length === 1 ? '' : 's'}` : ''}
                  </div>
                </button>
                {expanded && (
                  <div style={{ padding: '0 12px 12px', fontSize: 12 }}>
                    <div style={{ marginBottom: 10, lineHeight: 1.5, color: INK.secondary }}>
                      {t.description}
                    </div>
                    <ol style={{ paddingLeft: 18, margin: 0, fontSize: 12, lineHeight: 1.6, color: INK.secondary }}>
                      {t.steps.map((s) => (
                        <li key={s.id} style={{ marginBottom: 2 }}>
                          {s.name}
                          {s.hitlGateId ? <span style={{ color: '#ff9b6c' }}> · gate</span> : null}
                        </li>
                      ))}
                    </ol>
                    {t.regulations.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                        {t.regulations.slice(0, 6).map((r) => (
                          <span
                            key={r}
                            style={{
                              fontSize: 10,
                              padding: '2px 6px',
                              background: INK.bg0,
                              border: `1px solid ${INK.rule}`,
                              color: INK.secondary,
                              borderRadius: 4,
                            }}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => onLoad(t.id)}
                      style={{
                        marginTop: 12,
                        width: '100%',
                        background: busy ? INK.bg2 : INK.accent,
                        color: busy ? INK.muted : '#001018',
                        border: 0,
                        padding: '8px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: busy ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                      }}
                    >
                      Load into canvas
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Chat composer ────────────────────────────────────────────────────────

function ChatComposer(props: {
  chat: ChatTurn[];
  input: string;
  setInput: (v: string) => void;
  send: () => void;
  busy: boolean;
  error: string | null;
  jurisdiction: string;
  setJurisdiction: (v: string) => void;
  processType: string;
  setProcessType: (v: string) => void;
  catalog: CatalogSnapshot | null;
  result: BuildResult | null;
}) {
  const { chat, input, setInput, send, busy, error, jurisdiction, setJurisdiction, processType, setProcessType, catalog, result } = props;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid ${INK.rule}`,
        minHeight: 0,
        background: INK.bg0,
      }}
    >
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${INK.rule}` }}>
        <div style={{ fontSize: 10, color: INK.muted, letterSpacing: '0.12em', fontWeight: 600 }}>
          DESIGNER
        </div>
        <div style={{ fontSize: 16, marginTop: 4, color: INK.primary, fontWeight: 500 }}>
          Compose a process
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <select value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} style={selectStyle}>
            <option value="">Any jurisdiction</option>
            {catalog?.jurisdictions.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
          <select value={processType} onChange={(e) => setProcessType(e.target.value)} style={selectStyle}>
            <option value="">Any process type</option>
            {catalog?.processTypes.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {chat.map((t, i) => (
          <div
            key={i}
            style={{
              alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '92%',
              padding: '10px 12px',
              borderRadius: 10,
              background: t.role === 'user' ? '#1a2c40' : INK.bg2,
              border: `1px solid ${t.role === 'user' ? '#2a4060' : INK.rule}`,
              color: INK.primary,
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}
          >
            {t.content}
          </div>
        ))}
        {busy && (
          <div style={{ fontSize: 12, color: INK.muted, fontStyle: 'italic' }}>
            Composing workflow against the live obligation graph…
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${INK.rule}`, padding: '10px 12px' }}>
        {error && (
          <div
            style={{
              fontSize: 12,
              color: '#ff9b9b',
              background: '#2a1010',
              border: '1px solid #5a2020',
              borderRadius: 6,
              padding: '6px 8px',
              marginBottom: 8,
            }}
          >
            {error}
          </div>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Describe the process… (⌘/Ctrl+Enter)"
          rows={3}
          style={{
            width: '100%',
            background: INK.bg1,
            border: `1px solid ${INK.rule}`,
            color: INK.primary,
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
            resize: 'vertical',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: INK.muted }}>
            {result
              ? `${result.catalogSummary.obligations} obligations · ${result.catalogSummary.agentRoles} agents`
              : 'Live KB grounding'}
          </span>
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            style={{
              background: busy || !input.trim() ? INK.bg2 : INK.accent,
              color: busy || !input.trim() ? INK.muted : '#001018',
              border: 0,
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: 13,
              cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            {busy ? 'Drafting…' : 'Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Canvas pane ──────────────────────────────────────────────────────────

function CanvasPane(props: {
  result: BuildResult | null;
  selectedNodeId: string | null;
  onSelect: (id: string | null) => void;
  onSave: () => void;
  savingWorkflow: boolean;
  savedToast: string | null;
  activeWorkflowId: string | null;
}) {
  const { result, selectedNodeId, onSelect, onSave, savingWorkflow, savedToast, activeWorkflowId } = props;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const layout = useMemo(() => (result ? buildLayout(result.draft) : null), [result]);

  const fitToView = useCallback(() => {
    if (!layout || !containerRef.current) return;
    const cw = containerRef.current.clientWidth - 24;
    const ch = containerRef.current.clientHeight - 24;
    const sx = cw / layout.width;
    const sy = ch / layout.height;
    const z = Math.min(1.5, Math.max(0.2, Math.min(sx, sy)));
    setZoom(z);
    setPan({
      x: (cw - layout.width * z) / 2 + 12,
      y: (ch - layout.height * z) / 2 + 12,
    });
  }, [layout]);

  // Auto-fit on new result
  useEffect(() => {
    if (result) {
      // wait one frame so container has measured
      requestAnimationFrame(fitToView);
    }
  }, [result, fitToView]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dz = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => Math.min(2.5, Math.max(0.15, z * dz)));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  };
  const onMouseUp = () => setDragging(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: INK.bg0 }}>
      <div
        style={{
          padding: '14px 22px',
          borderBottom: `1px solid ${INK.rule}`,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: INK.muted, letterSpacing: '0.12em', fontWeight: 600 }}>
            CANVAS
          </div>
          <div style={{ fontSize: 16, marginTop: 4, color: INK.primary, fontWeight: 500 }}>
            {result?.draft.name ?? 'No workflow loaded'}
          </div>
          {result && (
            <div style={{ fontSize: 12, color: INK.secondary, marginTop: 2 }}>
              {result.draft.processType} · {result.draft.jurisdiction}
              {result.draft.regulations.length > 0 && (
                <> · {result.draft.regulations.slice(0, 2).join(', ')}{result.draft.regulations.length > 2 ? ` +${result.draft.regulations.length - 2}` : ''}</>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {result && <ValidationBadge validation={result.validation} />}
          {result && (
            <button
              onClick={onSave}
              disabled={savingWorkflow}
              style={{
                background: activeWorkflowId ? INK.bg2 : '#0f5132',
                color: activeWorkflowId ? INK.primary : '#e6ffec',
                border: `1px solid ${activeWorkflowId ? INK.rule : '#198754'}`,
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: savingWorkflow ? 'wait' : 'pointer',
                opacity: savingWorkflow ? 0.6 : 1,
              }}
              title={activeWorkflowId ? 'Save as new name (or overwrite)' : 'Save this workflow'}
            >
              {savingWorkflow ? 'Saving…' : activeWorkflowId ? 'Save as…' : '+ Save workflow'}
            </button>
          )}
          {savedToast && (
            <span
              style={{
                fontSize: 11,
                color: INK.secondary,
                background: INK.bg2,
                border: `1px solid ${INK.rule}`,
                borderRadius: 4,
                padding: '4px 8px',
              }}
            >
              {savedToast}
            </span>
          )}
          {result && (
            <div style={{ display: 'flex', gap: 4 }}>
              <CanvasButton onClick={() => setZoom((z) => Math.max(0.15, z * 0.9))}>−</CanvasButton>
              <span style={{ fontSize: 11, color: INK.secondary, alignSelf: 'center', minWidth: 36, textAlign: 'center' }}>
                {Math.round(zoom * 100)}%
              </span>
              <CanvasButton onClick={() => setZoom((z) => Math.min(2.5, z * 1.1))}>+</CanvasButton>
              <CanvasButton onClick={fitToView}>Fit</CanvasButton>
              <CanvasButton onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>1:1</CanvasButton>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateRows: '1fr auto', minHeight: 0 }}>
        <div
          ref={containerRef}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{
            position: 'relative',
            overflow: 'hidden',
            background:
              'radial-gradient(circle at 1px 1px, #1a1f26 1px, transparent 0) 0 0/22px 22px, #06080b',
            cursor: dragging ? 'grabbing' : 'grab',
            minHeight: 0,
          }}
        >
          {result && layout ? (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
              }}
            >
              <WorkflowCanvas
                draft={result.draft}
                layout={layout}
                selectedNodeId={selectedNodeId}
                onSelect={onSelect}
              />
            </div>
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Detail / rationale rail */}
        {result && (
          <DetailFooter
            draft={result.draft}
            selectedNodeId={selectedNodeId}
            onClose={() => onSelect(null)}
          />
        )}
      </div>
    </div>
  );
}

function CanvasButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: INK.bg2,
        border: `1px solid ${INK.rule}`,
        color: INK.secondary,
        borderRadius: 6,
        padding: '5px 10px',
        fontSize: 11,
        cursor: 'pointer',
        minWidth: 30,
      }}
    >
      {children}
    </button>
  );
}

function DetailFooter({
  draft,
  selectedNodeId,
  onClose,
}: {
  draft: WorkflowDraft;
  selectedNodeId: string | null;
  onClose: () => void;
}) {
  const node = selectedNodeId ? draft.nodes.find((n) => n.id === selectedNodeId) : null;
  return (
    <div
      style={{
        borderTop: `1px solid ${INK.rule}`,
        padding: '14px 22px',
        fontSize: 12,
        color: INK.secondary,
        maxHeight: 240,
        overflowY: 'auto',
        background: INK.bg1,
      }}
    >
      {node ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: AUTOMATION_COLOR[node.automation].accent, fontSize: 14 }}>
                {KIND_GLYPH[node.kind]}
              </span>
              <strong style={{ color: INK.primary, fontSize: 14 }}>{node.label}</strong>
              <span style={{ fontSize: 10, color: INK.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {KIND_LABEL[node.kind]}
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                color: INK.muted,
                border: 0,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ marginTop: 6, color: INK.secondary, lineHeight: 1.5 }}>{node.description}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 12 }}>
            <FooterColumn label="Responsible" items={node.responsible} />
            <FooterColumn label="Inputs" items={node.inputs} />
            <FooterColumn label="Outputs" items={node.outputs} />
            <FooterColumn label="Automation" items={[node.automation + (node.durationEstimate ? ` · ${node.durationEstimate}` : '')]} />
          </div>
          {node.groundedRefs.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, color: INK.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                KB grounding
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {node.groundedRefs.map((r, i) => (
                  <RefChip key={i} groundedRef={r} />
                ))}
              </div>
            </div>
          )}
          {node.rationale && (
            <div style={{ marginTop: 10, fontStyle: 'italic', color: INK.muted, lineHeight: 1.5 }}>
              {node.rationale}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 10, color: INK.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            Rationale
          </div>
          <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: INK.secondary }}>
            {draft.rationale || 'Click any node to see its detail.'}
          </div>
          {draft.openQuestions.length > 0 && (
            <>
              <div style={{ fontSize: 10, color: INK.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginTop: 10 }}>
                Open questions
              </div>
              <ul style={{ margin: '6px 0 0 18px', color: INK.secondary }}>
                {draft.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FooterColumn({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: INK.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ marginTop: 4, color: INK.secondary, fontSize: 12, lineHeight: 1.4 }}>
        {items.length === 0 ? <span style={{ color: INK.faint }}>—</span> : items.join(', ')}
      </div>
    </div>
  );
}

function RefChip({ groundedRef: r }: { groundedRef: WorkflowGroundingRef }) {
  const color = REFKIND_COLOR[r.refKind];
  return (
    <span
      title={r.note ?? `${r.refKind}: ${r.refId}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10,
        padding: '3px 8px 3px 6px',
        background: INK.bg0,
        border: `1px solid ${INK.rule}`,
        color: INK.secondary,
        borderRadius: 999,
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, display: 'inline-block' }} />
      <span style={{ color: INK.primary }}>{REFKIND_LABEL[r.refKind]}</span>
      <span style={{ color: INK.muted }}>{r.refId}</span>
    </span>
  );
}

const selectStyle: React.CSSProperties = {
  background: INK.bg1,
  color: INK.primary,
  border: `1px solid ${INK.rule}`,
  borderRadius: 6,
  padding: '7px 9px',
  fontSize: 12,
  outline: 'none',
};

function ValidationBadge({ validation }: { validation: DraftValidation }) {
  if (validation.valid) {
    return (
      <div
        style={{
          fontSize: 11,
          padding: '4px 10px',
          borderRadius: 999,
          background: '#103018',
          color: '#7fdc9a',
          border: '1px solid #225a32',
        }}
      >
        ● KB-grounded
      </div>
    );
  }
  const issues =
    validation.unknownRefs.length +
    validation.danglingEdges.length +
    validation.ungroundedSteps.length +
    validation.invalidDecisions.length +
    (validation.missingStart ? 1 : 0) +
    (validation.missingEnd ? 1 : 0);
  return (
    <div
      style={{
        fontSize: 11,
        padding: '4px 10px',
        borderRadius: 999,
        background: '#301010',
        color: '#f99',
        border: '1px solid #5a2222',
      }}
      title={JSON.stringify(validation, null, 2)}
    >
      ● {issues} validation issue{issues === 1 ? '' : 's'}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: INK.muted,
        fontSize: 13,
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <div style={{ fontSize: 32, marginBottom: 12, color: INK.faint }}>◇</div>
        <div style={{ color: INK.secondary, marginBottom: 4 }}>Empty canvas</div>
        <div>Pick a template on the left or describe a process in the chat.</div>
      </div>
    </div>
  );
}

// ─── Layout engine ────────────────────────────────────────────────────────

interface LaidOutNode {
  node: WorkflowNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LayoutResult {
  positioned: Record<string, LaidOutNode>;
  width: number;
  height: number;
  laneBands: Array<{ y: number; h: number; label: string; automation: AutomationKind }>;
}

const NODE_W = 180;
const NODE_H = 64;
const COL_GAP = 70;
const ROW_GAP = 22;
const LANE_LABEL_W = 80;
const LANE_PAD_TOP = 36;

/**
 * Compute a left-to-right layered layout (longest-path topological columns)
 * with horizontal swimlanes by `automation`. Cycles are tolerated via a
 * fallback ordering.
 */
function buildLayout(draft: WorkflowDraft): LayoutResult {
  const nodes = draft.nodes;
  const idIndex = new Map(nodes.map((n) => [n.id, n] as const));
  const adjOut = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) {
    adjOut.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const e of draft.edges) {
    if (!idIndex.has(e.from) || !idIndex.has(e.to)) continue;
    adjOut.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }

  // Longest-path layering (Kahn-ish; for cycles, just push to col 0).
  const layer = new Map<string, number>();
  const queue: string[] = [];
  const tempIndeg = new Map(indeg);
  for (const n of nodes) {
    if ((tempIndeg.get(n.id) ?? 0) === 0) {
      queue.push(n.id);
      layer.set(n.id, 0);
    }
  }
  while (queue.length) {
    const id = queue.shift()!;
    const l = layer.get(id) ?? 0;
    for (const nb of adjOut.get(id) ?? []) {
      const nl = Math.max(layer.get(nb) ?? 0, l + 1);
      layer.set(nb, nl);
      tempIndeg.set(nb, (tempIndeg.get(nb) ?? 1) - 1);
      if ((tempIndeg.get(nb) ?? 0) === 0) queue.push(nb);
    }
  }
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, 0);
  }

  // Group nodes by (column, automation lane)
  const cols: Record<number, Record<AutomationKind, WorkflowNode[]>> = {};
  let maxCol = 0;
  for (const n of nodes) {
    const c = layer.get(n.id) ?? 0;
    maxCol = Math.max(maxCol, c);
    cols[c] ||= { system: [], agent: [], human: [], hybrid: [] };
    cols[c][n.automation].push(n);
  }

  // Determine which lanes are populated
  const usedLanes = AUTOMATION_ORDER.filter((a) =>
    Object.values(cols).some((col) => col[a].length > 0),
  );
  if (usedLanes.length === 0) usedLanes.push('system');

  // Compute max nodes per (col,lane) to size rows in that lane
  const lanePeak: Record<AutomationKind, number> = { system: 1, agent: 1, human: 1, hybrid: 1 };
  for (const a of usedLanes) {
    for (let c = 0; c <= maxCol; c++) {
      const count = cols[c]?.[a].length ?? 0;
      if (count > lanePeak[a]) lanePeak[a] = count;
    }
  }

  // Compute lane Y bands
  const laneBands: LayoutResult['laneBands'] = [];
  let cursorY = LANE_PAD_TOP;
  for (const a of usedLanes) {
    const h = lanePeak[a] * NODE_H + (lanePeak[a] - 1) * ROW_GAP + 32;
    laneBands.push({ y: cursorY, h, label: AUTOMATION_COLOR[a].lane, automation: a });
    cursorY += h + 8;
  }
  const totalHeight = cursorY + 16;
  const totalWidth = LANE_LABEL_W + (maxCol + 1) * NODE_W + maxCol * COL_GAP + 32;

  // Position nodes
  const positioned: Record<string, LaidOutNode> = {};
  for (let c = 0; c <= maxCol; c++) {
    for (const a of usedLanes) {
      const arr = cols[c]?.[a] ?? [];
      const band = laneBands.find((b) => b.automation === a)!;
      const baseY = band.y + 16;
      arr.forEach((n, idx) => {
        positioned[n.id] = {
          node: n,
          x: LANE_LABEL_W + 16 + c * (NODE_W + COL_GAP),
          y: baseY + idx * (NODE_H + ROW_GAP),
          w: NODE_W,
          h: NODE_H,
        };
      });
    }
  }

  return { positioned, width: totalWidth, height: totalHeight, laneBands };
}

// ─── Canvas renderer ──────────────────────────────────────────────────────

function WorkflowCanvas(props: {
  draft: WorkflowDraft;
  layout: LayoutResult;
  selectedNodeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { draft, layout, selectedNodeId, onSelect } = props;
  const { positioned, width, height, laneBands } = layout;

  return (
    <div style={{ position: 'relative', width, height }}>
      {/* Lane bands */}
      <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        {laneBands.map((band) => (
          <g key={band.label}>
            <rect
              x={0}
              y={band.y}
              width={width}
              height={band.h}
              fill={AUTOMATION_COLOR[band.automation].accent}
              opacity={0.04}
            />
            <line
              x1={0}
              x2={width}
              y1={band.y + band.h}
              y2={band.y + band.h}
              stroke={INK.rule}
              strokeDasharray="3 5"
            />
            <text
              x={12}
              y={band.y + 18}
              fontSize={10}
              fill={AUTOMATION_COLOR[band.automation].accent}
              fontWeight={600}
              style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}
            >
              {band.label}
            </text>
          </g>
        ))}
      </svg>

      {/* Edges */}
      <svg
        width={width}
        height={height}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7888" />
          </marker>
        </defs>
        {draft.edges.map((e, i) => {
          const a = positioned[e.from];
          const b = positioned[e.to];
          if (!a || !b) return null;
          const ax = a.x + a.w;
          const ay = a.y + a.h / 2;
          const bx = b.x;
          const by = b.y + b.h / 2;
          // If b is to the left of a (back-edge), route around with a downward dip
          const sameOrBack = bx <= ax;
          const mx = sameOrBack ? Math.min(ax, bx) - 40 : (ax + bx) / 2;
          const my = (ay + by) / 2 + (sameOrBack ? 60 : 0);
          const path = sameOrBack
            ? `M ${ax} ${ay} C ${ax + 40} ${ay}, ${mx} ${my}, ${bx - 40} ${by} S ${bx} ${by}, ${bx} ${by}`
            : `M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`;
          return (
            <g key={i}>
              <path d={path} stroke="#6b7888" strokeWidth={1.5} fill="none" markerEnd="url(#arrow)" />
              {e.label && (
                <text
                  x={(ax + bx) / 2}
                  y={(ay + by) / 2 - 6}
                  fontSize={10}
                  fill="#b8c0cc"
                  textAnchor="middle"
                  style={{ paintOrder: 'stroke', stroke: '#06080b', strokeWidth: 3 }}
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Node cards */}
      {draft.nodes.map((n) => {
        const p = positioned[n.id];
        if (!p) return null;
        const c = AUTOMATION_COLOR[n.automation];
        const selected = selectedNodeId === n.id;
        // Distinct ref kinds (color dots only)
        const distinctRefKinds = Array.from(new Set(n.groundedRefs.map((r) => r.refKind)));
        return (
          <div
            key={n.id}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onSelect(selected ? null : n.id)}
            title={n.description || n.label}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.w,
              height: p.h,
              background: c.bg,
              border: `1px solid ${selected ? c.accent : c.border}`,
              boxShadow: selected
                ? `0 0 0 2px ${c.accent}33, 0 8px 24px rgba(0,0,0,0.5)`
                : '0 2px 8px rgba(0,0,0,0.35)',
              borderRadius: 8,
              color: c.ink,
              fontSize: 12,
              display: 'flex',
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'box-shadow 120ms, border-color 120ms',
            }}
          >
            {/* Accent stripe */}
            <div style={{ width: 4, background: c.accent, flexShrink: 0 }} />

            {/* Body */}
            <div
              style={{
                flex: 1,
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: c.ink,
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ color: c.accent, marginRight: 6 }}>{KIND_GLYPH[n.kind]}</span>
                {n.label}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  color: INK.muted,
                }}
              >
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {KIND_LABEL[n.kind]}
                  {n.durationEstimate ? ` · ${n.durationEstimate}` : ''}
                </span>
                {distinctRefKinds.length > 0 && (
                  <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    {distinctRefKinds.slice(0, 5).map((k) => (
                      <span
                        key={k}
                        title={k}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: REFKIND_COLOR[k],
                        }}
                      />
                    ))}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ProcessDesigner;
