import type { ReactNode, CSSProperties } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
  padding?: 'none' | 'sm' | 'md';
}

export function Card({ title, children, style, padding = 'md' }: CardProps) {
  const padMap = { none: 0, sm: '12px 16px', md: '16px 20px' };
  return (
    <section
      style={{
        background: 'var(--bg-root)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: padMap[padding],
        marginBottom: 12,
        boxShadow: 'var(--shadow-sm)',
        ...(style ?? {}),
      }}
    >
      {title && (
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}
