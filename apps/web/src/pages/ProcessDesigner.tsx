import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import {
  BellRinging,
  CheckCircle,
  ClipboardText,
  Clock,
  FlowArrow,
  GitBranch,
  Handshake,
  PlayCircle,
  Robot,
  ShieldCheck,
  SignOut,
  UserCircle,
  XCircle,
  type Icon,
} from '@phosphor-icons/react';
import { useAuthenticatedApi } from '../auth/useApi.js';

// ─── Types ────────────────────────────────────────────────────────────────

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
type PortSide = 'top' | 'bottom' | 'left' | 'right';

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
  /** Canvas layout — persisted in saved drafts only. */
  x?: number;
  y?: number;
}

interface CanvasNode extends WorkflowNode {
  x: number;
  y: number;
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

interface SemanticContextInfo {
  intent: {
    processTypes: string[];
    jurisdictions: string[];
    riskLevel: string;
    requestedOutput: string;
    ambiguities: string[];
    summary: string;
  };
  retrieval: {
    totalConsidered: number;
    totalAuthoritative: number;
    totalCandidates: number;
    embeddingsAvailable: boolean;
    degradedReason?: string;
    catalogCoverage: { total: number; covered: number; ratio: number };
    timings: {
      intentExtractionMs: number;
      embeddingMs: number;
      hybridRetrievalMs: number;
      graphExpansionMs: number;
      rerankMs: number;
      totalMs: number;
    };
  };
  groundedObligationIds: string[];
  candidateObligationIds: string[];
  ambiguities: string[];
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
  semanticContext?: SemanticContextInfo;
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

// ─── Palette config ───────────────────────────────────────────────────────

const PALETTE_CATEGORIES = [
  {
    label: 'Flow',
    nodes: [
      { kind: 'start' as WorkflowNodeKind, label: 'Start', desc: 'Where the process begins' },
      { kind: 'end_success' as WorkflowNodeKind, label: 'Complete', desc: 'Finished successfully' },
      { kind: 'end_fail' as WorkflowNodeKind, label: 'Stopped', desc: 'Ended without completion' },
      { kind: 'decision' as WorkflowNodeKind, label: 'Decision', desc: 'Choose what happens next' },
      { kind: 'wait' as WorkflowNodeKind, label: 'Wait', desc: 'Pause until something happens' },
    ],
  },
  {
    label: 'Work',
    nodes: [
      { kind: 'task' as WorkflowNodeKind, label: 'Step', desc: 'A general work step' },
      { kind: 'agent_task' as WorkflowNodeKind, label: 'AI step', desc: 'Handled by an AI agent' },
      { kind: 'human_task' as WorkflowNodeKind, label: 'Manual step', desc: 'Done by a person' },
      { kind: 'subprocess' as WorkflowNodeKind, label: 'Sub-process', desc: 'Run another workflow' },
    ],
  },
  {
    label: 'Compliance',
    nodes: [
      { kind: 'evidence_capture' as WorkflowNodeKind, label: 'Collect evidence', desc: 'Gather a required record' },
      { kind: 'hitl_gate' as WorkflowNodeKind, label: 'Approval', desc: 'Someone must sign off' },
      { kind: 'compliance_check' as WorkflowNodeKind, label: 'Check compliance', desc: 'Verify regulatory rules' },
      { kind: 'notification' as WorkflowNodeKind, label: 'Send notice', desc: 'Notify the right people' },
    ],
  },
];

// ─── Visual constants ─────────────────────────────────────────────────────

const AUTOMATION_LABEL: Record<AutomationKind, string> = {
  system: 'Automated',
  agent: 'AI agent',
  human: 'Manual review',
  hybrid: 'Mixed',
};

function workflowFingerprint(
  name: string,
  meta: { jurisdiction: string; processType: string; regulations: string[] },
  nodes: CanvasNode[],
  edges: WorkflowEdge[],
): string {
  return JSON.stringify({ name, meta, nodes, edges });
}

const AUTOMATION_COLORS: Record<AutomationKind, { bg: string; border: string; accent: string; glow: string }> = {
  system: { bg: '#0d1117', border: '#1e2a36', accent: '#3eb0f2', glow: 'rgba(62,176,242,0.3)' },
  agent:  { bg: '#0f1220', border: '#1e2540', accent: '#818cf8', glow: 'rgba(129,140,248,0.3)' },
  human:  { bg: '#1a1012', border: '#3a2024', accent: '#f87171', glow: 'rgba(248,113,113,0.3)' },
  hybrid: { bg: '#160f1e', border: '#30203c', accent: '#c084fc', glow: 'rgba(192,132,252,0.3)' },
};

const NODE_W = 260;
const NODE_H = 104;
const GRID_SIZE = 20;
const PORT_R = 6;
const SNAP_THRESHOLD = 12;

const WORKFLOW_ICONS: Record<WorkflowNodeKind, Icon> = {
  start: PlayCircle,
  task: ClipboardText,
  agent_task: Robot,
  human_task: UserCircle,
  decision: GitBranch,
  evidence_capture: ClipboardText,
  hitl_gate: Handshake,
  notification: BellRinging,
  wait: Clock,
  subprocess: FlowArrow,
  compliance_check: ShieldCheck,
  end_success: CheckCircle,
  end_fail: XCircle,
};

function WorkflowIcon({ kind, color = 'currentColor', size = 18 }: { kind: WorkflowNodeKind; color?: string; size?: number }) {
  const IconComponent = WORKFLOW_ICONS[kind] ?? SignOut;
  return <IconComponent size={size} color={color} weight="duotone" aria-hidden />;
}

function snapToGrid(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

let _nextId = 1;
function genId(): string {
  return `node_${Date.now()}_${_nextId++}`;
}

function defaultAutomation(kind: WorkflowNodeKind): AutomationKind {
  if (kind === 'agent_task') return 'agent';
  if (kind === 'human_task' || kind === 'hitl_gate') return 'human';
  if (kind === 'compliance_check' || kind === 'evidence_capture') return 'hybrid';
  return 'system';
}

function makeNode(kind: WorkflowNodeKind, label: string, x: number, y: number): CanvasNode {
  return {
    id: genId(), kind, label, description: label, automation: defaultAutomation(kind),
    responsible: [], inputs: [], outputs: [], groundedRefs: [], rationale: '',
    x: snapToGrid(x), y: snapToGrid(y),
  };
}

function resolveWorkflowMeta(meta: { jurisdiction: string; processType: string }) {
  return {
    jurisdiction: meta.jurisdiction.trim() || 'GLOBAL',
    processType: meta.processType.trim() || 'GENERIC',
  };
}

function buildDraftFromCanvas(
  name: string,
  meta: { jurisdiction: string; processType: string; regulations: string[] },
  nodes: CanvasNode[],
  edges: WorkflowEdge[],
): WorkflowDraft {
  const { jurisdiction, processType } = resolveWorkflowMeta(meta);
  return {
    name: name.trim(),
    description: '',
    jurisdiction,
    processType,
    regulations: meta.regulations,
    nodes: nodes.map(({ x, y, description, ...rest }) => ({
      ...rest,
      description: description.trim() || rest.label,
      x,
      y,
    })),
    edges,
    rationale: '',
    openQuestions: [],
  };
}

function draftToCanvasNodes(draft: WorkflowDraft): CanvasNode[] {
  const positioned =
    draft.nodes.length > 0 &&
    draft.nodes.every(
      (n) => typeof n.x === 'number' && typeof n.y === 'number' && Number.isFinite(n.x) && Number.isFinite(n.y),
    );
  if (positioned) {
    return draft.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      description: n.description,
      automation: n.automation,
      responsible: n.responsible,
      inputs: n.inputs,
      outputs: n.outputs,
      durationEstimate: n.durationEstimate,
      groundedRefs: n.groundedRefs,
      rationale: n.rationale,
      jurisdiction: n.jurisdiction,
      x: n.x!,
      y: n.y!,
    }));
  }
  return autoLayout(draft.nodes, draft.edges);
}

// ─── Component ────────────────────────────────────────────────────────────

