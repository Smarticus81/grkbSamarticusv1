/**
 * Smarticus / Thinkertons brand marks.
 *
 * Smarticus visual: an institutional requirements-grid seal. Outer rounded
 * square = controlled process boundary. Three internal nodes = requirements,
 * required data, review output. One burnt-orange verified node. Connecting
 * paths form a requirements → data → output flow.
 *
 * Works at 16px, 32px, 96px. Works monochrome. Feels like regulatory
 * infrastructure, not a startup toy.
 *
 * Wordmark: "Smarticus" with refined casing, orange verified-dot accent.
 *
 * Thinkertons visual: a minimalist "T" with a strong crossbar — appears only
 * on the landing page, in the by-Thinkertons lockup, and in the audit badge.
 */

import type { CSSProperties, ReactNode } from 'react';

interface MarkProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Primary stroke color. Defaults to brand navy via `--ink`. */
  color?: string;
  /** Accent color for the orange graph nodes. Defaults to `--orange`. */
  accent?: string;
  /** Render in single-color form (no orange). Used in monochrome lockups. */
  monochrome?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * SmarticusMark
 * Institutional requirements-grid seal:
 * - Outer rounded square = controlled process boundary
 * - Three internal nodes = requirements (top-left), required data (top-right),
 *   review output (bottom-center)
 * - One orange verified node (review output)
 * - Connecting paths: requirement → data → output
 * - Subtle broken symmetry = intelligence, not bureaucracy
 * Works at 16px, 32px, 96px. Works monochrome.
 * ──────────────────────────────────────────────────────────────────────── */
export function SmarticusMark({
  size = 28,
  className,
  style,
  color = 'var(--ink)',
  accent = 'var(--orange)',
  monochrome = false,
}: MarkProps) {
  const accentColor = monochrome ? color : accent;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Outer rounded square — controlled process boundary */}
      <rect
        x="4" y="4" width="56" height="56" rx="8"
        stroke={color}
        strokeWidth="2.4"
        fill="none"
      />
      {/* Connecting paths: requirement → data, requirement → output, data → output */}
      <line x1="20" y1="22" x2="44" y2="22" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="20" y1="22" x2="32" y2="44" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="44" y1="22" x2="32" y2="44" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      {/* Node: Requirements (top-left) */}
      <circle cx="20" cy="22" r="4.5" fill={color} />
      {/* Node: Required Data (top-right) */}
      <circle cx="44" cy="22" r="4.5" fill={color} />
      {/* Node: Review Output — verified (bottom-center, orange) */}
      <circle cx="32" cy="44" r="5" fill={accentColor} />
      {/* Small verification check inside orange node */}
      <path
        d="M29.5 44 L31 45.8 L34.5 42"
        stroke={monochrome ? 'var(--paper)' : '#fff'}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * SmarticusWordmark
 * "Smarticus" in Inter Tight 500 with refined casing and a small orange
 * verified-dot after the name. Clean, institutional, not playful.
 * ──────────────────────────────────────────────────────────────────────── */
export function SmarticusWordmark({
  size = 22,
  color,
  accent,
  tagline,
  showSub,
  showMark = true,
  monochrome = false,
  style,
}: {
  size?: number;
  color?: string;
  accent?: string;
  /** REGULATORY INTELLIGENCE. ENGINEERED. (or custom). Pass `false` to hide. */
  tagline?: string | false;
  /** Backwards-compat alias for `tagline`. If true, shows default tagline. */
  showSub?: boolean;
  showMark?: boolean;
  monochrome?: boolean;
  style?: CSSProperties;
}) {
  const inkColor = color ?? 'var(--ink)';
  const accentColor = monochrome ? inkColor : (accent ?? 'var(--orange)');
  const resolvedTagline =
    tagline === false
      ? null
      : tagline ?? (showSub ? 'REGULATORY INTELLIGENCE. ENGINEERED.' : null);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(size * 0.5),
        color: inkColor,
        ...style,
      }}
    >
      {showMark && (
        <SmarticusMark
          size={size + 14}
          color={inkColor}
          accent={accentColor}
          monochrome={monochrome}
        />
      )}
      <span
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          lineHeight: 1.0,
          gap: 4,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--sans)',
            fontSize: size,
            fontWeight: 500,
            letterSpacing: '-0.03em',
            color: inkColor,
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: Math.round(size * 0.2),
          }}
        >
          <span>Smarticus</span>
          {/* Verified dot — the brand accent */}
          <svg
            width={Math.max(4, size * 0.22)}
            height={Math.max(4, size * 0.22)}
            viewBox="0 0 8 8"
            style={{ flexShrink: 0, marginBottom: Math.round(size * 0.08) }}
            aria-hidden="true"
          >
            <circle cx="4" cy="4" r="4" fill={accentColor} />
          </svg>
        </span>
        {resolvedTagline && (
          <span
            className="brand-tagline"
            style={{ fontSize: Math.max(8.5, size * 0.42) }}
          >
            {resolvedTagline}
          </span>
        )}
      </span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * ThinkertonsMark
 * A bold "T" with an extended top crossbar. Navy ink only.
 * ──────────────────────────────────────────────────────────────────────── */
