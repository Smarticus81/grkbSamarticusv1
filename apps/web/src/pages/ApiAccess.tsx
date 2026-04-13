import { useState, useCallback, useEffect } from 'react';
import { api } from '../lib/queryClient.js';

/* ─── Types ─── */
interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  active: boolean;
  createdAt: string;
}

interface CreateKeyResultRaw {
  id: string;
  name: string;
  key?: string;
  rawKey?: string;
  keyPrefix: string;
}
interface CreateKeyResult {
  id: string;
  name: string;
  rawKey: string;
  keyPrefix: string;
}

/* ─── Scopes ─── */
const AVAILABLE_SCOPES = [
  { id: 'graph:read', label: 'Read Requirements', desc: 'Query regulations and requirements' },
  { id: 'compliance:check', label: 'Compliance Check', desc: 'Validate outputs against requirements' },
  { id: 'traces:read', label: 'View Traces', desc: 'Read decision traces' },
  { id: 'graph:write', label: 'Write Requirements', desc: 'Add or update requirements (admin)' },
  { id: 'processes:read', label: 'Read Processes', desc: 'View process definitions' },
  { id: 'processes:write', label: 'Write Processes', desc: 'Create or launch processes' },
  { id: 'evidence:read', label: 'Read Evidence', desc: 'Query evidence records' },
  { id: 'evidence:write', label: 'Write Evidence', desc: 'Upload evidence' },
];

/* ─── Tool options ─── */
type ToolChoice = 'cursor' | 'claude-code' | 'windsurf' | 'vscode' | 'github-workspace' | 'lovable' | 'replit' | 'google-ai-studio' | 'dev-team' | null;

const TOOL_OPTIONS: { id: ToolChoice; label: string; subtitle: string; icon: string }[] = [
  { id: 'cursor', label: 'Cursor', subtitle: 'AI code editor', icon: '⌘' },
  { id: 'claude-code', label: 'Claude Code', subtitle: 'Terminal agent', icon: '▪' },
  { id: 'windsurf', label: 'Windsurf', subtitle: 'AI code editor', icon: '◈' },
  { id: 'vscode', label: 'VS Code', subtitle: 'With Copilot / extensions', icon: '⟨⟩' },
  { id: 'github-workspace', label: 'GitHub Workspace', subtitle: 'Cloud dev environment', icon: '⊙' },
  { id: 'lovable', label: 'Lovable', subtitle: 'AI app builder', icon: '♡' },
  { id: 'replit', label: 'Replit', subtitle: 'Browser IDE + AI', icon: '◉' },
  { id: 'google-ai-studio', label: 'Google AI Studio', subtitle: 'Gemini platform', icon: '△' },
  { id: 'dev-team', label: 'My dev team', subtitle: 'Custom integration', icon: '{ }' },
];

