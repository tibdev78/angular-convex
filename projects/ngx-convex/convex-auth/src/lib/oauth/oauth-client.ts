/*
 * Ported from @convex-dev/auth 2.0.0 `src/methods/oauth/client.ts`.
 * The package only exposes `oauth()` through `@convex-dev/auth/methods/oauth/react`,
 * which imports React; this is the same ambient sign-in without React.
 * Apache-2.0 © Convex, Inc.
 */
import { getFunctionName, makeFunctionReference } from 'convex/server';
import type { MutationReference } from 'ngx-convex';
import { retryOnNetworkError } from '../retry';
import type { AmbientSignInClient, SignInEnvelopeLike } from '../types';
import { OAUTH_CODE_PARAM, OAUTH_ERROR_PARAM } from './oauth-params';

/** The two mutations a provider exports (`startSignInWith…`, `completeSignInWith…`). */
export interface OauthProviderApi {
  startSignIn: MutationReference;
  completeSignIn: MutationReference;
}

export type OauthProviderRefs = { providerName: string } & OauthProviderApi;

/** Why the OAuth flow of this page load failed. */
export type OauthFlowError =
  | { error: 'ACCESS_DENIED' }
  | { error: 'EXPIRED' }
  | { error: 'INVALID_FLOW' }
  | { error: 'OTHER_ERROR'; cause: unknown };

export type OauthStartResult =
  | { status: 'redirect'; redirect: URL }
  | { status: 'error'; userError: { error: 'OTHER_ERROR'; cause: unknown } };

export type OauthCompleteResult = { status: 'complete' } | { status: 'error'; userError: OauthFlowError };

export interface SignInOptions {
  /** Where the provider sends the user back. Defaults to the current URL. */
  redirectTo?: string;
  /** Finish a flow with a code obtained elsewhere (no redirect). */
  code?: string;
}

export interface OauthActions {
  signIn: (refs: OauthProviderRefs, options?: SignInOptions) => Promise<OauthStartResult | OauthCompleteResult>;
}

export const OAUTH_SETUP_ID = 'oauth';
export const OAUTH_ACTIONS_KEY = 'actions';
export const OAUTH_FLOW_ERROR_KEY = 'flowError';

const OAUTH_FLOW_STORAGE_KEY = 'flow';

interface PendingFlow {
  providerName: string;
  state: string;
  completeSignIn: string;
}

type SignInStorage = Parameters<AmbientSignInClient['setup']>[0]['storage'];

function callbackFlowError(param: string): OauthFlowError {
  switch (param) {
    case 'access_denied':
      return { error: 'ACCESS_DENIED' };
    case 'expired':
      return { error: 'EXPIRED' };
    default:
      return { error: 'OTHER_ERROR', cause: param };
  }
}

function currentHref(): string | null {
  if (typeof window === 'undefined' || window.location === undefined) return null;
  return window.location.href;
}

async function takePendingFlow(storage: SignInStorage): Promise<PendingFlow | null> {
  const raw = await storage.get(OAUTH_FLOW_STORAGE_KEY);
  await storage.remove(OAUTH_FLOW_STORAGE_KEY);
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof PendingFlow, unknown>>;
    if (
      typeof parsed.providerName !== 'string' ||
      typeof parsed.state !== 'string' ||
      typeof parsed.completeSignIn !== 'string'
    ) {
      return null;
    }
    return { providerName: parsed.providerName, state: parsed.state, completeSignIn: parsed.completeSignIn };
  } catch {
    return null;
  }
}

async function dropPendingFlow(storage: SignInStorage): Promise<void> {
  try {
    await storage.remove(OAUTH_FLOW_STORAGE_KEY);
  } catch {
    // The flow was already over.
  }
}

/**
 * The OAuth ambient sign-in: redeems `?convexAuthCode=` on page load and
 * publishes `signIn` / `flowError` for {@link injectOauth} and
 * {@link injectOauthSignIn}. Registered by default by `provideConvexAuthClient`.
 */
export function oauth(): AmbientSignInClient {
  const setup: AmbientSignInClient['setup'] = ({ client, values, storage, signInApi, convex, replaceUrl }) => {
    const setFlowError = (flowError: OauthFlowError | null): void => values.set(OAUTH_FLOW_ERROR_KEY, flowError);

    const redeem = async (code: string): Promise<OauthCompleteResult> => {
      try {
        const pending = await takePendingFlow(storage);
        if (pending === null) return { status: 'error', userError: { error: 'INVALID_FLOW' } };
        const completeSignIn = makeFunctionReference<'mutation'>(pending.completeSignIn);
        const result = (await retryOnNetworkError(() =>
          signInApi.mutation(completeSignIn as never, { code, state: pending.state } as never),
        )) as SignInEnvelopeLike;
        // Unknown, already redeemed, expired and mismatched state all land here.
        if (result.status === 'error') return { status: 'error', userError: { error: 'EXPIRED' } };
        await client.setSession(result.tokens!);
        return { status: 'complete' };
      } catch (error) {
        return { status: 'error', userError: { error: 'OTHER_ERROR', cause: error } };
      }
    };

    const handleCallback = (): void => {
      const href = currentHref();
      if (href === null) return;
      const url = new URL(href);
      const code = url.searchParams.get(OAUTH_CODE_PARAM);
      const errorParam = url.searchParams.get(OAUTH_ERROR_PARAM);
      if (code === null && errorParam === null) return;
      url.searchParams.delete(OAUTH_CODE_PARAM);
      url.searchParams.delete(OAUTH_ERROR_PARAM);
      replaceUrl(url.toString());
      if (errorParam !== null) {
        void dropPendingFlow(storage);
        setFlowError(callbackFlowError(errorParam));
        return;
      }
      if (code === null) return;
      // Published before the pending sign-in ends, so the state never reads
      // "signed out, done loading" without the error that explains it.
      void client.withSignInPending(async () => {
        const result = await redeem(code);
        if (result.status === 'error') setFlowError(result.userError);
      });
    };

    const signIn: OauthActions['signIn'] = async (refs, options) => {
      const code = options?.code;
      if (code !== undefined) {
        setFlowError(null);
        return await client.withSignInPending(() => redeem(code));
      }
      const href = currentHref();
      const redirectTo = options?.redirectTo ?? href;
      if (redirectTo === null) {
        throw new Error('`redirectTo` is required where there is no current page URL.');
      }
      setFlowError(null);
      try {
        const { redirect, state } = (await convex.mutation(refs.startSignIn as never, { redirectTo } as never)) as {
          redirect: string;
          state: string;
        };
        await storage.set(
          OAUTH_FLOW_STORAGE_KEY,
          JSON.stringify({
            providerName: refs.providerName,
            state,
            completeSignIn: getFunctionName(refs.completeSignIn as never),
          } satisfies PendingFlow),
        );
        const url = new URL(redirect);
        if (href !== null) window.location.href = url.toString();
        return { status: 'redirect', redirect: url };
      } catch (cause) {
        return { status: 'error', userError: { error: 'OTHER_ERROR', cause } };
      }
    };

    values.set(OAUTH_ACTIONS_KEY, { signIn } satisfies OauthActions);
    setFlowError(null);
    return { onInit: handleCallback };
  };
  return { id: OAUTH_SETUP_ID, setup };
}
