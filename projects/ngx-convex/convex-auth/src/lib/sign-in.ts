import type { DefaultFunctionArgs } from 'convex/server';
import type { AuthMutationReference, AuthSession, AuthSignInApi, OtherError, SignInEnvelope } from './types';

/** The payload of an unexpected failure (network, server bug): anything that is not a user error. */
export const otherError = (cause: unknown): OtherError => ({ error: 'OTHER_ERROR', cause });

/** Whatever installs a session: the `AuthClient` itself, or a flow context. */
export interface SessionTarget {
  setSession(session: AuthSession): Promise<void>;
}

/**
 * Runs a sign-in function and installs the session it mints. The envelope is
 * returned as is, so each method maps its `userError` to its own result.
 */
export async function runSignIn(
  signInApi: AuthSignInApi,
  target: SessionTarget,
  fn: AuthMutationReference,
  args: DefaultFunctionArgs,
): Promise<SignInEnvelope> {
  const envelope: SignInEnvelope = await signInApi.mutation(fn, args);
  if (envelope.status === 'complete') await target.setSession(envelope.tokens);
  return envelope;
}
