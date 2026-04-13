import { useState, useEffect } from 'react';

export function ThemeToggle() {
  const [light, setLight] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('theme') === 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
    localStorage.setItem('theme', light ? 'light' : 'dark');
  }, [light]);

  return (
    <button
      onClick={() => setLight((l) => !l)}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      title={light ? 'Switch to dark mode' : 'Switch to light mode'}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 6,
        borderRadius: 'var(--radius-sm)',
        fontSize: 16,
        color: 'var(--text-muted)',
        transition: 'color 0.2s',
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {light ? '\u263E' : '\u2600'}
    </button>
  );
}
