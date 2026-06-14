import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import {
  continueSessionState,
  evaluateSessionTimeout,
  initialSessionTimeoutState,
  visibleAfterAwayState,
  type SessionTimeoutConfig,
  type SessionTimeoutState,
  type SessionWarning,
} from './sessionTimeoutPolicy.js';

const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;
const DEFAULT_AWAY_TIMEOUT_MINUTES = 10;
const DEFAULT_WARNING_SECONDS = 60;

function envNumber(name: string, fallback: number): number {
  const raw = import.meta.env[name] as string | undefined;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const idleTimeoutMs = envNumber('VITE_SESSION_IDLE_TIMEOUT_MINUTES', DEFAULT_IDLE_TIMEOUT_MINUTES) * 60_000;
const awayTimeoutMs = envNumber('VITE_SESSION_AWAY_TIMEOUT_MINUTES', DEFAULT_AWAY_TIMEOUT_MINUTES) * 60_000;
const warningMs = envNumber('VITE_SESSION_WARNING_SECONDS', DEFAULT_WARNING_SECONDS) * 1_000;
const timeoutConfig: SessionTimeoutConfig = { idleTimeoutMs, awayTimeoutMs, warningMs };

export function SessionTimeoutGuard() {
  const { signOut } = useClerk();
  const [warning, setWarning] = useState<SessionWarning | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const stateRef = useRef<SessionTimeoutState>(
    initialSessionTimeoutState(Date.now(), document.hidden),
  );
  const signingOutRef = useRef(false);

  const timeoutLabels = useMemo(
    () => ({
      idle: Math.round(idleTimeoutMs / 60_000),
      away: Math.round(awayTimeoutMs / 60_000),
    }),
    [],
  );

  const endSession = useCallback(() => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    void signOut({ redirectUrl: '/' });
  }, [signOut]);

  const continueSession = useCallback(() => {
    const ts = Date.now();
    stateRef.current = continueSessionState(ts, document.hidden);
    setWarning(null);
    setNow(ts);
  }, []);

  useEffect(() => {
    const activityEvents = ['pointerdown', 'mousemove', 'keydown', 'scroll', 'touchstart'] as const;
    const onActivity = () => {
      if (warning) return;
      stateRef.current = { ...stateRef.current, lastActivityAt: Date.now() };
    };
    for (const event of activityEvents) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    return () => {
      for (const event of activityEvents) window.removeEventListener(event, onActivity);
    };
  }, [warning]);

  useEffect(() => {
    const markAway = (ts: number) => {
      stateRef.current = { ...stateRef.current, hiddenAt: stateRef.current.hiddenAt ?? ts };
    };
    const markPresent = (ts: number) => {
      stateRef.current = visibleAfterAwayState(timeoutConfig, stateRef.current, ts);
      setWarning(stateRef.current.warning);
    };
    const onVisibility = () => {
      const ts = Date.now();
      if (document.hidden) {
        markAway(ts);
        return;
      }
      markPresent(ts);
    };
    const onBlur = () => {
      markAway(Date.now());
    };
    const onFocus = () => {
      if (!document.hidden) markPresent(Date.now());
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      stateRef.current = { ...stateRef.current, warning };

      const decision = evaluateSessionTimeout(timeoutConfig, stateRef.current, ts);
      if (decision.kind === 'sign-out') {
        endSession();
        return;
      }
      if (decision.kind === 'warn') {
        stateRef.current = { ...stateRef.current, warning: decision.warning };
        setWarning(decision.warning);
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [endSession, warning]);

  if (!warning) return null;

  const secondsLeft = Math.max(0, Math.ceil((warning.expiresAt - now) / 1_000));
  const title = warning.reason === 'away' ? 'You have been away from this workspace.' : 'Your workspace is idle.';
  const body =
    warning.reason === 'away'
      ? `For tenant safety, sessions time out after about ${timeoutLabels.away} minutes away from the page.`
      : `For tenant safety, sessions time out after about ${timeoutLabels.idle} minutes without activity.`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Session timeout warning"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgba(10, 20, 34, 0.32)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          width: 'min(460px, calc(100vw - 48px))',
          background: 'var(--surface)',
          color: 'var(--ink)',
          border: '1px solid var(--rule-strong)',
          borderRadius: 'var(--r-3)',
          boxShadow: '0 24px 80px rgba(10, 31, 54, 0.24)',
          padding: 24,
        }}
      >
        <div className="eyebrow" style={{ marginBottom: 10 }}>Session timeout</div>
        <h2 style={{ fontSize: 25, letterSpacing: '-0.03em', margin: 0 }}>{title}</h2>
        <p style={{ margin: '12px 0 0', color: 'var(--ink-2)', lineHeight: 1.55 }}>
          {body} Continue now to keep your login active, or sign out.
        </p>
        <div
          style={{
            marginTop: 18,
            padding: '12px 14px',
            border: '1px solid var(--signal-edge)',
            background: 'var(--surface-warm)',
            borderRadius: 'var(--r-2)',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            color: 'var(--orange)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Signing out in {secondsLeft}s
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={endSession}>
            Sign out
          </button>
          <button className="btn btn-orange" onClick={continueSession} autoFocus>
            Continue session
          </button>
        </div>
      </div>
    </div>
  );
}