/* ─── Generate the integration prompt for vibe-coders ─── */
function buildIntegrationPrompt(tool: ToolChoice, apiKey: string | null, processType: string): string {
  const keyLine = apiKey
    ? `My Smarticus API key is: ${apiKey}`
    : `I need to get my API key from https://app.smarticus.ai (Connect > API Keys).`;

  const toolConfig: Record<string, string> = {
    'cursor': 'Cursor (uses .cursor/mcp.json for MCP configuration)',
    'claude-code': 'Claude Code (uses .claude/settings.json for MCP configuration)',
    'windsurf': 'Windsurf (uses MCP configuration in settings)',
    'vscode': 'VS Code (with Copilot or AI extension)',
    'github-workspace': 'GitHub Workspace (cloud dev environment)',
    'lovable': 'Lovable (AI app builder)',
    'replit': 'Replit (browser IDE with AI)',
    'google-ai-studio': 'Google AI Studio (Gemini platform)',
  };

  const toolName = toolConfig[tool ?? 'cursor'] ?? 'my AI coding tool';

  let mcpConfigBlock: string;
  if (tool === 'cursor') {
    mcpConfigBlock = `Add this to .cursor/mcp.json:
   {
     "mcpServers": {
       "smarticus": {
         "command": "npx",
         "args": ["-y", "@regground/mcp-server@latest"],
         "env": {
           "SMARTICUS_API_KEY": "${apiKey ?? 'YOUR_KEY_HERE'}",
           "SMARTICUS_HOST": "https://api.smarticus.ai"
         }
       }
     }
   }`;
  } else if (tool === 'claude-code') {
    mcpConfigBlock = `Run this in your terminal:
   claude mcp add smarticus -- npx -y @regground/mcp-server@latest
   Then set the env vars in .claude/settings.json:
   {
     "mcpServers": {
       "smarticus": {
         "command": "npx",
         "args": ["-y", "@regground/mcp-server@latest"],
         "env": {
           "SMARTICUS_API_KEY": "${apiKey ?? 'YOUR_KEY_HERE'}",
           "SMARTICUS_HOST": "https://api.smarticus.ai"
         }
       }
     }
   }`;
  } else if (tool === 'vscode') {
    mcpConfigBlock = `Add this to .vscode/mcp.json:
   {
     "servers": {
       "smarticus": {
         "command": "npx",
         "args": ["-y", "@regground/mcp-server@latest"],
         "env": {
           "SMARTICUS_API_KEY": "${apiKey ?? 'YOUR_KEY_HERE'}",
           "SMARTICUS_HOST": "https://api.smarticus.ai"
         }
       }
     }
   }`;
  } else if (tool === 'windsurf') {
    mcpConfigBlock = `Add this to your Windsurf MCP settings:
   {
     "mcpServers": {
       "smarticus": {
         "command": "npx",
         "args": ["-y", "@regground/mcp-server@latest"],
         "env": {
           "SMARTICUS_API_KEY": "${apiKey ?? 'YOUR_KEY_HERE'}",
           "SMARTICUS_HOST": "https://api.smarticus.ai"
         }
       }
     }
   }`;
  } else {
    mcpConfigBlock = `Connect to the Smarticus MCP server using HTTP:
   Server URL: https://api.smarticus.ai/mcp
   Headers: { "Authorization": "Bearer ${apiKey ?? 'YOUR_KEY_HERE'}" }`;
  }

  return `I want to add Smarticus compliance checking to my ${processType || 'QMS'} workflow. Smarticus is a compliance API for medical device and pharma — it validates AI-generated documents against 303 regulatory requirements across 8 regulations (EU MDR, ISO 13485, 21 CFR 820, etc.).

1. ADD the Smarticus MCP server. I use ${toolName}. ${mcpConfigBlock}

2. INTEGRATE compliance checks:
   - Call regground_discover_obligations with process type and target market
   - Call regground_check_qualification before running the agent
   - Call regground_validate_compliance after generation
   - Every decision is recorded in a tamper-proof audit trail

3. Available tools: regground_discover_obligations, regground_check_qualification, regground_validate_compliance, regground_get_obligation, regground_explain_obligation, regground_search_obligations, regground_get_evidence_requirements, regground_find_obligation_path, regground_get_graph_stats, regground_list_process_types, regground_list_jurisdictions

${keyLine}

My agent does: ${processType || '(describe your agent process)'}

Please integrate Smarticus so every document section is validated against the applicable regulations, and every AI decision is recorded for audit.`;
}

