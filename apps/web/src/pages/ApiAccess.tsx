/**
 * Connect — Smarticus
 *
 * Hayes Raffle: a "connect" page is a trust handoff. The user is about to
 * point an outside system at our brain. The page must:
 *   1. Tell them WHICH outside system (the tool grid)
 *   2. Give them the keys (API key creation)
 *   3. Give them the EXACT words to paste (the integration prompt)
 *
 * Two parallel paths: vibe-coder (paste-into-Cursor) and dev team (npm/curl).
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/queryClient.js';
import { Link } from 'wouter';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState } from '../components/ui/EmptyState.js';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number;
  active: boolean;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
}

// Backend POST /api/api-keys returns the row plus the raw key under `key`.
interface CreateKeyResponse {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number;
  expiresAt?: string | null;
  createdAt: string;
}

const AVAILABLE_SCOPES = [
  { id: 'graph:read',         label: 'Read knowledge graph',     desc: 'Query requirements, citations, cross-refs.' },
  { id: 'graph:write',        label: 'Write to knowledge graph', desc: 'Add or modify obligation YAML.' },
  { id: 'compliance:check',   label: 'Compliance check',          desc: 'Run readiness + validation gates.' },
  { id: 'traces:read',        label: 'Read decision trails',     desc: 'Pull hash-chained audit logs.' },
  { id: 'processes:read',     label: 'Read processes',            desc: 'List process definitions and instances.' },
  { id: 'processes:write',    label: 'Run processes',             desc: 'Trigger sandbox executions.' },
  { id: 'evidence:read',      label: 'Read evidence',             desc: 'Pull evidence catalog and bindings.' },
  { id: 'evidence:write',     label: 'Upload evidence',           desc: 'Submit new evidence objects.' },
];

type ToolChoice =
  | 'cursor'
  | 'claude-code'
  | 'windsurf'
  | 'vscode'
  | 'github-workspace'
  | 'lovable'
  | 'replit'
  | 'google-ai-studio'
  | 'dev-team';

const TOOL_OPTIONS: { id: ToolChoice; label: string; mark: string; tagline: string }[] = [
  { id: 'cursor',           label: 'Cursor',            mark: '⌘',   tagline: 'AI code editor' },
  { id: 'claude-code',      label: 'Claude Code',       mark: '▪',   tagline: 'Anthropic CLI' },
  { id: 'windsurf',         label: 'Windsurf',          mark: '◈',   tagline: 'Codeium IDE' },
  { id: 'vscode',           label: 'VS Code + Copilot', mark: '⟨⟩',  tagline: 'Microsoft IDE' },
  { id: 'github-workspace', label: 'GitHub Workspace',  mark: '⊙',   tagline: 'Browser-based IDE' },
  { id: 'lovable',          label: 'Lovable',           mark: '♡',   tagline: 'No-code AI builder' },
  { id: 'replit',           label: 'Replit',            mark: '◉',   tagline: 'Browser IDE' },
  { id: 'google-ai-studio', label: 'Google AI Studio',  mark: '△',   tagline: 'Gemini playground' },
  { id: 'dev-team',         label: 'Dev team',          mark: '{ }', tagline: 'Direct API + MCP' },
];

function buildIntegrationPrompt(tool: ToolChoice, apiKey: string, processType: string): string {
  const desc = processType.trim() || 'compliance-aware agent for the QMS process I described';
  const mcpConfigs: Partial<Record<ToolChoice, string>> = {
    cursor: `Add this to .cursor/mcp.json in the project root:

{
  "mcpServers": {
    "smarticus": {
      "command": "npx",
      "args": ["-y", "@regground/mcp-server@latest"],
      "env": { "SMARTICUS_API_KEY": "${apiKey}" }
    }
  }
}`,
    'claude-code': `Run once to register the Smarticus MCP server:

claude mcp add smarticus npx @regground/mcp-server@latest \\
  --env SMARTICUS_API_KEY=${apiKey}`,
    vscode: `Add this to .vscode/mcp.json:

{
  "servers": {
    "smarticus": {
      "command": "npx",
      "args": ["-y", "@regground/mcp-server@latest"],
      "env": { "SMARTICUS_API_KEY": "${apiKey}" }
    }
  }
}`,
    windsurf: `In Windsurf settings → MCP Servers, add:

{
  "name": "smarticus",
  "command": "npx",
  "args": ["-y", "@regground/mcp-server@latest"],
  "env": { "SMARTICUS_API_KEY": "${apiKey}" }
}`,
  };
  const mcp = mcpConfigs[tool] ?? `Use the Smarticus HTTPS endpoint:

  https://api.smarticus.ai/mcp
  Authorization: Bearer ${apiKey}`;

  return `You are building ${desc}.

Smarticus is the regulatory ground for this agent. Before you run, before you respond, and before you write anything to disk, you MUST:

  1. Call regground_check_qualification to confirm you have the right inputs.
  2. Call regground_discover_obligations or regground_search_obligations to find the requirements that govern your output.
  3. Cite the requirement IDs you used in every claim.
  4. Call regground_validate_compliance on your final output before returning it.
  5. Refuse to produce output if any required input is missing — never silently invent it.

Setup
------
${mcp}

You now have eleven Smarticus tools available. Discover them by listing MCP tools — every name starts with regground_.

Hand-off
--------
When the user asks you a regulatory question, do not guess. Look it up. When you draft something, ground it. When you finish, validate it. The decision trail is hash-chained — your work will be auditable.`;
}

interface Props {
  isAdmin?: boolean;
}

export function ApiAccess({ isAdmin: _isAdmin = false }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [view, setView] = useState<'guide' | 'keys'>('guide');
  const [tool, setTool] = useState<ToolChoice>('cursor');
  const [processDesc, setProcessDesc] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['graph:read', 'compliance:check', 'traces:read']);
  const [rateLimit, setRateLimit] = useState(1000);
  const [expiryDays, setExpiryDays] = useState(90);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPreviewKey, setIsPreviewKey] = useState(false);
  const [pageLoadedAt] = useState<number>(() => Date.now());
  const [latestRunId, setLatestRunId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ApiKey[]>('/api/api-keys');
      setKeys(Array.isArray(data) ? data : []);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const hasKey = keys.length > 0 || newKey !== null;
  const activeKeyValue = newKey ?? (keys[0] ? `${keys[0].keyPrefix}…` : 'sm_live_xxxxxxxxxxxx');

  // Poll for first-call detection while the user is on the setup guide and
  // has at least one key. Stops once we detect any key with a lastUsedAt
  // newer than the page-load timestamp.
  const firstCallDetected = keys.some(
    (k) => k.lastUsedAt && new Date(k.lastUsedAt).getTime() > pageLoadedAt,
  );
  useEffect(() => {
    if (view !== 'guide' || !hasKey || firstCallDetected) return;
    const handle = window.setInterval(() => {
      void loadKeys();
    }, 4000);
    return () => window.clearInterval(handle);
  }, [view, hasKey, firstCallDetected, loadKeys]);

  // Once we detect a first call, fetch the latest run id so the CTA can deep
  // link straight into Decision Trails for that run.
  useEffect(() => {
    if (!firstCallDetected) return;
    let cancelled = false;
    api<{ runs: Array<{ runId: string }> }>('/api/sandbox/runs/recent?limit=1')
      .then((r) => {
        if (cancelled) return;
        setLatestRunId(r.runs?.[0]?.runId ?? null);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [firstCallDetected]);

  function resetForm() {
    setKeyName('');
    setSelectedScopes(['graph:read', 'compliance:check', 'traces:read']);
    setRateLimit(1000);
    setExpiryDays(90);
  }

  async function handleCreate() {
    if (!keyName.trim()) return;
    setCreating(true);
    try {
      const res = await api<CreateKeyResponse>('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({
          name: keyName,
          scopes: selectedScopes,
          rateLimit,
          expiresInDays: expiryDays,
        }),
      });
      setNewKey(res.key);
      setIsPreviewKey(false);
      setShowForm(false);
      resetForm();
      await loadKeys();
    } catch {
      // Offline / unauthenticated preview — surface a clearly tagged sample
      // so the flow stays explorable without pretending it's a real key.
      const preview = `sm_preview_${Math.random().toString(36).slice(2, 10)}_${Math.random().toString(36).slice(2, 10)}`;
      setNewKey(preview);
      setIsPreviewKey(true);
      setShowForm(false);
      resetForm();
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await api(`/api/api-keys/${id}/revoke`, { method: 'PATCH' });
      await loadKeys();
    } catch {
      /* ignore */
    }
  }

  async function handleActivate(id: string) {
    try {
      await api(`/api/api-keys/${id}/activate`, { method: 'PATCH' });
      await loadKeys();
    } catch {
      /* ignore */
    }
  }

  async function handleDelete(id: string) {
    try {
      await api(`/api/api-keys/${id}`, { method: 'DELETE' });
      await loadKeys();
    } catch {
      /* ignore */
    }
  }

  function copyText(text: string, kind: 'key' | 'prompt') {
    navigator.clipboard.writeText(text).then(
      () => {
        if (kind === 'key') {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } else {
          setPromptCopied(true);
          setTimeout(() => setPromptCopied(false), 1600);
        }
      },
      () => {},
    );
  }

  function toggleScope(id: string) {
    setSelectedScopes((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  const integrationPrompt = buildIntegrationPrompt(tool, activeKeyValue, processDesc);
  const promptPreview = integrationPrompt.length > 900 ? `${integrationPrompt.slice(0, 900)}…` : integrationPrompt;

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <PageHeader
        eyebrow="Connect"
        title="Point any AI tool at the ground."
        subtitle="Smarticus runs as an MCP server — the same protocol Cursor, Claude Code, Windsurf, and VS Code already speak. Get a key, paste a snippet, and your AI starts citing requirements within seconds."
        actions={
          <div style={{ display: 'flex', gap: 6, padding: 4, border: '1px solid var(--rule)', borderRadius: 'var(--r-2)' }}>
            <ViewTab active={view === 'guide'} onClick={() => setView('guide')} label="Setup guide" />
            <ViewTab active={view === 'keys'} onClick={() => setView('keys')} label={`API keys${keys.length ? ` · ${keys.length}` : ''}`} />
          </div>
        }
      />

      <div style={{ padding: '32px 40px 80px', maxWidth: 1100, margin: '0 auto' }}>
        {newKey && (
          <div
            className="rise"
            style={{
              padding: '18px 22px',
              border: '1px solid var(--ok)',
              background: '#0E6B3A0A',
              borderRadius: 'var(--r-3)',
              marginBottom: 32,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 280px', minWidth: 260 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div className="eyebrow">{isPreviewKey ? 'Preview key — offline mode' : 'Save this key'}</div>
                {isPreviewKey && (
                  <span className="badge badge-warn" style={{ fontSize: 9 }}>NOT AUTHENTICATED</span>
                )}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 10, lineHeight: 1.5 }}>
                {isPreviewKey
                  ? "This is a sample value so you can see the snippet flow. It won't authenticate against the API — sign in to mint a real key."
                  : "This is the only time we'll show the full key. Paste it into the snippet below or your password manager now."}
              </div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 12.5,
                  background: 'var(--paper)',
                  padding: '10px 14px',
                  border: '1px solid var(--rule)',
                  borderRadius: 'var(--r-2)',
                  wordBreak: 'break-all',
                }}
              >
                {newKey}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-orange" onClick={() => copyText(newKey, 'key')}>
                {copied ? 'Copied' : 'Copy key'}
              </button>
              <button className="btn btn-ghost" onClick={() => setNewKey(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {view === 'guide' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            {/* PHASE 1: pick your tool */}
            <section>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Step 1 · Pick your tool</div>
              <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 500, letterSpacing: '-0.015em' }}>
                Where does your agent live?
              </h2>
              <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--ink-3)', maxWidth: 580, lineHeight: 1.55 }}>
                Pick the tool you already use. We'll generate the exact integration steps for it.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {TOOL_OPTIONS.map((opt) => {
                  const active = tool === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setTool(opt.id)}
                      className={`ground-card lift ${active ? 'active' : ''}`}
                      style={{
                        textAlign: 'left',
                        cursor: 'pointer',
                        background: active ? 'var(--paper-deep)' : 'var(--paper)',
                        borderColor: active ? 'var(--ink)' : 'var(--rule)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span
                          style={{
                            fontSize: 18,
                            fontFamily: 'var(--mono)',
                            color: active ? 'var(--orange)' : 'var(--ink-3)',
                            width: 24,
                            textAlign: 'center',
                          }}
                        >
                          {opt.mark}
                        </span>
                        <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{opt.label}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginLeft: 34 }}>{opt.tagline}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* PHASE 2: vibe-coder rail */}
            {tool !== 'dev-team' && (
              <section>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Step 2 · Set it up</div>
                <ToolBreadcrumb tool={TOOL_OPTIONS.find((t) => t.id === tool)!} />

                <div style={{ position: 'relative', marginTop: 18 }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: 19,
                      top: 28,
                      bottom: 28,
                      width: 1,
                      background: 'var(--rule-strong)',
                    }}
                    aria-hidden
                  />

                  <Step
                    n={1}
                    done={hasKey}
                    title="Get an API key"
                    body={
                      hasKey
                        ? "You're set — your key is below."
                        : 'A scoped API key tells Smarticus who you are and what you can do. We default to the read-only scopes that are safe for an agent to hold.'
                    }
                  >
                    {!hasKey && (
                      <button className="btn btn-orange" onClick={() => { setShowForm(true); setView('keys'); }}>
                        Create your API key
                      </button>
                    )}
                  </Step>

                  <Step n={2} done={processDesc.trim().length > 0} title="Describe your agent (optional)">
                    <textarea
                      value={processDesc}
                      onChange={(e) => setProcessDesc(e.target.value)}
                      placeholder="e.g. a CAPA triage agent that reads complaints and drafts an investigation plan"
                      rows={3}
                      style={{
                        width: '100%',
                        ...inputStyle,
                        fontFamily: 'var(--sans)',
                        fontSize: 13,
                        resize: 'vertical',
                      }}
                    />
                    <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--ink-3)' }}>
                      We bake this into the prompt so your agent knows what it's doing.
                    </div>
                  </Step>

                  <Step n={3} done={promptCopied} title="Copy the integration prompt">
                    <div
                      style={{
                        background: 'var(--paper-deep)',
                        border: '1px solid var(--rule)',
                        borderRadius: 'var(--r-2)',
                        padding: 14,
                        fontFamily: 'var(--mono)',
                        fontSize: 11.5,
                        lineHeight: 1.55,
                        color: 'var(--ink-2)',
                        whiteSpace: 'pre-wrap',
                        maxHeight: 280,
                        overflowY: 'auto',
                      }}
                    >
                      {promptPreview}
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button className="btn btn-orange" onClick={() => copyText(integrationPrompt, 'prompt')}>
                        {promptCopied ? 'Copied' : 'Copy full prompt'}
                      </button>
                      {!hasKey && (
                        <span style={{ fontSize: 12, color: 'var(--warn)' }}>
                          Tip — create a key first so the snippet uses it.
                        </span>
                      )}
                    </div>
                  </Step>

                  <Step n={4} done={firstCallDetected} title="Verify the connection" body={firstCallDetected ? undefined : "After you paste the prompt into your tool and ask its agent something, we'll detect the first call here."}>
                    {firstCallDetected ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span className="badge badge-ok" style={{ fontSize: 10 }}>FIRST CALL DETECTED</span>
                        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                          Your tool just hit the ground. Every call from here on is hash-chained.
                        </span>
                        <Link href={latestRunId ? `/app/trails/${latestRunId}` : '/app/trails'} className="btn btn-orange" style={{ fontSize: 12 }}>
                          {latestRunId ? 'View this trail →' : 'View decision trails →'}
                        </Link>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-3)' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: hasKey ? 'var(--orange)' : 'var(--ink-4)',
                            opacity: hasKey ? 1 : 0.4,
                            animation: hasKey ? 'pulse 1.6s ease-in-out infinite' : undefined,
                          }}
                          aria-hidden
                        />
                        {hasKey ? 'Listening for your first call…' : 'Create a key in Step 1 to start listening.'}
                      </div>
                    )}
                  </Step>
                </div>
              </section>
            )}

            {/* DEV TEAM */}
            {tool === 'dev-team' && (
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
                <div className="ground-card">
                  <div className="eyebrow" style={{ marginBottom: 8 }}>MCP integration</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 500 }}>Run the MCP server</h3>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                    The simplest path. The MCP server is a single npx command — point any MCP-aware tool at it.
                  </p>
                  <pre
                    style={{
                      background: 'var(--paper-deep)',
                      border: '1px solid var(--rule)',
                      borderRadius: 'var(--r-2)',
                      padding: 12,
                      fontFamily: 'var(--mono)',
                      fontSize: 11.5,
                      margin: 0,
                      overflowX: 'auto',
                    }}
                  >
                    {`SMARTICUS_API_KEY=${activeKeyValue} \\
  npx @regground/mcp-server@latest`}
                  </pre>
                </div>

                <div className="ground-card">
                  <div className="eyebrow" style={{ marginBottom: 8 }}>REST API</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 500 }}>Call the API directly</h3>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                    For platforms that don't speak MCP. Same scopes, same audit chain.
                  </p>
                  <pre
                    style={{
                      background: 'var(--paper-deep)',
                      border: '1px solid var(--rule)',
                      borderRadius: 'var(--r-2)',
                      padding: 12,
                      fontFamily: 'var(--mono)',
                      fontSize: 11.5,
                      margin: 0,
                      overflowX: 'auto',
                    }}
                  >
                    {`curl https://api.smarticus.ai/api/graph/obligations \\
  -H "Authorization: Bearer ${activeKeyValue}"`}
                  </pre>
                </div>
              </section>
            )}
          </div>
        )}

        {view === 'keys' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>API keys</div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: '-0.015em' }}>
                  {keys.length === 0 ? 'No keys yet' : `${keys.length} ${keys.length === 1 ? 'key' : 'keys'}`}
                </h2>
              </div>
              <button className="btn btn-orange" onClick={() => setShowForm(true)}>+ New key</button>
            </div>

            {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>}

            {!loading && keys.length === 0 && !showForm && (
              <EmptyState
                title="Your first key opens the door."
                body="API keys are how Smarticus knows who's calling. Each one is scoped — pick only what your agent actually needs. We'll show you the full key once."
                primaryAction={{ label: 'Create your first key', onClick: () => setShowForm(true) }}
              />
            )}

            {!loading && keys.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                {keys.map((k) => (
                  <div key={k.id} className="ground-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.name}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                          {k.keyPrefix}…
                        </div>
                      </div>
                      <span
                        className={`badge ${k.active ? 'badge-ok' : 'badge-err'}`}
                      >
                        {k.active ? 'active' : 'revoked'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div>{k.scopes.length} scope{k.scopes.length !== 1 ? 's' : ''} · {k.rateLimit}/h</div>
                      {k.expiresAt && (
                        <div>expires {new Date(k.expiresAt).toLocaleDateString()}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 6 }}>
                      {k.active ? (
                        <button className="btn btn-ghost" onClick={() => handleRevoke(k.id)} style={{ fontSize: 12 }}>
                          Revoke
                        </button>
                      ) : (
                        <button className="btn btn-ghost" onClick={() => handleActivate(k.id)} style={{ fontSize: 12 }}>
                          Activate
                        </button>
                      )}
                      <button className="btn btn-ghost" onClick={() => handleDelete(k.id)} style={{ fontSize: 12, color: 'var(--err)' }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showForm && (
              <CreateKeyModal
                keyName={keyName}
                setKeyName={setKeyName}
                selectedScopes={selectedScopes}
                toggleScope={toggleScope}
                rateLimit={rateLimit}
                setRateLimit={setRateLimit}
                expiryDays={expiryDays}
                setExpiryDays={setExpiryDays}
                creating={creating}
                onCancel={() => { setShowForm(false); resetForm(); }}
                onCreate={handleCreate}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────── */

function ViewTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        border: 'none',
        background: active ? 'var(--ink)' : 'transparent',
        color: active ? 'var(--paper)' : 'var(--ink-2)',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.02em',
        borderRadius: 'var(--r-1)',
        cursor: 'pointer',
        transition: 'background var(--t-fast) var(--ease), color var(--t-fast) var(--ease)',
      }}
    >
      {label}
    </button>
  );
}

function ToolBreadcrumb({ tool }: { tool: { mark: string; label: string; tagline: string } }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--paper-deep)', borderRadius: 'var(--r-2)', border: '1px solid var(--rule)' }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 16, color: 'var(--orange)', width: 22, textAlign: 'center' }}>{tool.mark}</span>
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{tool.label}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{tool.tagline}</div>
      </div>
    </div>
  );
}

function Step({
  n,
  done,
  title,
  body,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ position: 'relative', paddingLeft: 56, paddingBottom: 22 }}>
      <div
        style={{
          position: 'absolute',
          left: 8,
          top: 4,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: done ? 'var(--ok)' : 'var(--paper)',
          border: `1.5px solid ${done ? 'var(--ok)' : 'var(--ink-3)'}`,
          color: done ? '#fff' : 'var(--ink-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          zIndex: 1,
        }}
      >
        {done ? '✓' : n}
      </div>
      <div className="ground-card" style={{ padding: 16 }}>
        <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{title}</h4>
        {body && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>{body}</p>}
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--rule)',
  background: 'var(--paper)',
  borderRadius: 'var(--r-2)',
  color: 'var(--ink)',
  fontFamily: 'var(--sans)',
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>
      {children}
    </label>
  );
}