export function ProcessDesigner() {
  const { api } = useAuthenticatedApi();
  const [, navigate] = useLocation();

  // ── Core canvas state ──
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('Untitled agent workflow');
  const [workflowMeta, setWorkflowMeta] = useState({ jurisdiction: '', processType: '', regulations: [] as string[] });

  // ── Interaction state ──
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 60, y: 60 });
  const [dragState, setDragState] = useState<null | {
    type: 'node' | 'pan' | 'edge';
    nodeId?: string;
    startX: number; startY: number;
    origX?: number; origY?: number;
    panX?: number; panY?: number;
    fromPort?: string;
  }>(null);
  const [pendingEdge, setPendingEdge] = useState<null | { fromId: string; mx: number; my: number }>(null);
  const [hoverPort, setHoverPort] = useState<null | { nodeId: string; side: 'top' | 'bottom' | 'left' | 'right' }>(null);
  const [dropPreview, setDropPreview] = useState<null | { kind: WorkflowNodeKind; x: number; y: number }>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [justDropped, setJustDropped] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Chat state (secondary) ──
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<ChatTurn[]>([
    { role: 'assistant', content: 'Pick a starter template on the left, describe a process here, or add steps directly on the canvas.', ts: new Date().toISOString() },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [jurisdiction, setJurisdiction] = useState('');
  const [processType, setProcessType] = useState('');

  // ── Catalog (for chat pickers) ──
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);

  // ── Saved workflows ──
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflowRow[] | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const currentFingerprint = useMemo(
    () => workflowFingerprint(workflowName, workflowMeta, nodes, edges),
    [workflowName, workflowMeta, nodes, edges],
  );
  const isDirty = nodes.length > 0 && currentFingerprint !== lastSavedFingerprint;

  const refreshWorkflows = useCallback(async () => {
    try { setSavedWorkflows(await api<SavedWorkflowRow[]>('/api/builder/workflows')); } catch { setSavedWorkflows([]); }
  }, [api]);

  const showToast = useCallback((message: string, isError = false) => {
    setToast(message);
    setToastError(isError);
    setTimeout(() => {
      setToast(null);
      setToastError(false);
    }, isError ? 4000 : 2500);
  }, []);

  const applyLoadedWorkflow = useCallback((
    row: { id: string; name: string; processType: string; jurisdiction: string; draft: WorkflowDraft },
  ) => {
    const loadedNodes = draftToCanvasNodes(row.draft);
    setNodes(loadedNodes);
    setEdges([...row.draft.edges]);
    setWorkflowName(row.name || row.draft.name || 'Untitled agent workflow');
    setWorkflowMeta({
      jurisdiction: row.jurisdiction || row.draft.jurisdiction,
      processType: row.processType || row.draft.processType,
      regulations: row.draft.regulations ?? [],
    });
    setJurisdiction(row.jurisdiction || row.draft.jurisdiction || '');
    setProcessType(row.processType || row.draft.processType || '');
    setActiveWorkflowId(row.id);
    setSelectedId(null);
    setEditingLabel(null);
    setPaletteOpen(false);
    setChatOpen(false);
    setLastSavedFingerprint(workflowFingerprint(
      row.name || row.draft.name || 'Untitled agent workflow',
      {
        jurisdiction: row.jurisdiction || row.draft.jurisdiction,
        processType: row.processType || row.draft.processType,
        regulations: row.draft.regulations ?? [],
      },
      loadedNodes,
      [...row.draft.edges],
    ));
    setTimeout(() => fitView(loadedNodes, canvasRef, setZoom, setPan), 50);
  }, []);

  const loadDraft = useCallback((draft: WorkflowDraft) => {
    const loadedNodes = draftToCanvasNodes(draft);
    setNodes(loadedNodes);
    setEdges([...draft.edges]);
    setWorkflowName(draft.name || 'Untitled agent workflow');
    setWorkflowMeta({
      jurisdiction: draft.jurisdiction,
      processType: draft.processType,
      regulations: draft.regulations,
    });
    setJurisdiction(draft.jurisdiction || '');
    setProcessType(draft.processType || '');
    setActiveWorkflowId(null);
    setSelectedId(null);
    setEditingLabel(null);
    setPaletteOpen(false);
    setLastSavedFingerprint(null);
    setTimeout(() => fitView(loadedNodes, canvasRef, setZoom, setPan), 50);
  }, []);

  const loadedOnce = useRef(false);
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void (async () => {
      try { const c = await api<{ snapshot: CatalogSnapshot }>('/api/builder/catalog'); setCatalog(c.snapshot); } catch { /* */ }
      try { const t = await api<{ templates: TemplateSummary[] }>('/api/builder/templates'); setTemplates(t.templates); } catch { setTemplates([]); }
      void refreshWorkflows();
      try {
        const params = new URLSearchParams(window.location.search);
        const wfId = params.get('workflow');
        const tplId = params.get('template');
        if (wfId) {
          const row = await api<{ id: string; name: string; processType: string; jurisdiction: string; draft: WorkflowDraft }>(`/api/builder/workflows/${wfId}`);
          applyLoadedWorkflow(row);
        } else if (tplId) {
          const r = await api<TemplateDraftResponse>(`/api/builder/templates/${tplId}/draft`);
          loadDraft(r.draft);
        }
      } catch { /* */ }
    })();
  }, [api, applyLoadedWorkflow, loadDraft, refreshWorkflows]);

  // ── Save ──
  const saveCurrent = useCallback(async (): Promise<SavedWorkflowRow | null> => {
    if (nodes.length === 0) {
      showToast('Add at least one step before saving.', true);
      return null;
    }
    setSaving(true);
    try {
      let name = workflowName.trim();
      if (!activeWorkflowId && (!name || name === 'Untitled workflow' || name === 'Untitled agent workflow')) {
        const prompted = window.prompt('Name this workflow:', name || 'Untitled agent workflow') ?? '';
        if (!prompted.trim()) return null;
        name = prompted.trim();
      }
      if (!name) {
        showToast('Workflow name is required.', true);
        return null;
      }

      const { jurisdiction, processType } = resolveWorkflowMeta(workflowMeta);
      const draft = buildDraftFromCanvas(name, workflowMeta, nodes, edges);
      const payload = {
        name,
        processType,
        jurisdiction,
        draft,
        source: 'canvas' as const,
      };

      const saved = activeWorkflowId
        ? await api<SavedWorkflowRow>(`/api/builder/workflows/${activeWorkflowId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await api<SavedWorkflowRow>('/api/builder/workflows', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      setActiveWorkflowId(saved.id);
      setWorkflowName(saved.name);
      setWorkflowMeta((prev) => ({ ...prev, jurisdiction, processType }));
      setLastSavedFingerprint(workflowFingerprint(saved.name, { ...workflowMeta, jurisdiction, processType }, nodes, edges));
      showToast(`Saved "${saved.name}"`);
      void refreshWorkflows();
      return saved;
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', true);
      return null;
    } finally {
      setSaving(false);
    }
  }, [activeWorkflowId, api, edges, nodes, refreshWorkflows, showToast, workflowMeta, workflowName]);

  const buildManagedAgents = useCallback(async () => {
    if (nodes.length === 0) {
      showToast('Add at least one workflow step before building agents.', true);
      return;
    }
    const saved = await saveCurrent();
    if (!saved) return;
    showToast('Workflow saved. Continue with a validated agent build.');
    navigate(`/app/sandbox?workflow=${encodeURIComponent(saved.id)}`);
  }, [navigate, nodes.length, saveCurrent, showToast]);

  // ── Chat send ──
  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatBusy(true);
    const userTurn: ChatTurn = { role: 'user', content: text, ts: new Date().toISOString() };
    const nextChat = [...chat, userTurn];
    setChat(nextChat);
    setChatInput('');
    try {
      // Build conversation history for multi-turn context (exclude system/initial messages)
      const conversationHistory = nextChat
        .filter((t) => t.role === 'user' || (t.role === 'assistant' && !t.content.startsWith('How can I help')))
        .slice(0, -1) // exclude the current message (it's the description)
        .map((t) => ({ role: t.role, content: t.content }));

      const r = await api<BuildResult>('/api/builder/draft', {
        method: 'POST', body: JSON.stringify({
          description: text,
          jurisdiction: jurisdiction || undefined,
          processType: processType || undefined,
          conversation: conversationHistory.length > 0 ? conversationHistory : undefined,
        }),
      });
      const generatedNodes = draftToCanvasNodes(r.draft);
      loadDraft(r.draft);
      setPaletteOpen(false);
      setChatOpen(false);
      setWorkflowMeta({
        jurisdiction: r.draft.jurisdiction || jurisdiction || 'GLOBAL',
        processType: r.draft.processType || processType || 'GENERIC',
        regulations: r.draft.regulations,
      });
      setJurisdiction(r.draft.jurisdiction || jurisdiction || '');
      setProcessType(r.draft.processType || processType || '');

      const saved = await api<SavedWorkflowRow>(activeWorkflowId ? `/api/builder/workflows/${activeWorkflowId}` : '/api/builder/workflows', {
        method: activeWorkflowId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: r.draft.name || 'Untitled agent workflow',
          processType: r.draft.processType || processType || 'GENERIC',
          jurisdiction: r.draft.jurisdiction || jurisdiction || 'GLOBAL',
          draft: r.draft,
          source: 'chat',
        }),
      });
      setActiveWorkflowId(saved.id);
      setWorkflowName(saved.name);
      setLastSavedFingerprint(workflowFingerprint(
        saved.name,
        {
          jurisdiction: r.draft.jurisdiction || jurisdiction || 'GLOBAL',
          processType: r.draft.processType || processType || 'GENERIC',
          regulations: r.draft.regulations,
        },
        generatedNodes,
        [...r.draft.edges],
      ));
      void refreshWorkflows();

      // Build a richer assistant response when semantic context is available
      const sc = r.semanticContext;
      let assistantMsg = `Built "${r.draft.name}" with ${r.draft.nodes.length} steps.`;
      if (sc) {
        const mode = sc.retrieval.embeddingsAvailable ? 'semantic+structural' : 'structural-only';
        assistantMsg += ` Grounded against ${sc.retrieval.totalAuthoritative} obligations (${mode}).`;
        if (sc.ambiguities.length > 0) {
          assistantMsg += `\n\nOpen questions: ${sc.ambiguities.map((a) => `• ${a}`).join('\n')}`;
        }
        if (sc.retrieval.degradedReason) {
          assistantMsg += `\nNote: ${sc.retrieval.degradedReason}`;
        }
      }
      assistantMsg += ' It has been saved. Rearrange on the canvas if you want to refine it.';

      setChat([...nextChat, {
        role: 'assistant',
        content: assistantMsg,
        ts: new Date().toISOString(),
      }]);
      setChatOpen(false);
      showToast(`Built and saved "${saved.name}".`);
    } catch (e) {
      setChat([...nextChat, { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : e}`, ts: new Date().toISOString() }]);
    } finally { setChatBusy(false); }
  }, [activeWorkflowId, api, chat, chatBusy, chatInput, jurisdiction, loadDraft, processType, refreshWorkflows, showToast]);

  // ── Template load ──
  const loadTemplate = useCallback(async (id: string) => {
    try {
      const r = await api<TemplateDraftResponse>(`/api/builder/templates/${id}/draft`);
      loadDraft(r.draft);
      setPaletteOpen(false);
    } catch { /* */ }
  }, [api, loadDraft]);

  // ── Canvas → screen coordinate helpers ──
  const canvasToScreen = useCallback((cx: number, cy: number) => ({
    x: cx * zoom + pan.x, y: cy * zoom + pan.y,
  }), [zoom, pan]);

  const screenToCanvas = useCallback((sx: number, sy: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const rx = rect ? sx - rect.left : sx;
    const ry = rect ? sy - rect.top : sy;
    return { x: (rx - pan.x) / zoom, y: (ry - pan.y) / zoom };
  }, [zoom, pan]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
    setSelectedId(prev => (prev === nodeId ? null : prev));
    setEditingLabel(prev => (prev === nodeId ? null : prev));
  }, []);

  const deleteEdge = useCallback((from: string, to: string) => {
    setEdges(prev => prev.filter(e => !(e.from === from && e.to === to)));
  }, []);

  const startNewWorkflow = useCallback(() => {
    if (nodes.length > 0 && !window.confirm('Start a new workflow? Unsaved changes will be lost.')) return;
    setNodes([]);
    setEdges([]);
    setWorkflowName('Untitled agent workflow');
    setWorkflowMeta({ jurisdiction: '', processType: '', regulations: [] });
    setJurisdiction('');
    setProcessType('');
    setActiveWorkflowId(null);
    setSelectedId(null);
    setEditingLabel(null);
    setLastSavedFingerprint(null);
    showToast('Started a new workflow');
  }, [nodes.length, showToast]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingLabel) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteNode(selectedId);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void saveCurrent();
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        setPendingEdge(null);
        setEditingLabel(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, editingLabel, saveCurrent, deleteNode]);

  // ── Mouse handlers for canvas ──
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Only pan if clicking on empty canvas
    const target = e.target as HTMLElement;
    if (target === canvasRef.current || target.tagName === 'svg' || target.classList.contains('canvas-bg')) {
      setDragState({ type: 'pan', startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y });
      setSelectedId(null);
      setPendingEdge(null);
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState) {
      // Drop preview while dragging from palette
      if (dropPreview) {
        const pos = screenToCanvas(e.clientX, e.clientY);
        setDropPreview(prev => prev ? { ...prev, x: snapToGrid(pos.x - NODE_W / 2), y: snapToGrid(pos.y - NODE_H / 2) } : null);
      }
      return;
    }

    if (dragState.type === 'pan') {
      setPan({
        x: (dragState.panX ?? 0) + (e.clientX - dragState.startX),
        y: (dragState.panY ?? 0) + (e.clientY - dragState.startY),
      });
    } else if (dragState.type === 'node' && dragState.nodeId) {
      const dx = (e.clientX - dragState.startX) / zoom;
      const dy = (e.clientY - dragState.startY) / zoom;
      const nx = snapToGrid((dragState.origX ?? 0) + dx);
      const ny = snapToGrid((dragState.origY ?? 0) + dy);
      setNodes(prev => prev.map(n => n.id === dragState.nodeId ? { ...n, x: nx, y: ny } : n));
    } else if (dragState.type === 'edge' && dragState.fromPort) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setPendingEdge({ fromId: dragState.fromPort, mx: pos.x, my: pos.y });
    }
  }, [dragState, dropPreview, screenToCanvas, zoom]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (dragState?.type === 'edge' && dragState.fromPort && hoverPort) {
      // Complete edge connection
      const fromId = dragState.fromPort;
      const toId = hoverPort.nodeId;
      if (fromId !== toId && !edges.some(ed => ed.from === fromId && ed.to === toId)) {
        setEdges(prev => [...prev, { from: fromId, to: toId }]);
      }
    }
    setDragState(null);
    setPendingEdge(null);

    // Handle palette drop
    if (dropPreview) {
      const pos = screenToCanvas(e.clientX, e.clientY);
      const node = makeNode(dropPreview.kind, dropPreview.kind.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), pos.x - NODE_W / 2, pos.y - NODE_H / 2);
      setNodes(prev => [...prev, node]);
      setDropPreview(null);
      setJustDropped(node.id);
      setTimeout(() => setJustDropped(null), 400);
      setSelectedId(node.id);
      setPaletteOpen(false);
    }
  }, [dragState, dropPreview, edges, hoverPort, screenToCanvas]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom(z => Math.min(3, Math.max(0.1, z * factor)));
  }, []);

  // ── Double-click to add node at position ──
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target !== canvasRef.current && !target.classList.contains('canvas-bg') && target.tagName !== 'svg') return;
    const pos = screenToCanvas(e.clientX, e.clientY);
    const node = makeNode('task', 'New Task', pos.x - NODE_W / 2, pos.y - NODE_H / 2);
    setNodes(prev => [...prev, node]);
    setSelectedId(node.id);
    setEditingLabel(node.id);
    setPaletteOpen(false);
    setChatOpen(false);
    setJustDropped(node.id);
    setTimeout(() => setJustDropped(null), 400);
  }, [screenToCanvas]);

  const selectedNode = nodes.find(n => n.id === selectedId) ?? null;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100vh', background: 'var(--paper)', color: 'var(--ink)' }}>
      {/* Header */}
      <DesignerHeader
        name={workflowName}
        onNameChange={setWorkflowName}
        stepCount={nodes.length}
        isDirty={isDirty}
        isSaved={!!activeWorkflowId && !isDirty}
        onFit={() => fitView(nodes, canvasRef, setZoom, setPan)}
        onSave={() => { void saveCurrent(); }}
        onBuildAgents={() => { void buildManagedAgents(); }}
        saving={saving}
        toast={toast}
        toastError={toastError}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen(v => !v)}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen(v => !v)}
        catalog={catalog}
        jurisdiction={workflowMeta.jurisdiction}
        processType={workflowMeta.processType}
        onJurisdictionChange={(v) => setWorkflowMeta(prev => ({ ...prev, jurisdiction: v }))}
        onProcessTypeChange={(v) => setWorkflowMeta(prev => ({ ...prev, processType: v }))}
        onNewWorkflow={startNewWorkflow}
      />

      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {paletteOpen && (
          <div style={{ position: 'absolute', top: 16, left: 16, bottom: 16, zIndex: 12 }}>
            <NodePalette
              onCollapse={() => setPaletteOpen(false)}
              onDragStart={(kind) => setDropPreview({ kind, x: 0, y: 0 })}
              onDragEnd={() => setDropPreview(null)}
              templates={templates}
              onLoadTemplate={loadTemplate}
              savedWorkflows={savedWorkflows}
              onNewWorkflow={startNewWorkflow}
              onLoadSaved={async (id) => {
                try {
                  const row = await api<{ id: string; name: string; processType: string; jurisdiction: string; draft: WorkflowDraft }>(`/api/builder/workflows/${id}`);
                  applyLoadedWorkflow(row);
                  showToast(`Opened "${row.name}"`);
                } catch (e) {
                  showToast(e instanceof Error ? e.message : 'Could not open workflow', true);
                }
              }}
              onDeleteSaved={async (id) => {
                if (!window.confirm('Delete this workflow?')) return;
                try {
                  await api<void>(`/api/builder/workflows/${id}`, { method: 'DELETE' });
                  if (activeWorkflowId === id) setActiveWorkflowId(null);
                  void refreshWorkflows();
                  showToast('Workflow deleted');
                } catch (e) {
                  showToast(e instanceof Error ? e.message : 'Delete failed', true);
                }
              }}
            />
          </div>
        )}

        {/* Canvas */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          {!paletteOpen && (
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Open starters and saved workflows"
              style={{
                position: 'absolute', left: 16, top: 16,
                zIndex: 6, background: 'rgba(255,255,255,0.94)', border: '1px solid var(--rule)',
                borderRadius: 999, padding: '9px 13px',
                cursor: 'pointer', color: 'var(--ink)', fontSize: 12, fontWeight: 650,
                boxShadow: '0 12px 30px rgba(15,23,42,0.08)',
              }}
            >
              Starters
            </button>
          )}

          <div
            ref={canvasRef}
            className="canvas-bg"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setDragState(null); setPendingEdge(null); }}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            style={{
              flex: 1, position: 'relative', overflow: 'hidden',
              background: 'var(--paper-deep)',
              cursor: dragState?.type === 'pan' ? 'grabbing' : dragState?.type === 'edge' ? 'crosshair' : dropPreview ? 'copy' : 'default',
            }}
          >
          {/* Grid dots */}
          <GridBackground zoom={zoom} pan={pan} />

          {/* Transform layer */}
          <div style={{ position: 'absolute', top: 0, left: 0, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', willChange: 'transform' }}>
            {/* SVG edges */}
            <EdgeLayer
              nodes={nodes}
              edges={edges}
              pendingEdge={pendingEdge}
              onDeleteEdge={deleteEdge}
            />

            {/* Nodes */}
            {nodes.map(n => (
              <CanvasNodeCard
                key={n.id}
                node={n}
                selected={selectedId === n.id}
                editing={editingLabel === n.id}
                justDropped={justDropped === n.id}
                onSelect={() => { setSelectedId(n.id); setEditingLabel(null); }}
                onStartDrag={(e) => {
                  e.stopPropagation();
                  setDragState({ type: 'node', nodeId: n.id, startX: e.clientX, startY: e.clientY, origX: n.x, origY: n.y });
                  setSelectedId(n.id);
                }}
                onStartEdge={(e) => {
                  e.stopPropagation();
                  setDragState({ type: 'edge', startX: e.clientX, startY: e.clientY, fromPort: n.id });
                }}
                onPortHover={(side) => setHoverPort(side ? { nodeId: n.id, side } : null)}
                portGlow={hoverPort?.nodeId === n.id ? hoverPort.side : null}
                onDoubleClick={() => { setSelectedId(n.id); setEditingLabel(n.id); }}
                onEdit={() => { setSelectedId(n.id); setEditingLabel(n.id); }}
                onDelete={() => deleteNode(n.id)}
                onLabelChange={(label) => {
                  setNodes(prev => prev.map(nd => nd.id === n.id ? { ...nd, label } : nd));
                }}
                onLabelCommit={() => setEditingLabel(null)}
              />
            ))}

            {/* Drop preview ghost */}
            {dropPreview && (
              <div style={{
                position: 'absolute', left: dropPreview.x, top: dropPreview.y,
                width: NODE_W, height: NODE_H,
                border: '2px dashed color-mix(in srgb, var(--ink) 32%, transparent)', borderRadius: 18,
                opacity: 0.72, pointerEvents: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'color-mix(in srgb, var(--paper) 80%, transparent)',
                color: 'var(--ink-3)', fontSize: 12,
              }}>
                <WorkflowIcon kind={dropPreview.kind} size={16} /> Drop here
              </div>
            )}
          </div>

          {/* Empty state */}
          {nodes.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{ textAlign: 'center', color: 'var(--ink-3)', maxWidth: 420, padding: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--ink-2)' }}>Start here</div>
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  Open a starter template from the sidebar, use Build with AI, or double-click anywhere to add your first step.
                </div>
              </div>
            </div>
          )}

          {selectedNode && !chatOpen && (
            <NodeInspector
              node={selectedNode}
              onChange={(updates) => setNodes(prev => prev.map(n => n.id === selectedId ? { ...n, ...updates } : n))}
              onClose={() => setSelectedId(null)}
              onDelete={() => deleteNode(selectedNode.id)}
              onRename={() => setEditingLabel(selectedNode.id)}
              onDeleteEdge={deleteEdge}
              edges={edges}
              nodes={nodes}
            />
          )}
          </div>
        </div>

        {/* Chat panel (optional) */}
        {chatOpen && (
          <div style={{ position: 'absolute', top: 16, right: 16, bottom: 16, zIndex: 14 }}>
            <ChatPanel
              chat={chat}
              input={chatInput}
              setInput={setChatInput}
              send={sendChat}
              busy={chatBusy}
              jurisdiction={jurisdiction}
              setJurisdiction={(v) => {
                setJurisdiction(v);
                setWorkflowMeta((prev) => ({ ...prev, jurisdiction: v }));
              }}
              processType={processType}
              setProcessType={(v) => {
                setProcessType(v);
                setWorkflowMeta((prev) => ({ ...prev, processType: v }));
              }}
              catalog={catalog}
              onClose={() => setChatOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────

function DesignerHeader(props: {
  name: string; onNameChange: (v: string) => void;
  stepCount: number;
  isDirty: boolean;
  isSaved: boolean;
  onFit: () => void;
  onSave: () => void; saving: boolean; toast: string | null; toastError?: boolean;
  onBuildAgents: () => void;
  chatOpen: boolean; onToggleChat: () => void;
  detailsOpen: boolean; onToggleDetails: () => void;
  catalog: CatalogSnapshot | null;
  jurisdiction: string;
  processType: string;
  onJurisdictionChange: (v: string) => void;
  onProcessTypeChange: (v: string) => void;
  onNewWorkflow: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      background: 'var(--paper)', borderBottom: '1px solid var(--rule)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 56, gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <Link href="/app" style={{ color: 'var(--ink-3)', textDecoration: 'none', fontSize: 13, flexShrink: 0 }}>{'\u2190'} Command Center</Link>
          <div style={{ width: 1, height: 20, background: 'var(--rule)', flexShrink: 0 }} />
          {editingName ? (
            <input
              autoFocus
              value={props.name}
              onChange={e => props.onNameChange(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={e => { if (e.key === 'Enter') setEditingName(false); }}
              style={{
                background: 'transparent', border: '1px solid var(--rule)', borderRadius: 6,
                color: 'var(--ink)', fontSize: 16, fontWeight: 600, padding: '4px 8px', outline: 'none',
                minWidth: 180, maxWidth: 360,
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              title="Rename workflow"
              style={{
                background: 'transparent', border: 0, padding: 0, cursor: 'text',
                fontSize: 16, fontWeight: 600, color: 'var(--ink)', textAlign: 'left',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {props.name}
            </button>
          )}
          {props.isDirty && (
            <span style={{
              fontSize: 11, color: 'var(--warn, #b45309)', background: 'var(--signal-soft, #fff7ed)',
              border: '1px solid var(--rule)', borderRadius: 999, padding: '3px 10px', flexShrink: 0,
            }}>
              Unsaved changes
            </span>
          )}
          {props.isSaved && (
            <span style={{
              fontSize: 11,
              color: 'var(--ok, #2a8c4f)',
              background: 'rgba(42, 140, 79, 0.08)',
              border: '1px solid rgba(42, 140, 79, 0.22)',
              borderRadius: 999,
              padding: '3px 10px',
              flexShrink: 0,
            }}>
              Saved
            </span>
          )}
          {props.stepCount > 0 && (
            <span style={{ fontSize: 12, color: 'var(--ink-3)', flexShrink: 0 }}>
              {props.stepCount} {props.stepCount === 1 ? 'step' : 'steps'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <HdrBtn onClick={props.onToggleDetails} active={props.detailsOpen} title="Jurisdiction and process type">
            Scope
          </HdrBtn>
          <HdrBtn onClick={props.onToggleChat} active={props.chatOpen} title="Describe an agent workflow in plain language">
            Generate
          </HdrBtn>
          <HdrBtn onClick={props.onFit} title="Fit workflow to screen">Fit</HdrBtn>
          <button
            onClick={props.onSave}
            disabled={props.saving || props.stepCount === 0}
            title={props.stepCount === 0 ? 'Add at least one step before saving' : 'Save workflow (Ctrl+S)'}
            style={{
              background: 'var(--ink)', color: 'var(--paper)', border: 0, borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 600, marginLeft: 4,
              cursor: props.saving ? 'wait' : props.stepCount === 0 ? 'not-allowed' : 'pointer',
              opacity: props.saving || props.stepCount === 0 ? 0.55 : 1,
            }}
          >
            {props.saving ? 'Saving\u2026' : 'Save workflow'}
          </button>
          <button
            onClick={props.onBuildAgents}
            disabled={props.saving || props.stepCount === 0}
            title={props.stepCount === 0 ? 'Add at least one step first' : 'Save this workflow and continue to validated agent builds'}
            style={{
              background: 'var(--orange)', color: '#fff', border: 0, borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 650,
              cursor: props.saving ? 'wait' : props.stepCount === 0 ? 'not-allowed' : 'pointer',
              opacity: props.saving || props.stepCount === 0 ? 0.55 : 1,
            }}
          >
            Build agents
          </button>
        </div>
      </div>

      {props.detailsOpen && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px 12px',
          borderTop: '1px solid var(--rule)', paddingTop: 12,
        }}>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Applies to</span>
          <select
            value={props.jurisdiction}
            onChange={e => props.onJurisdictionChange(e.target.value)}
            style={{ ...hdrSelectStyle, minWidth: 140 }}
          >
            <option value="">Any jurisdiction</option>
            {props.catalog?.jurisdictions.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
          <select
            value={props.processType}
            onChange={e => props.onProcessTypeChange(e.target.value)}
            style={{ ...hdrSelectStyle, minWidth: 140 }}
          >
            <option value="">Any process type</option>
            {props.catalog?.processTypes.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <HdrBtn onClick={props.onNewWorkflow} title="Start a blank agent workflow">New workflow</HdrBtn>
        </div>
      )}

      {props.toast && (
        <div style={{
          padding: '8px 20px', fontSize: 12,
          color: props.toastError ? 'var(--err)' : 'var(--ok)',
          background: props.toastError ? 'rgba(220,38,38,0.06)' : 'rgba(22,163,74,0.06)',
          borderTop: '1px solid var(--rule)',
        }}>
          {props.toast}
        </div>
      )}
    </div>
  );
}

const hdrSelectStyle: React.CSSProperties = {
  background: 'var(--paper-deep)', color: 'var(--ink)', border: '1px solid var(--rule)',
  borderRadius: 6, padding: '4px 6px', fontSize: 11, outline: 'none',
};

function HdrBtn({ onClick, children, active, title }: { onClick: () => void; children: React.ReactNode; active?: boolean; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: active ? 'var(--ink)' : 'var(--paper-deep)', color: active ? 'var(--paper)' : 'var(--ink-2)',
      border: '1px solid var(--rule)', borderRadius: 6,
      padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: active ? 600 : 400,
    }}>{children}</button>
  );
}

// ─── Node Palette ─────────────────────────────────────────────────────────

type SavedWorkflowRow = { id: string; name: string; processType: string; jurisdiction: string; description: string | null; source: string; sourceTemplateId: string | null; updatedAt: string };

function NodePalette(props: {
  onCollapse: () => void;
  onDragStart: (kind: WorkflowNodeKind) => void;
  onDragEnd: () => void;
  templates: TemplateSummary[] | null;
  onLoadTemplate: (id: string) => void;
  savedWorkflows: SavedWorkflowRow[] | null;
  onLoadSaved: (id: string) => void;
  onDeleteSaved: (id: string) => void;
  onNewWorkflow: () => void;
}) {
  const [section, setSection] = useState<'templates' | 'nodes' | 'saved'>('templates');

  const tabs = [
    { id: 'templates' as const, label: 'Starters' },
    { id: 'nodes' as const, label: 'Add steps' },
    { id: 'saved' as const, label: 'Saved' },
  ];

  return (
    <div style={{
      width: 292, height: '100%', border: '1px solid var(--rule)', borderRadius: 18,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(255,255,255,0.96)', flexShrink: 0,
      boxShadow: '0 24px 70px rgba(15,23,42,0.14)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--ink)' }}>Add to canvas</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.45 }}>
            Choose a starter, saved workflow, or step.
          </div>
        </div>
        <button
          type="button"
          onClick={props.onCollapse}
          title="Hide sidebar"
          style={{
            background: 'transparent', border: '1px solid var(--rule)', borderRadius: 6,
            color: 'var(--ink-3)', cursor: 'pointer', width: 28, height: 28, flexShrink: 0,
          }}
        >
          {'\u203A'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '10px 12px 0' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setSection(tab.id)} style={{
            flex: 1, padding: '8px 6px', fontSize: 12, fontWeight: section === tab.id ? 600 : 500,
            cursor: 'pointer', border: '1px solid var(--rule)', borderRadius: 8,
            background: section === tab.id ? 'var(--ink)' : 'var(--paper)',
            color: section === tab.id ? 'var(--paper)' : 'var(--ink-2)',
          }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {section === 'nodes' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12, lineHeight: 1.5 }}>
              Drag a step onto the canvas, or double-click the canvas to add one.
            </div>
            {PALETTE_CATEGORIES.map(cat => (
              <div key={cat.label} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--ink-2)', marginBottom: 8 }}>
                  {cat.label}
                </div>
                {cat.nodes.map(n => (
                  <div
                    key={n.kind}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', n.kind);
                      props.onDragStart(n.kind);
                    }}
                    onDragEnd={props.onDragEnd}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 11px', marginBottom: 6, borderRadius: 12,
                      border: '1px solid var(--rule)', cursor: 'grab',
                      background: 'var(--paper)',
                      transition: 'transform 100ms, box-shadow 100ms',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
                  >
                    <span style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: AUTOMATION_COLORS[defaultAutomation(n.kind)].accent + '18',
                      color: AUTOMATION_COLORS[defaultAutomation(n.kind)].accent,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
                    }}>
                      <WorkflowIcon kind={n.kind} color={AUTOMATION_COLORS[defaultAutomation(n.kind)].accent} size={18} />
                    </span>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{n.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{n.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
        {section === 'templates' && (
          <>
            {!props.templates && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Loading starters...</div>}
            {props.templates?.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>No starters available.</div>}
            {props.templates?.map(t => (
              <button key={t.id} onClick={() => props.onLoadTemplate(t.id)} style={{
                width: '100%', textAlign: 'left', padding: '13px 14px', marginBottom: 8,
                background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 14,
                cursor: 'pointer', color: 'var(--ink)',
              }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  marginTop: 4,
                  lineHeight: 1.45,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {t.description}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>
                  {t.steps.length} steps{t.hitlGates.length > 0 ? ` · ${t.hitlGates.length} approvals` : ''}
                </div>
              </button>
            ))}
          </>
        )}
        {section === 'saved' && (
          <>
            <button
              type="button"
              onClick={props.onNewWorkflow}
              style={{
                width: '100%', marginBottom: 10, padding: '10px 12px',
                background: 'var(--paper-deep)', border: '1px solid var(--rule)', borderRadius: 8,
                color: 'var(--ink-2)', fontSize: 12, cursor: 'pointer',
              }}
            >
              Start a blank workflow
            </button>
            {!props.savedWorkflows && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Loading...</div>}
            {props.savedWorkflows?.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                Nothing saved yet. Build an agent workflow on the canvas, then click Save workflow.
              </div>
            )}
            {props.savedWorkflows?.map(w => (
              <div key={w.id} style={{
                display: 'flex', marginBottom: 6, border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden', background: 'var(--paper)',
              }}>
                <div style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{w.processType} {'\u00B7'} {w.jurisdiction}</div>
                </div>
                <button
                  onClick={() => props.onLoadSaved(w.id)}
                  title="Open this workflow"
                  style={{
                    background: 'var(--ink)', color: 'var(--paper)', border: 0, cursor: 'pointer',
                    padding: '0 12px', fontSize: 11, fontWeight: 600, flexShrink: 0,
                  }}
                >
                  Open
                </button>
                <button
                  onClick={() => props.onDeleteSaved(w.id)}
                  title="Delete saved workflow"
                  style={{
                    background: 'transparent', border: 0, color: 'var(--err)', cursor: 'pointer',
                    padding: '0 10px', fontSize: 12, flexShrink: 0,
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Grid Background ──────────────────────────────────────────────────────

function GridBackground({ zoom, pan }: { zoom: number; pan: { x: number; y: number } }) {
  const spacing = GRID_SIZE * zoom;
  const ox = pan.x % spacing;
  const oy = pan.y % spacing;
  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <defs>
        <pattern id="grid" width={spacing} height={spacing} patternUnits="userSpaceOnUse" x={ox} y={oy}>
          <circle cx={1} cy={1} r={0.8} fill="var(--ink-4)" opacity={0.4} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  );
}

// ─── Edge Layer ───────────────────────────────────────────────────────────

function nodeCenter(node: CanvasNode) {
  return { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 };
}

function anchorPoint(node: CanvasNode, side: PortSide) {
  if (side === 'top') return { x: node.x + NODE_W / 2, y: node.y, side };
  if (side === 'bottom') return { x: node.x + NODE_W / 2, y: node.y + NODE_H, side };
  if (side === 'left') return { x: node.x, y: node.y + NODE_H / 2, side };
  return { x: node.x + NODE_W, y: node.y + NODE_H / 2, side };
}

function anchorTowardPoint(node: CanvasNode, x: number, y: number) {
  const c = nodeCenter(node);
  const dx = x - c.x;
  const dy = y - c.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return anchorPoint(node, dx >= 0 ? 'right' : 'left');
  }
  return anchorPoint(node, dy >= 0 ? 'bottom' : 'top');
}

function edgeRoute(from: CanvasNode, to: CanvasNode) {
  const a = nodeCenter(from);
  const b = nodeCenter(to);
  const start = anchorTowardPoint(from, b.x, b.y);
  const end = anchorTowardPoint(to, a.x, a.y);
  const startVertical = start.side === 'top' || start.side === 'bottom';
  const endVertical = end.side === 'top' || end.side === 'bottom';
  const startSign = start.side === 'right' || start.side === 'bottom' ? 1 : -1;
  const endSign = end.side === 'right' || end.side === 'bottom' ? 1 : -1;
  const bend = Math.max(70, Math.min(150, Math.hypot(end.x - start.x, end.y - start.y) * 0.32));
  const c1 = {
    x: start.x + (startVertical ? 0 : bend * startSign),
    y: start.y + (startVertical ? bend * startSign : 0),
  };
  const c2 = {
    x: end.x + (endVertical ? 0 : bend * endSign),
    y: end.y + (endVertical ? bend * endSign : 0),
  };
  return {
    path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    labelX: (start.x + end.x) / 2,
    labelY: (start.y + end.y) / 2,
  };
}

function EdgeLayer(props: {
  nodes: CanvasNode[];
  edges: WorkflowEdge[];
  pendingEdge: null | { fromId: string; mx: number; my: number };
  onDeleteEdge: (from: string, to: string) => void;
}) {
  const nodeMap = useMemo(() => new Map(props.nodes.map(n => [n.id, n])), [props.nodes]);
  const bounds = useMemo(() => {
    if (props.nodes.length === 0) return { w: 800, h: 600 };
    const maxX = Math.max(...props.nodes.map(n => n.x + NODE_W)) + 200;
    const maxY = Math.max(...props.nodes.map(n => n.y + NODE_H)) + 200;
    return { w: Math.max(800, maxX), h: Math.max(600, maxY) };
  }, [props.nodes]);

  return (
    <svg width={bounds.w} height={bounds.h} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="color-mix(in srgb, var(--ink) 42%, transparent)" />
        </marker>
        <marker id="arrowhead-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--orange)" />
        </marker>
      </defs>
      {props.edges.map((e, i) => {
        const a = nodeMap.get(e.from);
        const b = nodeMap.get(e.to);
        if (!a || !b) return null;
        const route = edgeRoute(a, b);
        return (
          <g key={i} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onClick={() => props.onDeleteEdge(e.from, e.to)}>
            <title>Click to remove connection</title>
            <path d={route.path}
              stroke="transparent" strokeWidth={12} fill="none" />
            <path d={route.path}
              stroke="color-mix(in srgb, var(--ink) 38%, transparent)" strokeWidth={1.8} fill="none" markerEnd="url(#arrowhead)"
              style={{ transition: 'stroke 150ms', filter: 'drop-shadow(0 1px 0 rgba(255,255,255,0.7))' }} />
            {e.label && (
              <text x={route.labelX} y={route.labelY - 8} fontSize={10} fill="var(--ink-3)" textAnchor="middle">{e.label}</text>
            )}
          </g>
        );
      })}
      {/* Pending edge preview */}
      {props.pendingEdge && (() => {
        const from = nodeMap.get(props.pendingEdge.fromId);
        if (!from) return null;
        const start = anchorTowardPoint(from, props.pendingEdge.mx, props.pendingEdge.my);
        const mx = props.pendingEdge.mx;
        const my = props.pendingEdge.my;
        const vertical = start.side === 'top' || start.side === 'bottom';
        const dx = vertical ? 0 : Math.max(60, Math.abs(mx - start.x) * 0.35) * (start.side === 'right' ? 1 : -1);
        const dy = vertical ? Math.max(60, Math.abs(my - start.y) * 0.35) * (start.side === 'bottom' ? 1 : -1) : 0;
        return (
          <path d={`M ${start.x} ${start.y} C ${start.x + dx} ${start.y + dy}, ${mx - dx} ${my - dy}, ${mx} ${my}`}
            stroke="var(--orange)" strokeWidth={2} fill="none" strokeDasharray="6 4"
            markerEnd="url(#arrowhead-active)" style={{ pointerEvents: 'none' }} />
        );
      })()}
    </svg>
  );
}

// ─── Canvas Node Card ─────────────────────────────────────────────────────

function CanvasNodeCard(props: {
  node: CanvasNode;
  selected: boolean;
  editing: boolean;
  justDropped: boolean;
  onSelect: () => void;
  onStartDrag: (e: React.MouseEvent) => void;
  onStartEdge: (e: React.MouseEvent) => void;
  onPortHover: (side: PortSide | null) => void;
  portGlow: PortSide | null;
  onDoubleClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onLabelChange: (label: string) => void;
  onLabelCommit: () => void;
}) {
  const { node, selected, editing, justDropped } = props;
  const c = AUTOMATION_COLORS[node.automation];
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  return (
    <div
      onMouseDown={props.onStartDrag}
      onClick={(e) => { e.stopPropagation(); props.onSelect(); }}
      onDoubleClick={(e) => { e.stopPropagation(); props.onDoubleClick(); }}
      style={{
        position: 'absolute', left: node.x, top: node.y, width: NODE_W, height: NODE_H,
        background: 'color-mix(in srgb, var(--paper) 96%, white)',
        border: `1.5px solid ${selected ? c.accent : 'var(--rule)'}`,
        borderRadius: 18, cursor: 'grab', userSelect: 'none',
        boxShadow: selected
          ? `0 0 0 4px ${c.glow}, 0 18px 42px rgba(15,23,42,0.16)`
          : '0 10px 24px rgba(15,23,42,0.08)',
        transition: 'box-shadow 150ms, border-color 150ms, transform 300ms cubic-bezier(0.34,1.56,0.64,1)',
        transform: justDropped ? 'scale(1.05)' : 'scale(1)',
        display: 'flex', overflow: 'visible',
      }}
    >
      {selected && !editing && (
        <div style={{
          position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 3,
        }}>
          <button
            type="button"
            title="Rename step"
            onClick={(e) => { e.stopPropagation(); props.onEdit(); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={nodeActionBtnStyle}
          >
            Edit
          </button>
          <button
            type="button"
            title="Delete step"
            onClick={(e) => { e.stopPropagation(); props.onDelete(); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ ...nodeActionBtnStyle, color: 'var(--err)', borderColor: 'var(--err)' }}
          >
            Delete
          </button>
        </div>
      )}

      {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
        <ConnectionPort
          key={side}
          side={side}
          accent={c.accent}
          glow={c.glow}
          active={props.portGlow === side}
          onStartEdge={props.onStartEdge}
          onHover={props.onPortHover}
        />
      ))}

      {/* Body */}
      <div style={{ flex: 1, padding: '16px 18px', display: 'grid', gridTemplateColumns: '42px 1fr', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 14,
          background: `${c.accent}14`, color: c.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `inset 0 0 0 1px ${c.accent}2a`,
        }}>
          <WorkflowIcon kind={node.kind} color={c.accent} size={21} />
        </div>
        <div style={{ minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            value={node.label}
            onChange={e => props.onLabelChange(e.target.value)}
            onBlur={props.onLabelCommit}
            onKeyDown={e => { if (e.key === 'Enter') props.onLabelCommit(); }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            style={{
              background: 'transparent', border: '1px solid var(--rule)', borderRadius: 4,
              color: 'var(--ink)', fontSize: 13, fontWeight: 600, padding: '1px 4px', outline: 'none', width: '100%',
            }}
          />
        ) : (
          <div style={{
            fontWeight: 650, fontSize: 14, color: 'var(--ink)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', lineHeight: 1.28,
          }}>
            {node.label}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 7 }}>
          {AUTOMATION_LABEL[node.automation]}
        </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionPort(props: {
  side: PortSide;
  accent: string;
  glow: string;
  active: boolean;
  onStartEdge: (e: React.MouseEvent) => void;
  onHover: (side: PortSide | null) => void;
}) {
  const position: Record<PortSide, React.CSSProperties> = {
    top: { top: -PORT_R, left: NODE_W / 2 - PORT_R },
    right: { right: -PORT_R, top: NODE_H / 2 - PORT_R },
    bottom: { bottom: -PORT_R, left: NODE_W / 2 - PORT_R },
    left: { left: -PORT_R, top: NODE_H / 2 - PORT_R },
  };
  return (
    <div
      onMouseDown={(e) => { e.stopPropagation(); props.onStartEdge(e); }}
      onMouseEnter={() => props.onHover(props.side)}
      onMouseLeave={() => props.onHover(null)}
      title="Drag to connect steps"
      style={{
        position: 'absolute',
        ...position[props.side],
        width: PORT_R * 2,
        height: PORT_R * 2,
        borderRadius: '50%',
        background: props.active ? props.accent : 'var(--paper)',
        border: `2px solid ${props.active ? props.accent : 'color-mix(in srgb, var(--ink) 22%, transparent)'}`,
        cursor: 'crosshair',
        zIndex: 2,
        transition: 'background 150ms, border-color 150ms, transform 150ms, opacity 150ms',
        transform: props.active ? 'scale(1.35)' : 'scale(1)',
        opacity: props.active ? 1 : 0.58,
        boxShadow: props.active ? `0 0 10px ${props.glow}` : '0 1px 4px rgba(15,23,42,0.1)',
      }}
    />
  );
}

// ─── Node Inspector ───────────────────────────────────────────────────────

function NodeInspector(props: {
  node: CanvasNode;
  onChange: (updates: Partial<CanvasNode>) => void;
  onClose: () => void;
  onDelete: () => void;
  onRename: () => void;
  onDeleteEdge: (from: string, to: string) => void;
  edges: WorkflowEdge[];
  nodes: CanvasNode[];
}) {
  const { node, onChange, onClose, onDelete, onRename, onDeleteEdge } = props;
  const c = AUTOMATION_COLORS[node.automation];
  const inboundEdges = props.edges.filter(e => e.to === node.id);
  const outboundEdges = props.edges.filter(e => e.from === node.id);

  return (
    <div style={{
      position: 'absolute', top: 16, right: 16, width: 320, maxHeight: 'calc(100% - 32px)',
      background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 12,
      boxShadow: '0 12px 40px rgba(0,0,0,0.12)', zIndex: 4,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--rule)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}>Selected step</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: c.accent, flexShrink: 0, display: 'inline-flex' }}>
              <WorkflowIcon kind={node.kind} color={c.accent} size={18} />
            </span>
            <strong style={{ fontSize: 15, lineHeight: 1.3 }}>{node.label}</strong>
          </div>
        </div>
        <button type="button" onClick={onClose} style={{ background: 'transparent', border: 0, color: 'var(--ink-3)', cursor: 'pointer', fontSize: 16 }}>{'\u2715'}</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={inspLabelStyle}>Step name</div>
            <input
              value={node.label}
              onChange={e => onChange({ label: e.target.value })}
              style={inspInputStyle}
            />
          </div>
          <div>
            <div style={inspLabelStyle}>What happens here</div>
            <textarea
              value={node.description}
              onChange={e => onChange({ description: e.target.value })}
              rows={3}
              style={{ ...inspInputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <div>
            <div style={inspLabelStyle}>Handled by</div>
            <select value={node.automation} onChange={e => onChange({ automation: e.target.value as AutomationKind })} style={inspInputStyle}>
              <option value="system">Automated</option>
              <option value="agent">AI agent</option>
              <option value="human">Manual review</option>
              <option value="hybrid">Mixed</option>
            </select>
          </div>
          {(inboundEdges.length > 0 || outboundEdges.length > 0) && (
            <div>
              <div style={inspLabelStyle}>Connections</div>
              <div style={{ color: 'var(--ink-2)', lineHeight: 1.6, fontSize: 12 }}>
                {inboundEdges.map(e => {
                  const from = props.nodes.find(n => n.id === e.from);
                  return (
                    <div key={`in-${e.from}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span>From: {from?.label ?? e.from}</span>
                      <button type="button" onClick={() => onDeleteEdge(e.from, e.to)} style={inspLinkBtnStyle}>Remove</button>
                    </div>
                  );
                })}
                {outboundEdges.map(e => {
                  const to = props.nodes.find(n => n.id === e.to);
                  return (
                    <div key={`out-${e.to}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span>To: {to?.label ?? e.to}</span>
                      <button type="button" onClick={() => onDeleteEdge(e.from, e.to)} style={inspLinkBtnStyle}>Remove</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {node.rationale && (
          <div style={{ marginTop: 14, color: 'var(--ink-3)', lineHeight: 1.5, fontSize: 12 }}>
            {node.rationale}
          </div>
        )}
      </div>

      <div style={{
        padding: '12px 16px', borderTop: '1px solid var(--rule)',
        display: 'flex', gap: 8,
      }}>
        <button type="button" onClick={onRename} style={{ ...inspActionBtnStyle, flex: 1 }}>Rename on canvas</button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete step "${node.label}"?`)) onDelete();
          }}
          style={{ ...inspActionBtnStyle, color: 'var(--err)', borderColor: 'var(--err)' }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

const inspLabelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6,
};
const inspInputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--paper-deep)', border: '1px solid var(--rule)',
  borderRadius: 6, color: 'var(--ink)', padding: '6px 8px', fontSize: 12, outline: 'none',
};
const inspActionBtnStyle: React.CSSProperties = {
  background: 'var(--paper-deep)', border: '1px solid var(--rule)', borderRadius: 6,
  color: 'var(--ink)', padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
};
const inspLinkBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 0, color: 'var(--err)', cursor: 'pointer',
  fontSize: 11, padding: 0, flexShrink: 0,
};
const nodeActionBtnStyle: React.CSSProperties = {
  background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 6,
  color: 'var(--ink-2)', padding: '2px 6px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
};

// ─── Chat Panel ───────────────────────────────────────────────────────────

function ChatPanel(props: {
  chat: ChatTurn[]; input: string; setInput: (v: string) => void;
  send: () => void; busy: boolean;
  jurisdiction: string; setJurisdiction: (v: string) => void;
  processType: string; setProcessType: (v: string) => void;
  catalog: CatalogSnapshot | null;
  onClose: () => void;
}) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [props.chat]);

  return (
    <div style={{
      width: 380, height: '100%', border: '1px solid var(--rule)', borderRadius: 18,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(255,255,255,0.97)', flexShrink: 0,
      boxShadow: '0 24px 70px rgba(15,23,42,0.16)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 650 }}>Build with AI</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>Describe the workflow. It will appear on the canvas.</div>
        </div>
        <button onClick={props.onClose} style={{ background: 'transparent', border: 0, color: 'var(--ink-3)', cursor: 'pointer', fontSize: 16 }}>{'\u2715'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--rule)' }}>
        <select value={props.jurisdiction} onChange={e => props.setJurisdiction(e.target.value)} style={selectStyle}>
          <option value="">Any jurisdiction</option>
          {props.catalog?.jurisdictions.map(j => <option key={j} value={j}>{j}</option>)}
        </select>
        <select value={props.processType} onChange={e => props.setProcessType(e.target.value)} style={selectStyle}>
          <option value="">Any process type</option>
          {props.catalog?.processTypes.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {props.chat.map((t, i) => (
          <div key={i} style={{
            alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '90%', padding: '8px 12px', borderRadius: 10,
            background: t.role === 'user' ? 'var(--ink)' : 'var(--paper-deep)',
            color: t.role === 'user' ? 'var(--paper)' : 'var(--ink)',
            fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap',
            border: t.role === 'user' ? 'none' : '1px solid var(--rule)',
          }}>{t.content}</div>
        ))}
        {props.busy && <div style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>Building your workflow...</div>}
        <div ref={chatEndRef} />
      </div>

      <div style={{ borderTop: '1px solid var(--rule)', padding: '10px 12px' }}>
        <textarea
          value={props.input}
          onChange={e => props.setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); props.send(); } }}
          placeholder="Example: EU MDR adverse event reportability with vigilance officer approval..."
          rows={3}
          style={{ ...selectStyle, resize: 'vertical', fontFamily: 'inherit', width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Ctrl+Enter to build</span>
          <button onClick={props.send} disabled={props.busy || !props.input.trim()} style={{
            background: props.busy || !props.input.trim() ? 'var(--paper-deep)' : 'var(--ink)',
            color: props.busy || !props.input.trim() ? 'var(--ink-3)' : 'var(--paper)',
            border: 0, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
            cursor: props.busy || !props.input.trim() ? 'not-allowed' : 'pointer',
          }}>{props.busy ? 'Building\u2026' : 'Build workflow'}</button>
        </div>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: 'var(--paper-deep)', color: 'var(--ink)', border: '1px solid var(--rule)',
  borderRadius: 6, padding: '6px 8px', fontSize: 12, outline: 'none',
};

// ─── Auto-layout ──────────────────────────────────────────────────────────

function autoLayout(workflowNodes: WorkflowNode[], edges: WorkflowEdge[]): CanvasNode[] {
  if (workflowNodes.length === 0) return [];

  const idIndex = new Map(workflowNodes.map(n => [n.id, n]));
  const adjOut = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of workflowNodes) { adjOut.set(n.id, []); indeg.set(n.id, 0); }
  for (const e of edges) {
    if (!idIndex.has(e.from) || !idIndex.has(e.to)) continue;
    adjOut.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }

  // Longest-path layering
  const layer = new Map<string, number>();
  const queue: string[] = [];
  const tempIndeg = new Map(indeg);
  for (const n of workflowNodes) {
    if ((tempIndeg.get(n.id) ?? 0) === 0) { queue.push(n.id); layer.set(n.id, 0); }
  }
  while (queue.length) {
    const id = queue.shift()!;
    const l = layer.get(id) ?? 0;
    for (const nb of adjOut.get(id) ?? []) {
      layer.set(nb, Math.max(layer.get(nb) ?? 0, l + 1));
      tempIndeg.set(nb, (tempIndeg.get(nb) ?? 1) - 1);
      if ((tempIndeg.get(nb) ?? 0) === 0) queue.push(nb);
    }
  }
  for (const n of workflowNodes) { if (!layer.has(n.id)) layer.set(n.id, 0); }

  // Group by column
  const cols = new Map<number, WorkflowNode[]>();
  for (const n of workflowNodes) {
    const c = layer.get(n.id) ?? 0;
    if (!cols.has(c)) cols.set(c, []);
    cols.get(c)!.push(n);
  }

  const result: CanvasNode[] = [];
  for (const [col, group] of cols) {
    group.forEach((n, row) => {
      result.push({
        ...n,
        x: snapToGrid(100 + col * (NODE_W + 80)),
        y: snapToGrid(80 + row * (NODE_H + 40)),
      });
    });
  }
  return result;
}

function fitView(
  nodes: CanvasNode[],
  canvasRef: React.RefObject<HTMLDivElement | null>,
  setZoom: (z: number) => void,
  setPan: (p: { x: number; y: number }) => void,
) {
  if (nodes.length === 0 || !canvasRef.current) return;
  const cw = canvasRef.current.clientWidth;
  const ch = canvasRef.current.clientHeight;
  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxX = Math.max(...nodes.map(n => n.x + NODE_W));
  const maxY = Math.max(...nodes.map(n => n.y + NODE_H));
  const w = maxX - minX + 120;
  const h = maxY - minY + 120;
  const z = Math.min(1.5, Math.max(0.15, Math.min(cw / w, ch / h)));
  setZoom(z);
  setPan({ x: (cw - w * z) / 2 - minX * z + 60 * z, y: (ch - h * z) / 2 - minY * z + 60 * z });
}

export default ProcessDesigner;
