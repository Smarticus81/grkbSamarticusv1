import { useState, useEffect } from 'react';

export function ThemeToggle() {
  const [light, setLight] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('theme');
    return stored === null ? true : stored === 'light';
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
        border: '1px solid var(--rule)',
        cursor: 'pointer',
        padding: 0,
        width: 28,
        height: 28,
        borderRadius: 'var(--r-2)',
        color: 'var(--ink-3)',
        transition: 'color var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--ink)';
        e.currentTarget.style.borderColor = 'var(--rule-strong)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--ink-3)';
        e.currentTarget.style.borderColor = 'var(--rule)';
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        {light ? (
          <path
            d="M11 8.5A4.5 4.5 0 0 1 5.5 3a4.5 4.5 0 1 0 5.5 5.5Z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.1" />
            <path
              d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.8 2.8l1 1M10.2 10.2l1 1M2.8 11.2l1-1M10.2 3.8l1-1"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </button>
  );
}