function CreateKeyModal({
  keyName,
  setKeyName,
  selectedScopes,
  toggleScope,
  rateLimit,
  setRateLimit,
  expiryDays,
  setExpiryDays,
  creating,
  onCancel,
  onCreate,
}: {
  keyName: string;
  setKeyName: (s: string) => void;
  selectedScopes: string[];
  toggleScope: (id: string) => void;
  rateLimit: number;
  setRateLimit: (n: number) => void;
  expiryDays: number;
  setExpiryDays: (n: number) => void;
  creating: boolean;
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(14,42,71,0.32)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 50,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--rule-strong)',
          borderRadius: 'var(--r-3)',
          padding: 28,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div className="eyebrow" style={{ marginBottom: 6 }}>New API key</div>
        <h3 style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 500, letterSpacing: '-0.015em' }}>
          Scope a key for one purpose.
        </h3>

        <div style={{ marginBottom: 16 }}>
          <Label>Name</Label>
          <input
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="e.g. CAPA triage agent — production"
            style={{ ...inputStyle, width: '100%', fontSize: 13 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Label>Scopes</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {AVAILABLE_SCOPES.map((s) => {
              const checked = selectedScopes.includes(s.id);
              return (
                <label
                  key={s.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    padding: '8px 10px',
                    border: `1px solid ${checked ? 'var(--ink)' : 'var(--rule)'}`,
                    borderRadius: 'var(--r-2)',
                    cursor: 'pointer',
                    background: checked ? 'var(--paper-deep)' : 'var(--paper)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleScope(s.id)}
                    style={{ accentColor: 'var(--orange)', marginTop: 2 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500 }}>{s.label}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.4 }}>{s.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
          <div>
            <Label>Rate limit / hour</Label>
            <input
              type="number"
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              style={{ ...inputStyle, width: '100%', fontSize: 13 }}
            />
          </div>
          <div>
            <Label>Expires</Label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              style={{ ...inputStyle, width: '100%', fontSize: 13 }}
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel} disabled={creating}>Cancel</button>
          <button
            className="btn btn-orange"
            onClick={onCreate}
            disabled={creating || !keyName.trim() || selectedScopes.length === 0}
          >
            {creating ? 'Creating…' : 'Create key'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApiAccess;
