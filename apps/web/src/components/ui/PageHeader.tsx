/**
 * PageHeader — the one true page header for every app page.
 *
 * Why: Hayes Raffle's first principle — a person should always know,
 * within 200ms of arriving on a screen, three things:
 *   1. Where am I? (eyebrow)
 *   2. What am I looking at? (title)
 *   3. What can I do here? (subtitle / actions)
 *
 * One pattern. Every page. No surprises.
 */

import type { ReactNode } from 'react';

export interface PageHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** Optional right-hand area — primary action(s) live here. */
  actions?: ReactNode;
  /** Optional sub-row beneath subtitle (filters, tabs, breadcrumb). */
  meta?: ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, actions, meta }: PageHeaderProps) {
  return (
    <header
      style={{
        padding: '32px 40px 24px',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--paper)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            {eyebrow}
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                margin: '10px 0 0',
                color: 'var(--ink-3)',
                fontSize: 14,
                lineHeight: 1.55,
                maxWidth: 640,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>
      {meta && <div style={{ marginTop: 16 }}>{meta}</div>}
    </header>
  );
}

export default PageHeader;
