/*
 * Ported from @convex-dev/auth 2.0.0 `src/methods/username-passkey/flows.ts`
 * and `management/flows.ts`. Apache-2.0 © Convex, Inc.
 */
import type { SignInComplete } from '@convex-dev/auth';
import type { DefaultFunctionArgs } from 'convex/server';
import type { AuthMutationReference, AuthSession, AuthSignInApi, ConvexMutationApi } from '../types';
import { runSignIn } from '../sign-in';
import type {
  PasskeyClientFailure,
  ResolvedPasskeyCeremonies,
  WireCreationOptions,
  WireRequestOptions,
} from './ceremonies';

/** `api.passkey` from `methods/username-passkey/server`. */
export interface UsernamePasskeyApi {
  startSignInWithUsernamePasskey: AuthMutationReference;
  startAutofillSignInWithUsernamePasskey: AuthMutationReference;
  finishSignInWithUsernamePasskey: AuthMutationReference;
  finishSignUpWithUsernamePasskey: AuthMutationReference;
}

export interface AddPasskeyApi {
  startAddPasskey: AuthMutationReference;
  verifyAddPasskey: AuthMutationReference;
  finishAddPasskey: AuthMutationReference;
}

export interface RemovePasskeyApi {
  startRemovePasskey: AuthMutationReference;
  finishRemovePasskey: AuthMutationReference;
}

/** Plain mutations (WebSocket client). */
export type PasskeyMutationApi = ConvexMutationApi;

export interface SignInFlowContext {
  convex: PasskeyMutationApi;
  api: UsernamePasskeyApi;
  signInApi: AuthSignInApi;
  setSession: (session: AuthSession) => Promise<void>;
  ceremonies: ResolvedPasskeyCeremonies;
}

type StartResult =
  | { success: true; step: 'register'; options: WireCreationOptions }
  | { success: true; step: 'authenticate'; options: WireRequestOptions }
  | { success: false; userError: { error: string } };

/** Completed sign-in (`flow` tells whether an account was created) or an error. */
export type SignInFlowResult =
  | (SignInComplete & { flow: 'signUp' | 'signIn' })
  | { status: 'error'; userError: { error: string; cause?: unknown } };

/** Sign-in functions run on `signInApi`, the others on `convex`: same call shape. */
const call = <T>(client: ConvexMutationApi, fn: AuthMutationReference, args: DefaultFunctionArgs): Promise<T> =>
  client.mutation(fn, args);

/** Registers a new account or signs in to an existing one, by username. */
export async function runSignInOrSignUpFlow(
  ctx: SignInFlowContext,
  { username }: { username: string },
): Promise<SignInFlowResult> {
  const { convex, api, signInApi, ceremonies } = ctx;
  if (!ceremonies.isSupported()) return { status: 'error', userError: { error: 'WEBAUTHN_UNSUPPORTED' } };
  const start = await call<StartResult>(convex, api.startSignInWithUsernamePasskey, { username });
  if (!start.success) return { status: 'error', userError: start.userError };
  if (start.step === 'register') {
    const ceremony = await ceremonies.register(start.options);
    if (!ceremony.success) return { status: 'error', userError: ceremony.userError };
    const result = await runSignIn(signInApi, ctx, api.finishSignUpWithUsernamePasskey, {
      username,
      response: ceremony.response,
    });
    if (result.status !== 'complete') return result as SignInFlowResult;
    return { ...result, flow: 'signUp' };
  }
  const ceremony = await ceremonies.authenticate(start.options);
  if (!ceremony.success) return { status: 'error', userError: ceremony.userError };
  const result = await runSignIn(signInApi, ctx, api.finishSignInWithUsernamePasskey, {
    response: ceremony.response,
  });
  if (result.status !== 'complete') return result as SignInFlowResult;
  return { ...result, flow: 'signIn' };
}

export interface ManagementFlowContext<Api> {
  convex: PasskeyMutationApi;
  api: Api;
  ceremonies: ResolvedPasskeyCeremonies;
}

type Step<Options> = { success: true; options: Options } | { success: false; userError: unknown };

/** Server result of the last step, or the first failure. */
export type PasskeyManagementResult = { success: true; [key: string]: unknown } | { success: false; userError: unknown } | PasskeyClientFailure;

/** Re-authenticates with an existing passkey, then registers a new one. */
export async function runAddPasskeyFlow(ctx: ManagementFlowContext<AddPasskeyApi>): Promise<PasskeyManagementResult> {
  const { convex, api, ceremonies } = ctx;
  if (!ceremonies.isSupported()) return { success: false, userError: { error: 'WEBAUTHN_UNSUPPORTED' } };
  const start = await call<Step<WireRequestOptions>>(convex, api.startAddPasskey, {});
  if (!start.success) return start;
  const assertion = await ceremonies.authenticate(start.options);
  if (!assertion.success) return assertion;
  const verified = await call<Step<WireCreationOptions>>(convex, api.verifyAddPasskey, { response: assertion.response });
  if (!verified.success) return verified;
  const registration = await ceremonies.register(verified.options);
  if (!registration.success) return registration;
  return await call<PasskeyManagementResult>(convex, api.finishAddPasskey, { response: registration.response });
}

/** Re-authenticates, then removes the passkey `passkeyId`. */
export async function runRemovePasskeyFlow(
  ctx: ManagementFlowContext<RemovePasskeyApi>,
  { passkeyId }: { passkeyId: string },
): Promise<PasskeyManagementResult> {
  const { convex, api, ceremonies } = ctx;
  if (!ceremonies.isSupported()) return { success: false, userError: { error: 'WEBAUTHN_UNSUPPORTED' } };
  const start = await call<Step<WireRequestOptions>>(convex, api.startRemovePasskey, { passkeyId });
  if (!start.success) return start;
  const assertion = await ceremonies.authenticate(start.options);
  if (!assertion.success) return assertion;
  return await call<PasskeyManagementResult>(convex, api.finishRemovePasskey, {
    passkeyId,
    response: assertion.response,
  });
}
