/*
 * Angular port of @convex-dev/auth 2.0.0 `src/methods/email-password/react.tsx`
 * (flows that start with an e-mail, the browser secret kept in this browser).
 * Apache-2.0 © Convex, Inc.
 */
import { CONVEX_CLIENT, type ReturnOf, type WithInjector } from 'ngx-convex';
import { resolveInjector } from '../injector';
import { createPending, createUserError } from '../pending';
import { injectConvexAuthContext } from '../provide-convex-auth-client';
import { authClientStorage, type AuthMutationReference, type UnexpectedFailure, type UserErrorOf } from '../types';
import {
  EMAIL_PASSWORD_SECRET_STORAGE_KEYS,
  foldError,
  type EmailLinkFlow,
  type Tracked,
  type WithoutSecret,
} from './shared';

/** Runs `mutation`; on success keeps `browserSecret` and returns the rest. */
function secretStartingFlow<Args, Result>(
  options: WithInjector | undefined,
  mutation: AuthMutationReference,
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
        const result = (await convex.mutation(mutation, args)) as {
          success: boolean;
          browserSecret?: string;
        };
        if (result.success) {
          const { browserSecret, ...rest } = result;
          // Without it the link cannot be completed in this browser: fail now, not on the link.
          if (browserSecret === undefined) throw new Error(`${flow} succeeded without a browserSecret.`);
          await authClientStorage(client).set(EMAIL_PASSWORD_SECRET_STORAGE_KEYS[flow], browserSecret);
          return record(rest as Result);
        }
        return record(result as Result);
      } catch (cause) {
        return record(foldError(cause) as Result);
      }
    });
  return { run, pending, userError };
}

export type SignUpWithEmailPasswordResult<Api extends { signUpWithEmailPassword: AuthMutationReference }> =
  | WithoutSecret<ReturnOf<Api['signUpWithEmailPassword']>>
  | UnexpectedFailure;

/** React `useSignUpWithEmailPassword`: sends the confirmation e-mail. */
export function injectSignUpWithEmailPassword<Api extends { signUpWithEmailPassword: AuthMutationReference }>(
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

export type StartPasswordRecoveryResult<Api extends { startPasswordRecovery: AuthMutationReference }> =
  | WithoutSecret<ReturnOf<Api['startPasswordRecovery']>>
  | UnexpectedFailure;

/** React `useStartPasswordRecovery`: sends the recovery e-mail. */
export function injectStartPasswordRecovery<Api extends { startPasswordRecovery: AuthMutationReference }>(
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

export type StartChangeEmailResult<Api extends { startChangeEmail: AuthMutationReference }> =
  | WithoutSecret<ReturnOf<Api['startChangeEmail']>>
  | UnexpectedFailure;

/** React `useStartChangeEmail`: sends the confirmation to the new address. */
export function injectStartChangeEmail<Api extends { startChangeEmail: AuthMutationReference }>(
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
