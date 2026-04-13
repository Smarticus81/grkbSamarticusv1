import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
}

const baseStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontWeight: 500,
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: 'var(--bg-root)',
    border: '1px solid var(--accent)',
  },
  secondary: {
    background: 'var(--bg-root)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--danger-muted)',
    color: 'var(--danger)',
    border: '1px solid transparent',
  },
};

const sizes = {
  sm: { padding: '4px 10px', fontSize: 12 },
  md: { padding: '8px 16px', fontSize: 13 },
};

export function Button({ variant = 'primary', size = 'md', disabled, style, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        ...baseStyle,
        ...variants[variant],
        ...sizes[size],
        ...(disabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
        ...(style ?? {}),
      }}
    />
  );
}
