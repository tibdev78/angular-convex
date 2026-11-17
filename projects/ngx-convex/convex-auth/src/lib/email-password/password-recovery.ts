/*
 * Angular port of @convex-dev/auth 2.0.0 `src/methods/email-password/react.tsx`
 * (password recovery completed from the link).
 * Apache-2.0 © Convex, Inc.
 */
import { computed, effect, signal, untracked, type Signal } from '@angular/core';
import { injectQuery, type QueryReference, type ReturnOf } from 'ngx-convex';
import { resolveInjector } from '../injector';
import { createPending } from '../pending';
import { injectConvexAuthContext } from '../provide-convex-auth-client';
import { runSignIn } from '../sign-in';
import { authClientStorage, type AuthMutationReference, type SignInUnexpectedFailure, type UserErrorOf } from '../types';
import {
  EMAIL_PASSWORD_SECRET_STORAGE_KEYS,
  foldSignInError,
  readCode,
  type EmailCodeOptions,
  type MissingSecretError,
} from './shared';

const PASSWORD_RECOVERY_LINK_ERRORS: Readonly<Record<string, true>> = { INVALID_CHALLENGE: true, INCORRECT_CODE: true };

/** The link itself is dead (`INVALID_CHALLENGE`, `INCORRECT_CODE`). */
const isRecoveryLinkError = (userError: unknown): boolean =>
  typeof userError === 'object' &&
  userError !== null &&
  'error' in userError &&
  typeof userError.error === 'string' &&
  userError.error in PASSWORD_RECOVERY_LINK_ERRORS;

export interface PasswordRecoveryApi {
  checkPasswordRecovery: QueryReference;
  completePasswordRecovery: AuthMutationReference;
}

export type CompletePasswordRecoveryResult<Api extends PasswordRecoveryApi> =
  | ReturnOf<Api['completePasswordRecovery']>
  | SignInUnexpectedFailure;

export type PasswordRecoveryLinkError<Api extends PasswordRecoveryApi> = UserErrorOf<
  Extract<ReturnOf<Api['checkPasswordRecovery']>, { success: false }>
>;

export type CompletePasswordRecoveryState<Api extends PasswordRecoveryApi> =
  | { status: 'loading' }
  | {
      status: 'ready';
      completePasswordRecovery: (args: { newPassword: string }) => Promise<CompletePasswordRecoveryResult<Api>>;
      pending: boolean;
    }
  | { status: 'complete' }
  | { status: 'error'; userError: PasswordRecoveryLinkError<Api> | MissingSecretError };

/**
 * React `useCompletePasswordRecovery`: checks the link (live query), then lets
 * the user choose a new password; signs in on success.
 */
export function injectCompletePasswordRecovery<Api extends PasswordRecoveryApi>(
  recoveryApi: Api,
  options: EmailCodeOptions,
): Signal<CompletePasswordRecoveryState<Api>> {
  type State = CompletePasswordRecoveryState<Api>;
  type Result = CompletePasswordRecoveryResult<Api>;
  const injector = resolveInjector(options.injector);
  const { client, signInApi, state } = injectConvexAuthContext({ injector });
  const { pending, track } = createPending();
  const browserSecret = signal<string | null | undefined>(undefined);
  const outcome = signal<Extract<State, { status: 'complete' | 'error' }> | undefined>(undefined);

  const isLoading = computed(() => state().isLoading);
  effect(
    () => {
      if (isLoading()) return;
      untracked(() => {
        void (async () => {
          const secret = await authClientStorage(client).get(EMAIL_PASSWORD_SECRET_STORAGE_KEYS.passwordRecovery);
          browserSecret.set(secret ?? null);
        })();
      });
    },
    { injector },
  );

  const check = injectQuery(
    recoveryApi.checkPasswordRecovery,
    () => {
      const secret = browserSecret();
      return typeof secret === 'string' ? { emailCode: readCode(options.emailCode), browserSecret: secret } : 'skip';
    },
    { injector },
  );

  const completePasswordRecovery = ({ newPassword }: { newPassword: string }): Promise<Result> =>
    track(async () => {
      const secret = browserSecret();
      if (typeof secret !== 'string') {
        throw new Error('completePasswordRecovery was called before the flow was ready');
      }
      try {
        const result = await runSignIn(signInApi, client, recoveryApi.completePasswordRecovery, {
          emailCode: readCode(options.emailCode),
          browserSecret: secret,
          newPassword,
        });
        if (result.status === 'complete') {
          await authClientStorage(client).remove(EMAIL_PASSWORD_SECRET_STORAGE_KEYS.passwordRecovery);
          outcome.set({ status: 'complete' });
        } else if (isRecoveryLinkError(result.userError)) {
          // The link itself is dead: retrying with another password cannot help.
          outcome.set({ status: 'error', userError: result.userError as PasswordRecoveryLinkError<Api> });
        }
        return result as Result;
      } catch (cause) {
        return foldSignInError(cause) as Result;
      }
    });

  return computed((): State => {
    const done = outcome();
    if (done !== undefined) return done;
    const secret = browserSecret();
    if (secret === null) return { status: 'error', userError: { error: 'MISSING_SECRET' } };
    const checked = check() as { success: boolean; userError?: unknown } | undefined;
    if (secret === undefined || checked === undefined) return { status: 'loading' };
    if (!checked.success && !pending()) {
      return { status: 'error', userError: checked.userError as PasswordRecoveryLinkError<Api> };
    }
    return { status: 'ready', completePasswordRecovery, pending: pending() };
  });
}
