import { useState } from 'react';

interface OrgInfo {
  name: string;
  plan: string;
  memberCount: number;
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<'org' | 'billing' | 'members'>('org');

  // Placeholder org info — will be populated from Clerk + API
  const org: OrgInfo = {
    name: 'My Organization',
    plan: 'free',
    memberCount: 1,
  };

  return (
    <div style={{ padding: '32px 32px 40px', maxWidth: 1180, margin: '0 auto' }}>
      <div className="rise" style={{ marginBottom: 30 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          <span className="signal-dot" style={{ marginRight: 10, verticalAlign: 1 }} />
          Settings
        </div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 'clamp(28px, 3.4vw, 44px)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          Organization settings
        </h1>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid var(--rule)',
          marginBottom: 24,
        }}
      >
        {(['org', 'billing', 'members'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: 0,
              borderBottom: activeTab === tab ? '2px solid var(--orange)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--ink)' : 'var(--ink-3)',
              fontFamily: 'var(--sans)',
              fontSize: 13.5,
              cursor: 'pointer',
              transition: 'color var(--t-fast)',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'org' ? 'Organization' : tab}
          </button>
        ))}
      </div>

      {activeTab === 'org' && (
        <div style={{ display: 'grid', gap: 20, maxWidth: 640 }}>
          <div
            style={{
              padding: '20px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--r-2)',
            }}
          >
            <label className="eyebrow" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>
              Organization name
            </label>
            <div style={{ fontSize: 16, color: 'var(--ink)' }}>{org.name}</div>
          </div>

          <div
            style={{
              padding: '20px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--r-2)',
            }}
          >
            <label className="eyebrow" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>
              Current plan
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span
                style={{
                  padding: '4px 12px',
                  background: 'var(--orange)',
                  color: '#fff',
                  borderRadius: 'var(--r-1)',
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                {org.plan}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                {org.memberCount} member{org.memberCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div
            style={{
              padding: '20px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--r-2)',
              background: 'var(--paper-deep)',
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>
              Usage this month
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 28,
                    fontWeight: 400,
                    letterSpacing: '-0.03em',
                    color: 'var(--ink)',
                  }}
                >
                  0
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--ink-4)',
                    letterSpacing: '0.1em',
                  }}
                >
                  API CALLS
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 28,
                    fontWeight: 400,
                    letterSpacing: '-0.03em',
                    color: 'var(--ink)',
                  }}
                >
                  0
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--ink-4)',
                    letterSpacing: '0.1em',
                  }}
                >
                  MCP CALLS
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 28,
                    fontWeight: 400,
                    letterSpacing: '-0.03em',
                    color: 'var(--ink)',
                  }}
                >
                  0
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--ink-4)',
                    letterSpacing: '0.1em',
                  }}
                >
                  VALIDATIONS
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'billing' && (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--ink-3)',
            fontSize: 14,
          }}
        >
          Billing management will be available when Stripe integration is configured.
        </div>
      )}

      {activeTab === 'members' && (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--ink-3)',
            fontSize: 14,
          }}
        >
          Member management is handled through your Clerk organization dashboard.
        </div>
      )}
    </div>
  );
}

export default Settings;
