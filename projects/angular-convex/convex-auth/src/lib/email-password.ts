/*
 * Angular port of @convex-dev/auth 2.0.0 `src/methods/email-password/react.tsx`
 * (browser secrets, sign-up / sign-in / e-mail change / password recovery flows).
 * Apache-2.0 © Convex, Inc.
 */
import { computed, effect, signal, untracked, type Injector, type Signal } from '@angular/core';
import {
  CONVEX_CLIENT,
  injectQuery,
  type MutationReference,
  type QueryReference,
  type ReturnOf,
  type WithInjector,
} from 'angular-convex';
import { resolveInjector } from './injector';
import { createPending, createUserError } from './pending';
import { injectConvexAuthContext, type ConvexAuthContext } from './provide-convex-auth-client';
import { authClientStorage, type SignInEnvelopeLike, type SignInUnexpectedFailure, type UnexpectedFailure, type UserErrorOf } from './types';

type EmailLinkFlow = 'signUp' | 'changeEmail' | 'passwordRecovery';

/** Storage keys of the browser secrets (same as React, so both can share a session). */
export const EMAIL_PASSWORD_SECRET_STORAGE_KEYS: Readonly<Record<EmailLinkFlow, string>> = {
  signUp: '__convexAuthEmailPasswordSignUpSecret',
  changeEmail: '__convexAuthEmailPasswordChangeEmailSecret',
  passwordRecovery: '__convexAuthEmailPasswordRecoverySecret',
};

const PASSWORD_RECOVERY_LINK_ERRORS: Readonly<Record<string, true>> = { INVALID_CHALLENGE: true, INCORRECT_CODE: true };

export type OtherError = { error: 'OTHER_ERROR'; cause: unknown };
export type MissingSecretError = { error: 'MISSING_SECRET' };

/** The secret is kept by the browser, never handed to the app. */
export type WithoutSecret<Result> = Result extends { success: true } ? Omit<Result, 'browserSecret'> : Result;

export type LinkFlowState<UserError> =
  | { status: 'loading' }
  | { status: 'complete' }
  | { status: 'error'; userError: UserError };

/** The e-mail code from the link: fixed, or read from a signal (e.g. a route param). */
export type EmailCodeInput = string | (() => string);

export interface EmailCodeOptions extends WithInjector {
  emailCode: EmailCodeInput;
}

interface Tracked<Result> {
  pending: Signal<boolean>;
  /** `userError` of the latest result, `null` after a success. */
  userError: Signal<UserErrorOf<Result> | null>;
}

const readCode = (code: EmailCodeInput): string => (typeof code === 'function' ? code() : code);
const foldError = (cause: unknown): UnexpectedFailure => ({ success: false, userError: { error: 'OTHER_ERROR', cause } });
const foldSignInError = (cause: unknown): SignInUnexpectedFailure => ({
  status: 'error',
  userError: { error: 'OTHER_ERROR', cause },
});

// --- sign in -------------------------------------------------------------------

export type SignInWithEmailPasswordResult<Api extends { signInWithEmailPassword: MutationReference }> =
  | ReturnOf<Api['signInWithEmailPassword']>
  | SignInUnexpectedFailure;

/** React `useSignInWithEmailPassword`. */
export function injectSignInWithEmailPassword<Api extends { signInWithEmailPassword: MutationReference }>(
  api: Api,
  options?: WithInjector,
): Tracked<SignInWithEmailPasswordResult<Api>> & {
  signIn: (credentials: { email: string; password: string }) => Promise<SignInWithEmailPasswordResult<Api>>;
} {
  type Result = SignInWithEmailPasswordResult<Api>;
  const { client, signInApi } = injectConvexAuthContext(options);
  const { pending, track } = createPending();
  const { userError, record } = createUserError<UserErrorOf<Result>>();
  const signIn = (credentials: { email: string; password: string }): Promise<Result> =>
    track(async () => {
      try {
        const result = (await signInApi.mutation(api.signInWithEmailPassword as never, credentials as never)) as SignInEnvelopeLike;
        if (result.status === 'complete') await client.setSession(result.tokens!);
        return record(result as Result);
      } catch (cause) {
        return record(foldSignInError(cause) as Result);
      }
    });
  return { signIn, pending, userError };
}

