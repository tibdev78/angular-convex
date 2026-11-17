/*
 * Angular port of @convex-dev/auth 2.0.0 `src/methods/username-passkey/react_impl.tsx`
 * (conditional-mediation autofill loop and the single WebAuthn ceremony slot).
 * Apache-2.0 © Convex, Inc.
 */
import { signal, type Signal } from '@angular/core';
import {
  foldClientError,
  type PasskeyClientError,
  type PasskeyClientFailure,
  type ResolvedPasskeyCeremonies,
} from './ceremonies';
import type { WireAuthenticationResponse, WireRequestOptions } from './wire';

export type PasskeyAutofillStatus = 'idle' | 'waiting' | 'signingIn' | 'signedIn' | 'stopped';

/** Server challenges live 10 minutes; autofill asks for a fresh one 2 minutes before. */
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const AUTOFILL_REFRESH_MS = CHALLENGE_TTL_MS - 2 * 60 * 1000;
const AUTOFILL_STALENESS_CHECK_MS = 10 * 1000;
const MAX_AUTOFILL_FAILURES = 3;
const FOREIGN_CEREMONY_WARNING =
  '[convex-auth] The passkey autofill request was ended by another WebAuthn ceremony, so autofill has ' +
  'stopped. A page that runs passkey autofill must run every one of its modal ceremonies through the ' +
  'passkey inject functions, so that autofill yields the browser single ceremony slot.';

export interface PasskeyAutofillGates {
  pauseAutofillFlow: () => void;
  resumeAutofillFlow: () => void;
  isAutofillSigningIn: () => boolean;
}

export interface PasskeyAutofill<E> extends PasskeyAutofillGates {
  /** `null` until known. */
  available: Signal<boolean | null>;
  status: Signal<PasskeyAutofillStatus>;
  lastError: Signal<E | PasskeyClientError | null>;
  /** Stops the loop (called on destroy). */
  stop: () => void;
}

/**
 * Keeps a conditional-mediation request open so the browser offers passkeys in
 * the username field's autofill; refreshes it before the challenge expires and
 * yields while a modal ceremony runs.
 */
export function startPasskeyAutofill<E>(options: {
  ceremonies: ResolvedPasskeyCeremonies;
  start: () => Promise<WireRequestOptions>;
  onAssertion: (response: WireAuthenticationResponse) => Promise<{ success: true } | { success: false; userError: E }>;
}): PasskeyAutofill<E> {
  const { ceremonies } = options;
  const available = signal<boolean | null>(null);
  const status = signal<PasskeyAutofillStatus>('idle');
  const lastError = signal<E | PasskeyClientError | null>(null);
  let pauseCount = 0;
  let wake: (() => void) | null = null;
  let controller: AbortController | null = null;
  let signingIn = false;
  let alive = true;

  const pauseAutofillFlow = () => {
    pauseCount += 1;
    controller?.abort();
  };
  const resumeAutofillFlow = () => {
    pauseCount = Math.max(0, pauseCount - 1);
    if (pauseCount === 0) wake?.();
  };
  const park = () =>
    new Promise<void>((resolve) => {
      wake = () => {
        wake = null;
        resolve();
      };
    });

  const runLoop = async () => {
    let supported = false;
    try {
      supported = await ceremonies.isAutofillAvailable();
    } catch {
      // Treated as unavailable.
    }
    if (!alive) return;
    available.set(supported);
    if (!supported) {
      status.set('stopped');
      return;
    }
    let failures = 0;
    while (alive) {
      if (pauseCount > 0) {
        await park();
        continue;
      }
      status.set('waiting');
      const requestedAt = Date.now();
      let requestOptions: WireRequestOptions;
      try {
        requestOptions = await options.start();
      } catch (cause) {
        if (!alive) return;
        lastError.set(foldClientError(cause));
        status.set('stopped');
        return;
      }
      if (!alive) return;
      if (pauseCount > 0) continue;
      const current = new AbortController();
      controller = current;
      const refreshIfStale = () => {
        if (Date.now() - requestedAt >= AUTOFILL_REFRESH_MS) current.abort();
      };
      const refreshTimer = setInterval(refreshIfStale, AUTOFILL_STALENESS_CHECK_MS);
      const stopResumeChecks = ceremonies.onResume(refreshIfStale);
      const result = await ceremonies.authenticateWithAutofill(requestOptions, current.signal);
      if (controller === current) controller = null;
      clearInterval(refreshTimer);
      stopResumeChecks();
      if (!alive) return;
      if (!result.success) {
        // Aborted by us (pause, refresh): loop for a fresh request.
        if (current.signal.aborted) continue;
        if (result.userError.error === 'CEREMONY_ABORTED') console.warn(FOREIGN_CEREMONY_WARNING);
        lastError.set(result.userError);
        status.set('stopped');
        return;
      }
      status.set('signingIn');
      signingIn = true;
      let outcome: { success: true } | { success: false; userError: E };
      try {
        outcome = await options.onAssertion(result.response);
      } catch (cause) {
        if (!alive) return;
        lastError.set(foldClientError(cause));
        status.set('stopped');
        return;
      } finally {
        signingIn = false;
      }
      if (!alive) return;
      if (outcome.success) {
        lastError.set(null);
        status.set('signedIn');
        return;
      }
      lastError.set(outcome.userError);
      failures += 1;
      if (failures >= MAX_AUTOFILL_FAILURES) {
        status.set('stopped');
        return;
      }
    }
  };
  void runLoop();

  return {
    available: available.asReadonly(),
    status: status.asReadonly(),
    lastError: lastError.asReadonly(),
    pauseAutofillFlow,
    resumeAutofillFlow,
    isAutofillSigningIn: () => signingIn,
    stop: () => {
      alive = false;
      controller?.abort();
      wake?.();
    },
  };
}

export type AlreadyPendingError = { error: 'ALREADY_PENDING' };
export interface AlreadyPendingFailure {
  success: false;
  userError: AlreadyPendingError;
}

/** Only one modal ceremony at a time; pauses autofill while it runs. */
export function createPasskeyCeremonySlot(autofill: PasskeyAutofillGates | null): {
  pending: Signal<boolean>;
  run: <T>(fn: () => Promise<T>) => Promise<T | PasskeyClientFailure | AlreadyPendingFailure>;
} {
  const pending = signal(false);
  let busy = false;
  const run = async <T>(fn: () => Promise<T>): Promise<T | PasskeyClientFailure | AlreadyPendingFailure> => {
    if (busy || autofill?.isAutofillSigningIn()) {
      return { success: false, userError: { error: 'ALREADY_PENDING' } };
    }
    busy = true;
    pending.set(true);
    autofill?.pauseAutofillFlow();
    try {
      return await fn();
    } catch (cause) {
      return { success: false, userError: foldClientError(cause) };
    } finally {
      autofill?.resumeAutofillFlow();
      busy = false;
      pending.set(false);
    }
  };
  return { pending: pending.asReadonly(), run };
}
