/**
 * Pricing — the commercial model, made explicit.
 *
 * The product had no pricing surface at all, so a prospect could never answer
 * "why would I pay for this?". The boundaries below map directly to the value
 * the product creates:
 *
 *   Launch (free)   — prove the agent path on sample evidence. Zero friction, zero risk.
 *   Pro             — the line where it becomes real work: your own data,
 *                     managed agents, exportable audit packs.
 *   Enterprise      — the line where it becomes infrastructure: orgs, SSO,
 *                     MCP/API at scale, private control plane, audit support.
 *
 * Plus a usage-based developer tier for teams grounding their own agents.
 */

import { useLocation } from 'wouter';
import { ThemeToggle } from '../components/ui/ThemeToggle.js';
import { SmarticusWordmark, SmarticusMark } from '../components/ui/logos.js';
import { EVIDENCE_TYPE_COUNT, REG_COUNT, REQUIREMENT_COUNT } from '../lib/coverage.js';

interface Tier {
  id: string;
  name: string;
  price: string;
  cadence?: string;
  tagline: string;
  cta: { label: string; action: 'sandbox' | 'pro' | 'contact' };
  featured?: boolean;
  features: string[];
}

const TIERS: Tier[] = [
  {
    id: 'sandbox',
    name: 'Launch',
    price: 'Free',
    tagline: 'Launch medical-device agents on sample evidence before you commit anything.',
    cta: { label: 'Start agent build', action: 'sandbox' },
    features: [
      'Launch every medical-device agent template on built-in sample evidence',
      `Browse ${REQUIREMENT_COUNT} requirements across ${REG_COUNT} semantic compliance buckets`,
      `Use ${EVIDENCE_TYPE_COUNT} evidence types for runtime grounding`,
      'Verify the hash chain on any agent run',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$390',
    cadence: 'per seat / month',
    tagline: 'For QMS and Regulatory Affairs professionals doing the work.',
    cta: { label: 'Start Pro', action: 'pro' },
    featured: true,
    features: [
      'Everything in Launch',
      'Run managed agents on your own data — your tenant, never stored by us',
      'Deploy reusable Claude Managed Agents with required-data slots and review gates',
      'Design multi-agent workflows in the canvas',
      'Export audit packs and full hash-chained decision trails',
      'Email support with a 1-business-day response',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    tagline: 'For manufacturers standardising AI across the quality system.',
    cta: { label: 'Talk to us', action: 'contact' },
    features: [
      'Everything in Pro',
      'Organisations, SSO, and role-based access',
      'MCP server + Requirement API at scale',
      'Private or on-premise requirement control plane',
      'Custom regulations and internal SOP grounding',
      'Audit support, SLAs, and a named solutions engineer',
    ],
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Does Smarticus store our proprietary data?',
    a: 'No. Agents query the requirements map; your payloads stay in your tenant. The decision trail records what was decided and which requirement supported it — not your underlying records.',
  },
  {
    q: 'Does this replace our QMS or our people?',
    a: 'Neither. Smarticus prepares and checks the work and produces a defensible trail. Your QMS team owns final review and release. It grounds AI in the regulation — it is not a QMS of record.',
  },
  {
    q: 'How is the developer tier billed?',
    a: 'Usage-based. You pay per grounding call (qualification, discovery, validation) against the Requirement API or MCP server, with volume tiers. Talk to us for committed-use pricing.',
  },
  {
    q: 'Which regulations are covered today?',
    a: `The live graph currently contains ${REQUIREMENT_COUNT} requirements, ${EVIDENCE_TYPE_COUNT} evidence types, and ${REG_COUNT} semantic compliance buckets across medical-device regulations, standards, and QMS process areas.`,
  },
];

export function Pricing() {
  const [, navigate] = useLocation();

  function runCta(action: Tier['cta']['action']) {
    if (action === 'sandbox') navigate('/app/sandbox');
    else if (action === 'pro') navigate('/app');
    else window.location.href = 'mailto:hello@thinkertons.com?subject=Smarticus%20Enterprise';
  }

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh', color: 'var(--ink)' }}>
      <style>{`
        .pricing-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; align-items: stretch;
        }
        .price-card {
          display: flex; flex-direction: column; gap: 18px; padding: 28px 26px;
          background: var(--surface); border: 1px solid var(--rule); border-radius: var(--r-3);
          transition: border-color var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease);
        }
        .price-card:hover { border-color: var(--rule-strong); box-shadow: var(--shadow-1); }
        .price-card.featured { border-color: var(--orange); box-shadow: 0 0 0 3px var(--signal-soft); }
        .price-list { display: grid; gap: 11px; margin: 0; padding: 0; list-style: none; }
        .price-list li { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; color: var(--ink-2); line-height: 1.5; }
        .faq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 880px) {
          .pricing-grid { grid-template-columns: 1fr; }
          .faq-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'color-mix(in srgb, var(--paper) 92%, transparent)',
          backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--rule)',
        }}
      >
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 0, cursor: 'pointer', display: 'inline-flex' }}>
            <SmarticusWordmark size={16} tagline={false} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <ThemeToggle />
            <button className="btn btn-orange" onClick={() => navigate('/app/sandbox')}>
              Start agent build
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1240, margin: '0 auto', padding: '72px 32px 24px', textAlign: 'center' }}>
        <div className="eyebrow" style={{ marginBottom: 18 }}>Pricing</div>
        <h1
          style={{
            fontSize: 'clamp(36px, 5.4vw, 68px)', fontWeight: 500, letterSpacing: '-0.04em',
            lineHeight: 1.0, margin: '0 auto', maxWidth: 820,
          }}
        >
          Free to prove. Priced to <span style={{ color: 'var(--orange)' }}>scale</span>.
        </h1>
        <p style={{ margin: '22px auto 0', maxWidth: 560, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)' }}>
          Create grounded managed agents on sample data for free. Pay when you put your own data through and
          start deploying defensible agent workflows.
        </p>
      </section>

      {/* ── Tiers ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 8px' }}>
        <div className="pricing-grid">
          {TIERS.map((t) => (
            <div key={t.id} className={`price-card ${t.featured ? 'featured' : ''}`}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>{t.name}</span>
                  {t.featured && <span className="badge badge-signal">Most popular</span>}
                </div>
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 40, fontWeight: 500, letterSpacing: '-0.03em', color: 'var(--ink)', lineHeight: 1 }}>{t.price}</span>
                  {t.cadence && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t.cadence}</span>}
                </div>
                <p style={{ margin: '14px 0 0', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.5, minHeight: 40 }}>{t.tagline}</p>
              </div>

              <button
                className={t.featured ? 'btn btn-orange' : 'btn btn-ghost'}
                onClick={() => runCta(t.cta.action)}
                style={{ justifyContent: 'center' }}
              >
                {t.cta.label}
              </button>

              <ul className="price-list">
                {t.features.map((f) => (
                  <li key={f}>
                    <Check />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Developer band ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 8px' }}>
        <div
          style={{
            display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, alignItems: 'center',
            padding: '28px 30px', border: '1px solid var(--rule)', borderRadius: 'var(--r-3)',
            background: 'var(--paper-deep)',
          }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Developers</div>
            <h2 style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
              Ground your own agents, metered by call.
            </h2>
            <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 520 }}>
              The MCP server and Requirement API are usage-based: pay per qualification, discovery, and
              validation call. Eleven tools, one snippet, every call hash-chained.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => navigate('/app/connect')}>View developer docs</button>
              <button className="btn btn-ghost" onClick={() => (window.location.href = 'mailto:hello@thinkertons.com?subject=Smarticus%20API%20pricing')}>
                Get committed-use pricing
              </button>
            </div>
          </div>
          <pre style={{ margin: 0, fontSize: 13 }}>
            <code style={{ background: 'transparent', padding: 0 }}>npx @regground/mcp-server@latest</code>
          </pre>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 32px 24px' }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Questions</div>
        <div className="faq-grid">
          {FAQ.map((f) => (
            <div key={f.q} style={{ padding: '20px 22px', border: '1px solid var(--rule)', borderRadius: 'var(--r-2)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 8px', color: 'var(--ink)' }}>{f.q}</h3>
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ background: 'var(--ink)', color: 'var(--paper)', marginTop: 32 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '72px 32px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(30px, 4vw, 52px)', fontWeight: 500, letterSpacing: '-0.035em', color: 'var(--paper)', margin: '0 auto', maxWidth: 760, lineHeight: 1.05 }}>
            See it produce a deliverable before you decide.
          </h2>
          <div style={{ marginTop: 26, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-orange" onClick={() => navigate('/app/sandbox')}>Start agent build</button>
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--paper)', borderColor: 'var(--ink-3)' }}
              onClick={() => (window.location.href = 'mailto:hello@thinkertons.com?subject=Smarticus%20demo')}
            >
              Book a demo
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px 56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          <SmarticusMark size={14} />
          <span>Smarticus · Regulatory ground</span>
        </div>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 0, color: 'var(--ink-3)', fontSize: 13, cursor: 'pointer' }}>
          &larr; Back to home
        </button>
      </footer>
    </div>
  );
}

function Check() {
  return (
    <span className="check-orange" aria-hidden style={{ marginTop: 1 }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 5.4l2.1 2L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default Pricing;
