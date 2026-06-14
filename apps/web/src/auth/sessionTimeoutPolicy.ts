export type WarningReason = 'idle' | 'away';

export interface SessionWarning {
  reason: WarningReason;
  expiresAt: number;
}

export interface SessionTimeoutConfig {
  idleTimeoutMs: number;
  awayTimeoutMs: number;
  warningMs: number;
}

export interface SessionTimeoutState {
  lastActivityAt: number;
  hiddenAt: number | null;
  warning: SessionWarning | null;
}

export type SessionTimeoutDecision =
  | { kind: 'none' }
  | { kind: 'warn'; warning: SessionWarning }
  | { kind: 'sign-out' };

export function initialSessionTimeoutState(now: number, isHidden: boolean): SessionTimeoutState {
  return {
    lastActivityAt: now,
    hiddenAt: isHidden ? now : null,
    warning: null,
  };
}

export function continueSessionState(now: number, isHidden: boolean): SessionTimeoutState {
  return initialSessionTimeoutState(now, isHidden);
}

export function evaluateSessionTimeout(
  config: SessionTimeoutConfig,
  state: SessionTimeoutState,
  now: number,
): SessionTimeoutDecision {
  if (state.warning) {
    return now >= state.warning.expiresAt ? { kind: 'sign-out' } : { kind: 'none' };
  }

  if (state.hiddenAt !== null) {
    return { kind: 'none' };
  }

  const idleFor = now - state.lastActivityAt;
  if (idleFor >= config.idleTimeoutMs) {
    return { kind: 'sign-out' };
  }

  if (idleFor >= Math.max(0, config.idleTimeoutMs - config.warningMs)) {
    return {
      kind: 'warn',
      warning: { reason: 'idle', expiresAt: state.lastActivityAt + config.idleTimeoutMs },
    };
  }

  return { kind: 'none' };
}

export function visibleAfterAwayState(
  config: SessionTimeoutConfig,
  state: SessionTimeoutState,
  now: number,
): SessionTimeoutState {
  const hiddenAt = state.hiddenAt;
  const next: SessionTimeoutState = {
    ...state,
    hiddenAt: null,
    lastActivityAt: now,
  };

  if (hiddenAt !== null && now - hiddenAt >= Math.max(0, config.awayTimeoutMs - config.warningMs)) {
    return {
      ...next,
      warning: { reason: 'away', expiresAt: now + config.warningMs },
    };
  }

  return next;
}
