/**
 * Smarticus / Thinkertons brand marks.
 *
 * Smarticus visual: a stylised navy "S" cradling two linked orange nodes —
 * the obligation graph held by the regulatory frame.
 *
 * Wordmark: lowercase "smarticus" with the apex of the "A" replaced by an
 * orange triangle that doubles as the "graph node" accent.
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
 * Navy "S" cradle (open at top-right and bottom-left) cradling two linked
 * orange nodes — a circle, an edge, a circle. Reads as "regulatory frame +
 * knowledge graph".
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
      {/*
        Stylised "S" built from two mirrored hook arcs — matches the Smarticus
        brand mark: a rounded upper hook opening to the right and a rounded
        lower hook opening to the left, pinched at the centre where the
        orange node link crosses.
      */}
      <path
        d="M54 18 C 54 9, 44 6, 34 8 C 22 10, 14 18, 16 26 C 17.5 32, 24 33, 32 32"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M10 46 C 10 55, 20 58, 30 56 C 42 54, 50 46, 48 38 C 46.5 32, 40 31, 32 32"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Linked graph nodes — the obligation graph held inside the cradle. */}
      <line
        x1="18" y1="42" x2="46" y2="22"
        stroke={accentColor}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="18" cy="42" r="4.6" fill={accentColor} />
      <circle cx="46" cy="22" r="4.6" fill={accentColor} />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * SmarticusWordmark
 * Lowercase "smarticus" with the apex of the "A" replaced by an orange
 * triangle. Inter Tight 500, tight tracking. Optional REGULATORY
 * INTELLIGENCE. ENGINEERED. tagline.
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
            letterSpacing: '-0.04em',
            textTransform: 'lowercase',
            color: inkColor,
            display: 'inline-flex',
            alignItems: 'baseline',
          }}
        >
          {/* "sm" */}
          <span>sm</span>
          {/* "a" with orange triangle apex replacement */}
          <span style={{ position: 'relative', display: 'inline-block' }}>
            a
            <svg
              viewBox="0 0 12 8"
              width={size * 0.42}
              height={size * 0.28}
              style={{
                position: 'absolute',
                left: '50%',
                top: `-${size * 0.18}px`,
                transform: 'translateX(-50%)',
              }}
              aria-hidden="true"
            >
              <path d="M6 0 L12 8 L0 8 Z" fill={accentColor} />
            </svg>
          </span>
          {/* "rticus" */}
          <span>rticus</span>
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