// --- flows that start with an e-mail (secret kept in this browser) ---------------

/** Runs `mutation`; on success keeps `browserSecret` and returns the rest. */
function secretStartingFlow<Args, Result>(
  options: WithInjector | undefined,
  mutation: MutationReference,
  flow: EmailLinkFlow,
): Tracked<Result> & { run: (args: Args) => Promise<Result> } {
  const injector = resolveInjector(options?.injector);
  const { client } = injectConvexAuthContext({ injector });
  const convex = injector.get(CONVEX_CLIENT);
  const { pending, track } = createPending();
  const { userError, record } = createUserError<UserErrorOf<Result>>();
  const run = (args: Args): Promise<Result> =>
    track(async () => {
      try {
        const result = (await convex.mutation(mutation as never, args as never)) as {
          success: boolean;
          browserSecret?: string;
        };
        if (result.success) {
          const { browserSecret, ...rest } = result;
          await authClientStorage(client).set(EMAIL_PASSWORD_SECRET_STORAGE_KEYS[flow], browserSecret!);
          return record(rest as Result);
        }
        return record(result as Result);
      } catch (cause) {
        return record(foldError(cause) as Result);
      }
    });
  return { run, pending, userError };
}

export type SignUpWithEmailPasswordResult<Api extends { signUpWithEmailPassword: MutationReference }> =
  | WithoutSecret<ReturnOf<Api['signUpWithEmailPassword']>>
  | UnexpectedFailure;

/** React `useSignUpWithEmailPassword`: sends the confirmation e-mail. */
export function injectSignUpWithEmailPassword<Api extends { signUpWithEmailPassword: MutationReference }>(
  api: Api,
  options?: WithInjector,
): Tracked<SignUpWithEmailPasswordResult<Api>> & {
  signUp: (credentials: { email: string; password: string }) => Promise<SignUpWithEmailPasswordResult<Api>>;
} {
  const { run, pending, userError } = secretStartingFlow<{ email: string; password: string }, SignUpWithEmailPasswordResult<Api>>(
    options,
    api.signUpWithEmailPassword,
    'signUp',
  );
  return { signUp: run, pending, userError };
}

export type StartPasswordRecoveryResult<Api extends { startPasswordRecovery: MutationReference }> =
  | WithoutSecret<ReturnOf<Api['startPasswordRecovery']>>
  | UnexpectedFailure;

/** React `useStartPasswordRecovery`: sends the recovery e-mail. */
export function injectStartPasswordRecovery<Api extends { startPasswordRecovery: MutationReference }>(
  api: Api,
  options?: WithInjector,
): Tracked<StartPasswordRecoveryResult<Api>> & {
  startPasswordRecovery: (args: { email: string }) => Promise<StartPasswordRecoveryResult<Api>>;
} {
  const { run, pending, userError } = secretStartingFlow<{ email: string }, StartPasswordRecoveryResult<Api>>(
    options,
    api.startPasswordRecovery,
    'passwordRecovery',
  );
  return { startPasswordRecovery: run, pending, userError };
}

export type StartChangeEmailResult<Api extends { startChangeEmail: MutationReference }> =
  | WithoutSecret<ReturnOf<Api['startChangeEmail']>>
  | UnexpectedFailure;

/** React `useStartChangeEmail`: sends the confirmation to the new address. */
export function injectStartChangeEmail<Api extends { startChangeEmail: MutationReference }>(
  api: Api,
  options?: WithInjector,
): Tracked<StartChangeEmailResult<Api>> & {
  startChangeEmail: (args: { newEmail: string; currentPassword: string }) => Promise<StartChangeEmailResult<Api>>;
} {
  const { run, pending, userError } = secretStartingFlow<
    { newEmail: string; currentPassword: string },
    StartChangeEmailResult<Api>
  >(options, api.startChangeEmail, 'changeEmail');
  return { startChangeEmail: run, pending, userError };
}

