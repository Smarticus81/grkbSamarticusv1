import { describe, expect, it } from 'vitest';
import {
  continueSessionState,
  evaluateSessionTimeout,
  initialSessionTimeoutState,
  visibleAfterAwayState,
  type SessionTimeoutConfig,
} from './sessionTimeoutPolicy.js';

const config: SessionTimeoutConfig = {
  idleTimeoutMs: 15 * 60_000,
  awayTimeoutMs: 10 * 60_000,
  warningMs: 60_000,
};

describe('session timeout policy', () => {
  it('warns before idle timeout and signs out at expiry', () => {
    const state = initialSessionTimeoutState(0, false);

    expect(evaluateSessionTimeout(config, state, 13 * 60_000)).toEqual({ kind: 'none' });

    const warningDecision = evaluateSessionTimeout(config, state, 14 * 60_000);
    expect(warningDecision).toEqual({
      kind: 'warn',
      warning: { reason: 'idle', expiresAt: 15 * 60_000 },
    });

    const warnedState = { ...state, warning: warningDecision.kind === 'warn' ? warningDecision.warning : null };
    expect(evaluateSessionTimeout(config, warnedState, 15 * 60_000)).toEqual({ kind: 'sign-out' });
  });

  it('continue session clears warning and restarts the clock', () => {
    const continued = continueSessionState(14 * 60_000, false);

    expect(continued).toEqual({
      lastActivityAt: 14 * 60_000,
      hiddenAt: null,
      warning: null,
    });
    expect(evaluateSessionTimeout(config, continued, 20 * 60_000)).toEqual({ kind: 'none' });
  });

  it('warns when the user returns near the away timeout and signs out when the countdown expires', () => {
    const hidden = initialSessionTimeoutState(0, true);
    const returned = visibleAfterAwayState(config, hidden, 9 * 60_000);

    expect(returned.warning).toEqual({ reason: 'away', expiresAt: 10 * 60_000 });
    expect(evaluateSessionTimeout(config, returned, 9 * 60_000 + 30_000)).toEqual({ kind: 'none' });
    expect(evaluateSessionTimeout(config, returned, 10 * 60_000)).toEqual({ kind: 'sign-out' });
  });

  it('does not warn or sign out while the page remains hidden', () => {
    const hidden = initialSessionTimeoutState(0, true);

    expect(evaluateSessionTimeout(config, hidden, 8 * 60_000)).toEqual({ kind: 'none' });
    expect(evaluateSessionTimeout(config, hidden, 9 * 60_000)).toEqual({ kind: 'none' });
    expect(evaluateSessionTimeout(config, hidden, 10 * 60_000)).toEqual({ kind: 'none' });
  });

  it('starts a full visible warning countdown when the user returns after the away timeout', () => {
    const hidden = initialSessionTimeoutState(0, true);
    expect(evaluateSessionTimeout(config, hidden, 20 * 60_000)).toEqual({ kind: 'none' });

    const returned = visibleAfterAwayState(config, hidden, 20 * 60_000);
    expect(returned.warning).toEqual({ reason: 'away', expiresAt: 21 * 60_000 });
    expect(evaluateSessionTimeout(config, returned, 20 * 60_000 + 59_000)).toEqual({ kind: 'none' });
    expect(evaluateSessionTimeout(config, returned, 21 * 60_000)).toEqual({ kind: 'sign-out' });
  });
});