export function ThinkertonsMark({
  size = 28,
  className,
  style,
  color = 'var(--ink)',
}: Omit<MarkProps, 'accent' | 'monochrome'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Outer top bar — extends past the column edges */}
      <line x1="6" y1="10" x2="42" y2="10" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Inner top bar — narrower, sits below */}
      <line x1="14" y1="16" x2="34" y2="16" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      {/* Stem */}
      <line x1="24" y1="16" x2="24" y2="42" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * ThinkertonsWordmark
 * Lowercase "thinkertons" with optional FOUNDATION. EXPERTISE. IMPACT.
 * tagline. Used inside the by-Thinkertons lockup and the landing footer.
 * ──────────────────────────────────────────────────────────────────────── */
export function ThinkertonsWordmark({
  size = 18,
  color,
  showMark = true,
  tagline,
  style,
}: {
  size?: number;
  color?: string;
  showMark?: boolean;
  tagline?: string | false;
  style?: CSSProperties;
}) {
  const inkColor = color ?? 'var(--ink)';
  const resolvedTagline =
    tagline === false ? null : tagline ?? null;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(size * 0.4),
        color: inkColor,
        ...style,
      }}
    >
      {showMark && <ThinkertonsMark size={size + 6} color={inkColor} />}
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, lineHeight: 1 }}>
        <span
          style={{
            fontFamily: 'var(--sans)',
            fontSize: size,
            fontWeight: 500,
            letterSpacing: '-0.035em',
            textTransform: 'lowercase',
          }}
        >
          thinkertons
        </span>
        {resolvedTagline && (
          <span className="brand-tagline" style={{ fontSize: Math.max(8.5, size * 0.42) }}>
            {resolvedTagline}
          </span>
        )}
      </span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * SmarticusByThinkertonsLockup
 * The combined brand lockup from sheet panel 3.
 *  [Smarticus mark + lowercase wordmark + tagline]  |  BY  thinkertons
 * Used on the landing page only.
 * ──────────────────────────────────────────────────────────────────────── */
export function SmarticusByThinkertonsLockup({
  size = 22,
  color,
  accent,
  style,
}: {
  size?: number;
  color?: string;
  accent?: string;
  style?: CSSProperties;
}) {
  const inkColor = color ?? 'var(--ink)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 18,
        color: inkColor,
        ...style,
      }}
    >
      <SmarticusWordmark
        size={size}
        color={inkColor}
        accent={accent}
        tagline="REGULATORY INTELLIGENCE. ENGINEERED."
      />
      <span
        aria-hidden="true"
        style={{
          width: 1,
          height: size + 16,
          background: inkColor,
          opacity: 0.35,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <span
          className="brand-tagline"
          style={{ fontSize: Math.max(8.5, size * 0.42), color: inkColor, opacity: 0.6 }}
        >
          BY
        </span>
        <span
          style={{
            fontFamily: 'var(--sans)',
            fontSize: size * 0.78,
            fontWeight: 500,
            letterSpacing: '-0.035em',
            textTransform: 'lowercase',
            color: inkColor,
          }}
        >
          thinkertons
        </span>
      </span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * SmarticusBadge
 * Circular seal version. Two concentric rings, Smarticus mark in the centre,
 * "SMARTICUS" arched along the top of the inner ring, "BY THINKERTONS"
 * arched along the bottom. Two small orange dots at the meridians.
 * ──────────────────────────────────────────────────────────────────────── */
export function SmarticusBadge({
  size = 96,
  color = 'var(--ink)',
  accent = 'var(--orange)',
  className,
  style,
}: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <path id="badge-arc-top" d="M 30,100 A 70,70 0 0 1 170,100" />
        <path id="badge-arc-bottom" d="M 35,108 A 65,65 0 0 0 165,108" />
      </defs>
      <circle cx="100" cy="100" r="95" stroke={color} strokeWidth="1.6" />
      <circle cx="100" cy="100" r="78" stroke={color} strokeWidth="1.2" />
      <circle cx="100" cy="100" r="58" stroke={color} strokeWidth="1.2" />
      {/* Meridian dots */}
      <circle cx="13" cy="100" r="3.5" fill={accent} />
      <circle cx="187" cy="100" r="3.5" fill={accent} />
      {/* Centre mark */}
      <g transform="translate(70, 68) scale(0.95)">
        <SmarticusMark size={64} color={color} accent={accent} />
      </g>
      <text
        fill={color}
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: '0.34em',
          textTransform: 'uppercase',
        }}
      >
        <textPath href="#badge-arc-top" startOffset="50%" textAnchor="middle">
          SMARTICUS
        </textPath>
      </text>
      <text
        fill={color}
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.34em',
          textTransform: 'uppercase',
        }}
      >
        <textPath href="#badge-arc-bottom" startOffset="50%" textAnchor="middle">
          BY THINKERTONS
        </textPath>
      </text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * BrandSidebarBlock
 * Small composition used in the app shell sidebar — mark + lowercase
 * wordmark stacked above the brand tagline.
 * ──────────────────────────────────────────────────────────────────────── */
export function BrandSidebarBlock({
  onClick,
  children,
}: {
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        padding: '4px 0 12px',
      }}
    >
      <SmarticusWordmark size={18} tagline="REGULATORY INTELLIGENCE. ENGINEERED." />
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Backwards-compatible aliases.
 * Earlier code referenced these names; keep them so we never break a
 * consumer when we evolve the canonical exports.
 * ──────────────────────────────────────────────────────────────────────── */
export const SmarticusIcon = SmarticusMark;
export const SmarticusLogo = SmarticusMark;
export const ThinkertonLogo = ThinkertonsMark;
