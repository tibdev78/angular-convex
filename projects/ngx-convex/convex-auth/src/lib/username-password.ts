/*
 * Angular port of @convex-dev/auth 2.0.0 `src/methods/username-password/react.tsx`.
 * Apache-2.0 © Convex, Inc.
 */
import type { AuthMutationReference } from './types';
import type { Signal } from '@angular/core';
import type { ReturnOf, WithInjector } from 'ngx-convex';
import { createPending, createUserError } from './pending';
import { injectConvexAuthContext } from './provide-convex-auth-client';
import type { SignInUnexpectedFailure, UserErrorOf } from './types';
import { otherError, runSignIn } from './sign-in';

export interface UsernamePasswordCredentials {
  username: string;
  password: string;
}

export interface PasswordFlow<Result> {
  pending: Signal<boolean>;
  /** `userError` of the latest result, `null` after a success. */
  userError: Signal<UserErrorOf<Result> | null>;
}

export type SignInWithUsernamePasswordResult<Api extends { signInWithUsernamePassword: AuthMutationReference }> =
  | ReturnOf<Api['signInWithUsernamePassword']>
  | SignInUnexpectedFailure;

export type SignUpWithUsernamePasswordResult<Api extends { signUpWithUsernamePassword: AuthMutationReference }> =
  | ReturnOf<Api['signUpWithUsernamePassword']>
  | SignInUnexpectedFailure;

/** React `useSignInWithUsernamePassword`. */
export function injectSignInWithUsernamePassword<Api extends { signInWithUsernamePassword: AuthMutationReference }>(
  api: Api,
  options?: WithInjector,
): PasswordFlow<SignInWithUsernamePasswordResult<Api>> & {
  signIn: (credentials: UsernamePasswordCredentials) => Promise<SignInWithUsernamePasswordResult<Api>>;
} {
  const flow = passwordFlow<SignInWithUsernamePasswordResult<Api>>(api.signInWithUsernamePassword, options);
  return { signIn: flow.run, pending: flow.pending, userError: flow.userError };
}

/** React `useSignUpWithUsernamePassword`. */
export function injectSignUpWithUsernamePassword<Api extends { signUpWithUsernamePassword: AuthMutationReference }>(
  api: Api,
  options?: WithInjector,
): PasswordFlow<SignUpWithUsernamePasswordResult<Api>> & {
  signUp: (credentials: UsernamePasswordCredentials) => Promise<SignUpWithUsernamePasswordResult<Api>>;
} {
  const flow = passwordFlow<SignUpWithUsernamePasswordResult<Api>>(api.signUpWithUsernamePassword, options);
  return { signUp: flow.run, pending: flow.pending, userError: flow.userError };
}

function passwordFlow<Result>(mutation: AuthMutationReference, options?: WithInjector) {
  const { client, signInApi } = injectConvexAuthContext(options);
  const { pending, track } = createPending();
  const { userError, record } = createUserError<UserErrorOf<Result>>();
  const run = (credentials: UsernamePasswordCredentials): Promise<Result> =>
    track(async () => {
      try {
        return record((await runSignIn(signInApi, client, mutation, { username: credentials.username, password: credentials.password })) as Result);
      } catch (cause) {
        return record({ status: 'error', userError: otherError(cause) } as Result);
      }
    });
  return { run, pending, userError };
}