// --- flows completed from the e-mail link ----------------------------------------

type LinkOutcome<UserError> = { done: true } | { done: false; userError: UserError };

/**
 * Once the session is restored, reads the secret of `flow` and runs `complete`
 * exactly once (React `useLinkFlow`).
 */
function linkFlow<UserError>(
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
      result.set({ status: 'error', userError: { error: 'OTHER_ERROR', cause } });
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

export type CompleteSignUpState<Api extends { completeSignUpWithEmailPassword: MutationReference }> = LinkFlowState<
  UserErrorOf<Extract<ReturnOf<Api['completeSignUpWithEmailPassword']>, { status: 'error' }>> | MissingSecretError | OtherError
>;

/**
 * React `useCompleteSignUpWithEmailPassword`: confirms the address from the
 * link and signs in. Starts once the stored session has been restored.
 */
export function injectCompleteSignUpWithEmailPassword<Api extends { completeSignUpWithEmailPassword: MutationReference }>(
  api: Api,
  options: EmailCodeOptions,
): Signal<CompleteSignUpState<Api>> {
  const injector = resolveInjector(options.injector);
  const context = injectConvexAuthContext({ injector });
  const { client, signInApi } = context;
  return linkFlow(injector, context, 'signUp', (browserSecret) =>
    client.withSignInPending(async () => {
      const result = (await signInApi.mutation(
        api.completeSignUpWithEmailPassword as never,
        { emailCode: untracked(() => readCode(options.emailCode)), browserSecret } as never,
      )) as SignInEnvelopeLike;
      if (result.status === 'complete') {
        await client.setSession(result.tokens!);
        return { done: true } as const;
      }
      return { done: false, userError: result.userError } as const;
    }),
  ) as Signal<CompleteSignUpState<Api>>;
}

export type CompleteChangeEmailState<Api extends { completeChangeEmail: MutationReference }> = LinkFlowState<
  UserErrorOf<Extract<ReturnOf<Api['completeChangeEmail']>, { success: false }>> | MissingSecretError | OtherError
>;

/** React `useCompleteChangeEmail`: confirms the new address from the link. */
export function injectCompleteChangeEmail<Api extends { completeChangeEmail: MutationReference }>(
  api: Api,
  options: EmailCodeOptions,
): Signal<CompleteChangeEmailState<Api>> {
  const injector = resolveInjector(options.injector);
  const context = injectConvexAuthContext({ injector });
  const convex = injector.get(CONVEX_CLIENT);
  return linkFlow(injector, context, 'changeEmail', async (browserSecret) => {
    const result = (await convex.mutation(
      api.completeChangeEmail as never,
      { emailCode: untracked(() => readCode(options.emailCode)), browserSecret } as never,
    )) as { success: boolean; userError?: unknown };
    if (result.success) return { done: true } as const;
    return { done: false, userError: result.userError } as const;
  }) as Signal<CompleteChangeEmailState<Api>>;
}

export interface PasswordRecoveryApi {
  checkPasswordRecovery: QueryReference;
  completePasswordRecovery: MutationReference;
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
        const result = (await signInApi.mutation(
          recoveryApi.completePasswordRecovery as never,
          { emailCode: readCode(options.emailCode), browserSecret: secret, newPassword } as never,
        )) as SignInEnvelopeLike & { userError?: { error: string } };
        if (result.status === 'complete') {
          await client.setSession(result.tokens!);
          await authClientStorage(client).remove(EMAIL_PASSWORD_SECRET_STORAGE_KEYS.passwordRecovery);
          outcome.set({ status: 'complete' });
        } else if (result.userError && result.userError.error in PASSWORD_RECOVERY_LINK_ERRORS) {
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
