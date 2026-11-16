/*
 * Port of `useSignInAnonymously` from @convex-dev/auth 2.0.0
 * (`methods/anonymous/react`, shipped in the package but not exported yet).
 * Apache-2.0 © Convex, Inc.
 */
import type { Signal } from '@angular/core';
import type { MutationReference, WithInjector } from 'ngx-convex';
import { createPending } from './pending';
import { injectConvexAuthContext } from './provide-convex-auth-client';
import type { SignInEnvelopeLike } from './types';

export interface InjectSignInAnonymouslyReturn {
  /** Creates a new anonymous account and signs into it. Rejects if the mutation fails. */
  signIn: () => Promise<void>;
  pending: Signal<boolean>;
}

/**
 * Signs in with an anonymous account: `api.signInAnonymously` is the mutation
 * a custom method built with the core's `bindMethod` exports (see the demo's
 * `convex/auth.ts`). Every call makes a new account.
 */
export function injectSignInAnonymously(
  api: { signInAnonymously: MutationReference },
  options?: WithInjector,
): InjectSignInAnonymouslyReturn {
  const { client, signInApi } = injectConvexAuthContext(options);
  const { pending, track } = createPending();
  const signIn = () =>
    track(async () => {
      const result = (await signInApi.mutation(api.signInAnonymously as never, {} as never)) as SignInEnvelopeLike;
      if (result.status !== 'complete') throw new Error('Anonymous sign-in did not complete.');
      await client.setSession(result.tokens!);
    });
  return { signIn, pending };
}
