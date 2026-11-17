/*
 * Angular port of @convex-dev/auth 2.0.0 `src/methods/email-password/react.tsx`
 * (sign-in with e-mail and password).
 * Apache-2.0 © Convex, Inc.
 */
import type { ReturnOf, WithInjector } from 'ngx-convex';
import { createPending, createUserError } from '../pending';
import { injectConvexAuthContext } from '../provide-convex-auth-client';
import { runSignIn } from '../sign-in';
import type { AuthMutationReference, SignInUnexpectedFailure, UserErrorOf } from '../types';
import { foldSignInError, type Tracked } from './shared';

export type SignInWithEmailPasswordResult<Api extends { signInWithEmailPassword: AuthMutationReference }> =
  | ReturnOf<Api['signInWithEmailPassword']>
  | SignInUnexpectedFailure;

/** React `useSignInWithEmailPassword`. */
export function injectSignInWithEmailPassword<Api extends { signInWithEmailPassword: AuthMutationReference }>(
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
        return record((await runSignIn(signInApi, client, api.signInWithEmailPassword, credentials)) as Result);
      } catch (cause) {
        return record(foldSignInError(cause) as Result);
      }
    });
  return { signIn, pending, userError };
}
