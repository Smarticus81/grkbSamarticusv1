/**
 * EmptyState — every empty state in the app uses this.
 *
 * Why: the cold "no data" state is where users churn. The warm
 * "here's what to do next" state is where they convert.
 * Hayes Raffle: empty states are the most-read copy in any product.
 */

import type { ReactNode } from 'react';
import { Link } from 'wouter';

export interface EmptyStateProps {
  /** Eyebrow above the title. Sets expectation. */
  eyebrow?: string;
  /** Big, plain-English line. Tell them what they're seeing — or not seeing. */
  title: string;
  /** One supportive sentence. Calm, specific, never apologetic. */
  body: string;
  /** Primary CTA — the one obvious next step. */
  primaryAction?: { label: string; href?: string; onClick?: () => void };
  /** Optional secondary action — usually "Learn more". */
  secondaryAction?: { label: string; href?: string; onClick?: () => void };
  /** Optional inline visual (illustration, icon, status dot row). */
  visual?: ReactNode;
}

export function EmptyState({
  eyebrow,
  title,
  body,
  primaryAction,
  secondaryAction,
  visual,
}: EmptyStateProps) {
  return (
    <div
      style={{
        margin: '0 auto',
        maxWidth: 560,
        padding: '64px 32px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}
      className="rise"
    >
      {visual && <div style={{ marginBottom: 8 }}>{visual}</div>}
      {eyebrow && (
        <div className="eyebrow" style={{ color: 'var(--ink-3)' }}>
          {eyebrow}
        </div>
      )}
      <h2
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          margin: 0,
          color: 'var(--ink)',
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          color: 'var(--ink-3)',
          lineHeight: 1.6,
          maxWidth: 440,
        }}
      >
        {body}
      </p>
      {(primaryAction || secondaryAction) && (
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {primaryAction && <ActionButton {...primaryAction} variant="orange" />}
          {secondaryAction && <ActionButton {...secondaryAction} variant="ghost" />}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  href,
  onClick,
  variant,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  variant: 'orange' | 'ghost';
}) {
  const cls = variant === 'orange' ? 'btn btn-orange' : 'btn btn-ghost';
  if (href) {
    return (
      <Link href={href} className={cls} style={{ textDecoration: 'none', borderBottom: 0 }}>
        {label}
      </Link>
    );
  }
  return (
    <button className={cls} onClick={onClick} type="button">
      {label}
    </button>
  );
}

export default EmptyState;
