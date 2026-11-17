/*
 * Angular port of @convex-dev/auth 2.0.0 `src/methods/email-password/react.tsx`
 * (`useLinkFlow`: completing a flow from the e-mail link).
 * Apache-2.0 © Convex, Inc.
 */
import { effect, signal, untracked, type Injector, type Signal } from '@angular/core';
import type { ConvexAuthContext } from '../provide-convex-auth-client';
import { otherError } from '../sign-in';
import { authClientStorage, type OtherError } from '../types';
import {
  EMAIL_PASSWORD_SECRET_STORAGE_KEYS,
  type EmailLinkFlow,
  type LinkFlowState,
  type MissingSecretError,
} from './shared';

type LinkOutcome<UserError> = { done: true } | { done: false; userError: UserError };

/**
 * Once the session is restored, reads the secret of `flow` and runs `complete`
 * exactly once (React `useLinkFlow`).
 */
export function linkFlow<UserError>(
  injector: Injector,
  context: ConvexAuthContext,
  flow: EmailLinkFlow,
  complete: (browserSecret: string) => Promise<LinkOutcome<UserError>>,
): Signal<LinkFlowState<UserError | MissingSecretError | OtherError>> {
  const { client, state } = context;
  const result = signal<LinkFlowState<UserError | MissingSecretError | OtherError>>({ status: 'loading' });
  let started = false;
  const run = async () => {
    try {
      const browserSecret = await authClientStorage(client).get(EMAIL_PASSWORD_SECRET_STORAGE_KEYS[flow]);
      if (browserSecret === null || browserSecret === undefined) {
        result.set({ status: 'error', userError: { error: 'MISSING_SECRET' } });
        return;
      }
      const outcome = await complete(browserSecret);
      if (outcome.done) {
        await authClientStorage(client).remove(EMAIL_PASSWORD_SECRET_STORAGE_KEYS[flow]);
        result.set({ status: 'complete' });
      } else {
        result.set({ status: 'error', userError: outcome.userError });
      }
    } catch (cause) {
      result.set({ status: 'error', userError: otherError(cause) });
    }
  };
  effect(
    () => {
      if (state().isLoading || started) return;
      started = true;
      untracked(() => void run());
    },
    { injector },
  );
  return result.asReadonly();
}
