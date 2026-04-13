/**
 * Thinkerton & Smarticus SVG logos
 */

interface LogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Thinkerton logo — a stylized brain/lightbulb mark in teal/cyan.
 * Inspired by the original Thinkerton brand: a thinking head silhouette 
 * with interconnected neural pathways forming a "T".
 */
export function ThinkertonLogo({ size = 32, className, style }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      {/* Head silhouette */}
      <path
        d="M32 6C19.85 6 10 15.85 10 28c0 7.18 3.44 13.56 8.76 17.58C20.4 46.82 22 49.5 22 52v2c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-2c0-2.5 1.6-5.18 3.24-6.42C50.56 41.56 54 35.18 54 28 54 15.85 44.15 6 32 6Z"
        fill="url(#thinkerton-grad)"
        opacity="0.15"
      />
      {/* Neural network paths forming abstract "T" */}
      <path
        d="M20 26h24M32 26v18"
        stroke="url(#thinkerton-grad)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Neural nodes */}
      <circle cx="20" cy="26" r="3" fill="var(--neo-cyan, #5CC3C9)" />
      <circle cx="32" cy="26" r="3" fill="var(--accent-bright, #0E8CC2)" />
      <circle cx="44" cy="26" r="3" fill="var(--neo-cyan, #5CC3C9)" />
      <circle cx="32" cy="44" r="3" fill="var(--neo-green, #90CB62)" />
      {/* Branching connections */}
      <line x1="26" y1="26" x2="22" y2="18" stroke="var(--neo-cyan, #5CC3C9)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="38" y1="26" x2="42" y2="18" stroke="var(--neo-cyan, #5CC3C9)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="32" y1="35" x2="24" y2="38" stroke="var(--neo-green, #90CB62)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="32" y1="35" x2="40" y2="38" stroke="var(--neo-green, #90CB62)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      {/* Small synapse dots */}
      <circle cx="22" cy="18" r="2" fill="var(--neo-cyan, #5CC3C9)" opacity="0.7" />
      <circle cx="42" cy="18" r="2" fill="var(--neo-cyan, #5CC3C9)" opacity="0.7" />
      <circle cx="24" cy="38" r="2" fill="var(--neo-green, #90CB62)" opacity="0.6" />
      <circle cx="40" cy="38" r="2" fill="var(--neo-green, #90CB62)" opacity="0.6" />
      {/* Base line (chin of lightbulb) */}
      <line x1="26" y1="52" x2="38" y2="52" stroke="var(--border-default, #1E5270)" strokeWidth="2" strokeLinecap="round" />
      <line x1="28" y1="56" x2="36" y2="56" stroke="var(--border-default, #1E5270)" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id="thinkerton-grad" x1="10" y1="6" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5CC3C9" />
          <stop offset="0.5" stopColor="#0E8CC2" />
          <stop offset="1" stopColor="#90CB62" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Smarticus logo — a compliance shield with an "S" neural pathway and graph nodes.
 * Represents: AI intelligence (neural path) + regulatory protection (shield) + 
 * knowledge graph connectivity (nodes).
 */
export function SmarticusLogo({ size = 32, className, style }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      {/* Shield shape */}
      <path
        d="M32 4L8 16v16c0 14.4 10.24 27.84 24 32 13.76-4.16 24-17.6 24-32V16L32 4Z"
        fill="url(#smarticus-shield)"
        opacity="0.12"
        stroke="url(#smarticus-border)"
        strokeWidth="2"
      />
      {/* Inner shield highlight */}
      <path
        d="M32 10L14 19.5v12.5c0 11.2 7.68 21.6 18 24.8 10.32-3.2 18-13.6 18-24.8V19.5L32 10Z"
        fill="none"
        stroke="url(#smarticus-border)"
        strokeWidth="1"
        opacity="0.3"
      />
      {/* "S" neural pathway — the core mark */}
      <path
        d="M38 20c0 0-4-2-8 0s-6 6-4 10 6 6 8 8 2 6-2 8"
        stroke="url(#smarticus-s-grad)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Graph nodes along the S path */}
      <circle cx="38" cy="20" r="2.5" fill="var(--neo-cyan, #5CC3C9)" />
      <circle cx="26" cy="24" r="2.5" fill="var(--accent-bright, #0E8CC2)" />
      <circle cx="34" cy="34" r="2.5" fill="var(--neo-green, #90CB62)" />
      <circle cx="32" cy="46" r="2.5" fill="var(--neo-marigold, #FFA901)" />
      {/* Radiating connection lines from nodes */}
      <line x1="38" y1="20" x2="46" y2="18" stroke="var(--neo-cyan, #5CC3C9)" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <line x1="26" y1="24" x2="18" y2="22" stroke="var(--accent-bright, #0E8CC2)" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <line x1="34" y1="34" x2="44" y2="36" stroke="var(--neo-green, #90CB62)" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <line x1="32" y1="46" x2="22" y2="48" stroke="var(--neo-marigold, #FFA901)" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      {/* Tiny endpoint dots */}
      <circle cx="46" cy="18" r="1.5" fill="var(--neo-cyan, #5CC3C9)" opacity="0.5" />
      <circle cx="18" cy="22" r="1.5" fill="var(--accent-bright, #0E8CC2)" opacity="0.5" />
      <circle cx="44" cy="36" r="1.5" fill="var(--neo-green, #90CB62)" opacity="0.5" />
      <circle cx="22" cy="48" r="1.5" fill="var(--neo-marigold, #FFA901)" opacity="0.5" />
      <defs>
        <linearGradient id="smarticus-shield" x1="8" y1="4" x2="56" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0A6190" />
          <stop offset="1" stopColor="#5CC3C9" />
        </linearGradient>
        <linearGradient id="smarticus-border" x1="8" y1="4" x2="56" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5CC3C9" />
          <stop offset="0.5" stopColor="#0E8CC2" />
          <stop offset="1" stopColor="#90CB62" />
        </linearGradient>
        <linearGradient id="smarticus-s-grad" x1="24" y1="18" x2="40" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5CC3C9" />
          <stop offset="0.4" stopColor="#0E8CC2" />
          <stop offset="0.7" stopColor="#90CB62" />
          <stop offset="1" stopColor="#FFA901" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Compact Smarticus icon — just the shield mark, for sidebar/favicon use
 */
export function SmarticusIcon({ size = 24, className, style }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <path
        d="M12 2L3 6.5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12v-6L12 2Z"
        fill="url(#sicon-bg)"
        opacity="0.15"
        stroke="url(#sicon-stroke)"
        strokeWidth="1.5"
      />
      <path
        d="M14.5 8c0 0-1.5-.8-3 0s-2.2 2.2-1.5 3.8 2.2 2.2 3 3 .8 2.2-.8 3"
        stroke="url(#sicon-s)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="14.5" cy="8" r="1.5" fill="var(--neo-cyan, #5CC3C9)" />
      <circle cx="12.2" cy="17.8" r="1.5" fill="var(--neo-marigold, #FFA901)" />
      <defs>
        <linearGradient id="sicon-bg" x1="3" y1="2" x2="21" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0A6190" />
          <stop offset="1" stopColor="#5CC3C9" />
        </linearGradient>
        <linearGradient id="sicon-stroke" x1="3" y1="2" x2="21" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5CC3C9" />
          <stop offset="1" stopColor="#0E8CC2" />
        </linearGradient>
        <linearGradient id="sicon-s" x1="10" y1="7" x2="15" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5CC3C9" />
          <stop offset="0.5" stopColor="#0E8CC2" />
          <stop offset="1" stopColor="#FFA901" />
        </linearGradient>
      </defs>
    </svg>
  );
}