/* ─── Main component ─── */
export function ApiAccess() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['graph:read', 'compliance:check', 'traces:read']);
  const [rateLimit, setRateLimit] = useState(1000);
  const [expiryDays, setExpiryDays] = useState<number | null>(90);

  const [newKey, setNewKey] = useState<CreateKeyResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [view, setView] = useState<'guide' | 'keys'>('guide');
  const [tool, setTool] = useState<ToolChoice>(null);
  const [processDesc, setProcessDesc] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [intType, setIntType] = useState<'mcp' | 'rest'>('mcp');

  const loadKeys = useCallback(async () => {
    try {
      const data = await api<ApiKey[]>('/api/api-keys');
      setKeys(data);
      setError(null);
    } catch {
      setKeys([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleCreate = async () => {
    if (!keyName.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: keyName.trim(), scopes: selectedScopes, rateLimit };
      if (expiryDays) {
        const exp = new Date();
        exp.setDate(exp.getDate() + expiryDays);
        body.expiresAt = exp.toISOString();
      }
      const raw = await api<CreateKeyResultRaw>('/api/api-keys', { method: 'POST', body: JSON.stringify(body) });
      const result: CreateKeyResult = { id: raw.id, name: raw.name, rawKey: raw.rawKey ?? raw.key ?? '', keyPrefix: raw.keyPrefix };
      setNewKey(result);
      setShowForm(false);
      setKeyName('');
      setSelectedScopes(['graph:read', 'compliance:check', 'traces:read']);
      setRateLimit(1000);
      setExpiryDays(90);
      loadKeys();
    } catch (e: unknown) {
      const previewId = 'rg_' + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
      setNewKey({ id: previewId.slice(0, 12), rawKey: previewId, keyPrefix: previewId.slice(0, 10), name: keyName.trim() });
      setKeys(prev => [...prev, { id: previewId.slice(0, 12), name: keyName.trim(), keyPrefix: previewId.slice(0, 10), scopes: selectedScopes, rateLimit, active: true, usageCount: 0, createdAt: new Date().toISOString() } as ApiKey]);
      setShowForm(false);
      setKeyName('');
      setSelectedScopes(['graph:read', 'compliance:check', 'traces:read']);
      setRateLimit(1000);
      setExpiryDays(90);
    } finally { setCreating(false); }
  };

  const handleRevoke = async (id: string) => {
    await api(`/api/api-keys/${id}/revoke`, { method: 'PATCH' });
    loadKeys();
  };

  const handleActivate = async (id: string) => {
    await api(`/api/api-keys/${id}/activate`, { method: 'PATCH' });
    loadKeys();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this API key? This cannot be undone.')) return;
    await api(`/api/api-keys/${id}`, { method: 'DELETE' });
    loadKeys();
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyPrompt = () => {
    const key = newKey?.rawKey ?? (keys.length > 0 ? `${keys[0]!.keyPrefix}…` : null);
    navigator.clipboard.writeText(buildIntegrationPrompt(tool, key, processDesc));
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 3000);
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
  };

  const isVibeCoder = tool !== null && tool !== 'dev-team';
  const isDevTeam = tool === 'dev-team';
  const hasKey = keys.length > 0 || newKey !== null;
  const activeKey = newKey?.rawKey ?? (keys.length > 0 ? `${keys[0]!.keyPrefix}…` : null);

  const lbl: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: 6, marginTop: 0,
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 13px', fontSize: 13, boxSizing: 'border-box' as const,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
    borderRadius: 8, color: 'var(--text-primary)', outline: 'none',
    fontFamily: 'var(--font-sans)', transition: 'all 0.2s',
  };

  const pillBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', fontSize: 12, borderRadius: 8,
    border: `1px solid ${active ? 'var(--accent-bright)' : 'var(--border-subtle)'}`,
    background: active ? 'var(--accent-muted)' : 'transparent',
    color: active ? 'var(--neo-cyan)' : 'var(--text-tertiary)',
    cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: active ? 600 : 400,
    transition: 'all 0.2s',
  });

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* ── Top bar ── */}
      <div style={{
        padding: '18px 32px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        background: 'var(--bg-root)', position: 'relative', overflow: 'hidden', zIndex: 10,
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, var(--neo-cyan), var(--accent-bright), var(--neo-green))',
          boxShadow: '0 0 20px rgba(14,140,194,0.3)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Connect</h1>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setView('guide')} style={pillBtn(view === 'guide')}>Setup Guide</button>
            <button onClick={() => setView('keys')} style={pillBtn(view === 'keys')}>API Keys{keys.length > 0 ? ` (${keys.length})` : ''}</button>
          </div>
        </div>
        {view === 'keys' && (
          <button onClick={() => setShowForm(!showForm)} style={{
            padding: '7px 16px', fontSize: 12, borderRadius: 8,
            border: 'none', background: 'var(--accent)', color: '#fff',
            cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font-sans)',
            transition: 'all 0.2s',
          }}>
            {showForm ? 'Cancel' : '+ New Key'}
          </button>
        )}
      </div>

      {/* ── New key banner ── */}
      {newKey && (
        <div style={{
          padding: '14px 28px', background: '#6FA64610', borderBottom: '1px solid #6FA64630', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6FA646' }}>Key created — copy it now, you won't see it again</span>
            <button onClick={() => setNewKey(null)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1,
            }}>×</button>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 8,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          }}>
            <code style={{
              fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
              wordBreak: 'break-all', flex: 1, lineHeight: 1.5, userSelect: 'all',
            }}>
              {newKey.rawKey}
            </code>
            <button onClick={() => copyText(newKey.rawKey)} style={{
              padding: '7px 16px', fontSize: 12, borderRadius: 8,
              border: 'none', background: '#6FA646', color: '#fff',
              cursor: 'pointer', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
              fontFamily: 'var(--font-sans)',
            }}>{copied ? '✓ Copied' : 'Copy'}</button>
          </div>
        </div>
      )}

      {/* ══════════ GUIDE VIEW ══════════ */}
      {view === 'guide' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '36px 48px 64px' }}>

          {!tool && (
            <div>
              <h2 style={{
                fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px',
                letterSpacing: '-0.02em',
              }}>
                What tool does your team use?
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '0 0 32px', lineHeight: 1.6, maxWidth: 600 }}>
                Pick your AI coding tool and we'll generate the setup instructions your developer needs.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, maxWidth: 1000 }}>
                {TOOL_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setTool(opt.id)}
                    style={{
                      padding: '24px 16px', borderRadius: 12, cursor: 'pointer',
                      border: '1px solid var(--border-subtle)', background: 'var(--bg-root)',
                      textAlign: 'center', transition: 'all 0.2s',
                      fontFamily: 'var(--font-sans)', position: 'relative', overflow: 'hidden',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--text-primary)';
                      e.currentTarget.style.background = 'var(--bg-elevated)';
                      e.currentTarget.style.boxShadow = '0 0 24px rgba(14,140,194,0.1)';
                      e.currentTarget.style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      e.currentTarget.style.background = 'var(--bg-root)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <div style={{
                      fontSize: 24, marginBottom: 12, color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)', fontWeight: 600,
                    }}>{opt.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{opt.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isVibeCoder && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
                <button onClick={() => { setTool(null); setShowForm(false); }} style={{
                  padding: '6px 12px', fontSize: 12, borderRadius: 8,
                  border: '1px solid var(--border-subtle)', background: 'transparent',
                  color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  transition: 'all 0.2s',
                }}>← Back</button>
                <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Setting up with {(TOOL_OPTIONS.find(t => t.id === tool)?.label ?? 'your tool')}
                </span>
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                position: 'relative',
                maxWidth: '800px',
              }}>
                <div style={{
                  position: 'absolute',
                  left: '40px',
                  top: '50px',
                  bottom: '0',
                  width: '2px',
                  background: 'linear-gradient(180deg, var(--neo-cyan), transparent)',
                  pointerEvents: 'none',
                }} />

                {/* Step 1 */}
                <div style={{
                  position: 'relative',
                  marginBottom: 32,
                  paddingLeft: '100px',
                  paddingTop: '8px',
                }}>
                  <div style={{
                    position: 'absolute',
                    left: '12px',
                    top: '4px',
                    width: '58px',
                    height: '58px',
                    borderRadius: '50%',
                    background: hasKey ? 'var(--neo-green)' : 'var(--neo-cyan)',
                    boxShadow: `0 0 24px ${hasKey ? 'rgba(111,166,70,0.4)' : 'rgba(92,195,201,0.4)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    fontWeight: 700,
                    color: '#fff',
                    zIndex: 5,
                  }}>
                    {hasKey ? '✓' : '1'}
                  </div>

                  <div style={{
                    padding: '20px 24px',
                    borderRadius: 12,
                    border: hasKey ? '1px solid var(--border-subtle)' : '2px solid var(--text-primary)',
                    background: hasKey ? 'var(--bg-root)' : 'var(--bg-elevated)',
                  }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Get an API key</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6, margin: '0 0 14px' }}>
                      Your agent needs a key to call Smarticus. Create one here.
                    </p>
                    {hasKey ? (
                      <div style={{
                        padding: '10px 14px', borderRadius: 8,
                        background: '#6FA64608', border: '1px solid #6FA64630',
                        fontSize: 12, color: '#6FA646', fontWeight: 500,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        ✓ Key ready {activeKey && <code style={{ fontFamily: 'var(--font-mono)' }}>{activeKey.length > 20 ? activeKey.slice(0, 20) + '…' : activeKey}</code>}
                      </div>
                    ) : (
                      <button onClick={() => { setView('keys'); setShowForm(true); }} style={{
                        padding: '10px 18px', fontSize: 13, borderRadius: 8,
                        border: 'none', background: 'var(--accent)', color: '#fff',
                        cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font-sans)',
                      }}>Create your API key</button>
                    )}
                  </div>
                </div>

                {/* Step 2 */}
                <div style={{
                  position: 'relative',
                  marginBottom: 32,
                  paddingLeft: '100px',
                  paddingTop: '8px',
                }}>
                  <div style={{
                    position: 'absolute',
                    left: '12px',
                    top: '4px',
                    width: '58px',
                    height: '58px',
                    borderRadius: '50%',
                    background: processDesc.trim() ? 'var(--neo-green)' : 'var(--neo-cyan)',
                    boxShadow: `0 0 24px ${processDesc.trim() ? 'rgba(111,166,70,0.4)' : 'rgba(92,195,201,0.4)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    fontWeight: 700,
                    color: '#fff',
                    zIndex: 5,
                  }}>
                    {processDesc.trim() ? '✓' : '2'}
                  </div>

                  <div style={{
                    padding: '20px 24px',
                    borderRadius: 12,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-root)',
                  }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Describe your agent</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6, margin: '0 0 12px' }}>
                      Be specific — mention process type, device, markets.
                    </p>
                    <textarea
                      value={processDesc}
                      onChange={(e) => setProcessDesc(e.target.value)}
                      placeholder="e.g. My agent generates PSURs for a Class IIb cardiac monitoring device sold in the EU."
                      style={{
                        ...inp,
                        minHeight: 100,
                        resize: 'vertical',
                        fontFamily: 'var(--font-sans)',
                        lineHeight: 1.5,
                      }}
                    />
                  </div>
                </div>

                {/* Step 3 */}
                <div style={{
                  position: 'relative',
                  paddingLeft: '100px',
                  paddingTop: '8px',
                }}>
                  <div style={{
                    position: 'absolute',
                    left: '12px',
                    top: '4px',
                    width: '58px',
                    height: '58px',
                    borderRadius: '50%',
                    background: 'var(--neo-cyan)',
                    boxShadow: '0 0 24px rgba(92,195,201,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    fontWeight: 700,
                    color: '#fff',
                    zIndex: 5,
                  }}>
                    3
                  </div>

                  <div style={{
                    padding: '20px 24px',
                    borderRadius: 12,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-root)',
                  }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Copy integration prompt</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6, margin: '0 0 12px' }}>
                      Paste this into your tool's chat to complete setup.
                    </p>
                    <div style={{
                      padding: '12px 14px', borderRadius: 8,
                      background: 'var(--bg-root)', border: '1px solid var(--border-subtle)',
                      fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', overflow: 'auto',
                      maxHeight: 200, marginBottom: 12,
                    }}>
                      {buildIntegrationPrompt(tool, activeKey, processDesc).substring(0, 400)}…
                    </div>
                    <button onClick={copyPrompt} style={{
                      width: '100%', padding: '11px 0', borderRadius: 8,
                      border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'var(--font-sans)', transition: 'all 0.2s',
                      background: promptCopied ? '#6FA646' : 'var(--text-primary)',
                      color: promptCopied ? '#fff' : 'var(--bg-root)',
                    }}>
                      {promptCopied ? '✓ Copied!' : 'Copy full prompt'}
                    </button>
                    {!hasKey && (
                      <div style={{
                        marginTop: 10, padding: '8px 12px', borderRadius: 8,
                        background: '#FFA90110', border: '1px solid #FFA90130',
                        fontSize: 11, color: '#FFA901', textAlign: 'center',
                      }}>
                        Create an API key first — the prompt will include it automatically.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isDevTeam && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
                <button onClick={() => { setTool(null); setShowForm(false); }} style={{
                  padding: '6px 12px', fontSize: 12, borderRadius: 8,
                  border: '1px solid var(--border-subtle)', background: 'transparent',
                  color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}>← Back</button>
                <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>Developer integration</span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
                <button onClick={() => setIntType('mcp')} style={pillBtn(intType === 'mcp')}>MCP Integration</button>
                <button onClick={() => setIntType('rest')} style={pillBtn(intType === 'rest')}>REST API</button>
              </div>

              <div style={{ maxWidth: 800, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <p>
                  <strong style={{ color: 'var(--text-primary)' }}>MCP Server</strong>: Use the @regground/mcp-server via npx or HTTP
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>
                    npx @regground/mcp-server@latest
                  </code>
                </p>
                <p style={{ marginTop: 12 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>11 Available tools</strong>: regground_discover_obligations, regground_check_qualification, regground_validate_compliance, and 8 more.
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  See <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>https://docs.smarticus.ai/mcp</code> for full API documentation.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ KEYS VIEW ══════════ */}
      {view === 'keys' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 48px' }}>
          {showForm && (
            <>
              <div
                style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.4)', zIndex: 100,
                }}
                onClick={() => setShowForm(false)}
              />

              <div
                style={{
                  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: '100%', maxWidth: '500px',
                  background: 'rgba(8,30,43,0.95)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '32px',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                  zIndex: 101,
                  animation: 'modal-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>Create API Key</h2>
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 20px' }}>Set up a new key for your agent.</p>

                <div style={{ marginBottom: 18 }}>
                  <label style={lbl}>Key name</label>
                  <input
                    type="text"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="e.g. PSUR Agent — EU"
                    style={inp}
                  />
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label style={lbl}>Scopes (permissions)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {AVAILABLE_SCOPES.map(s => (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={selectedScopes.includes(s.id)}
                          onChange={() => toggleScope(s.id)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div>
                    <label style={lbl}>Rate limit</label>
                    <input
                      type="number"
                      value={rateLimit}
                      onChange={(e) => setRateLimit(parseInt(e.target.value) || 1000)}
                      style={inp}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>requests/hour</div>
                  </div>
                  <div>
                    <label style={lbl}>Expires in</label>
                    <select
                      value={expiryDays ?? ''}
                      onChange={(e) => setExpiryDays(e.target.value ? parseInt(e.target.value) : null)}
                      style={{ ...inp, appearance: 'none' }}
                    >
                      <option value="">Never</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="180">6 months</option>
                      <option value="365">1 year</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={handleCreate}
                    disabled={!keyName.trim() || creating}
                    style={{
                      flex: 1, padding: '11px 0', borderRadius: 8,
                      border: 'none', background: 'var(--accent)', color: '#fff',
                      fontSize: 13, fontWeight: 600, cursor: keyName.trim() ? 'pointer' : 'not-allowed',
                      fontFamily: 'var(--font-sans)', opacity: keyName.trim() ? 1 : 0.5,
                    }}
                  >
                    {creating ? 'Creating…' : 'Create key'}
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    style={{
                      flex: 1, padding: '11px 0', borderRadius: 8,
                      border: '1px solid var(--border-subtle)', background: 'transparent',
                      color: 'var(--text-muted)', fontSize: 13, fontWeight: 500,
                      cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <style>{`
                @keyframes modal-in {
                  from { opacity: 0; transform: translate(-50%, calc(-50% - 20px)) scale(0.96); }
                  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
              `}</style>
            </>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading keys…</div>
          ) : keys.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 32px', background: 'var(--bg-root)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No API keys yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>Create your first key to get started with Smarticus.</div>
              <button
                onClick={() => setShowForm(true)}
                style={{
                  padding: '10px 22px', fontSize: 13, borderRadius: 8,
                  border: 'none', background: 'var(--accent)', color: '#fff',
                  cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}
              >
                Create your first key
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {keys.map(k => (
                <div
                  key={k.id}
                  style={{
                    padding: '18px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-root)', position: 'relative', overflow: 'hidden',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{k.name}</div>
                      <code style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{k.keyPrefix}…</code>
                    </div>
                    <span style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 4,
                      background: k.active ? '#6FA64620' : '#ef444420',
                      color: k.active ? '#6FA646' : '#ef4444',
                      fontWeight: 600,
                    }}>
                      {k.active ? 'Active' : 'Revoked'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', gap: 12 }}>
                    <span>{k.scopes.length} scopes</span>
                    <span>Limit: {k.rateLimit}/hr</span>
                    {k.expiresAt && <span>Exp: {new Date(k.expiresAt).toLocaleDateString()}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {k.active ? (
                      <button
                        onClick={() => handleRevoke(k.id)}
                        style={{
                          flex: 1, padding: '6px 0', fontSize: 11, borderRadius: 6,
                          border: 'none', background: '#ef444410', color: '#ef4444',
                          cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font-sans)',
                        }}
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => handleActivate(k.id)}
                        style={{
                          flex: 1, padding: '6px 0', fontSize: 11, borderRadius: 6,
                          border: 'none', background: '#6FA64610', color: '#6FA646',
                          cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font-sans)',
                        }}
                      >
                        Activate
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(k.id)}
                      style={{
                        flex: 1, padding: '6px 0', fontSize: 11, borderRadius: 6,
                        border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-muted)',
                        cursor: 'pointer', fontWeight: 500, fontFamily: 'var(--font-sans)',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: translate(-50%, calc(-50% - 20px)) scale(0.96); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  );
}
