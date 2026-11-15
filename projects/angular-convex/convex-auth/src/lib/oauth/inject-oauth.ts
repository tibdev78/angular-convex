import { computed, type Signal } from '@angular/core';
import { type MutationReference, type WithInjector } from 'angular-convex';
import { resolveInjector } from '../injector';
import { injectAmbientSignInValue } from '../ambient-value';
import {
  OAUTH_ACTIONS_KEY,
  OAUTH_FLOW_ERROR_KEY,
  OAUTH_SETUP_ID,
  type OauthActions,
  type OauthCompleteResult,
  type OauthFlowError,
  type OauthProviderRefs,
  type OauthStartResult,
  type SignInOptions,
} from './oauth-client';

const NOT_REGISTERED_ERROR =
  'No OAuth setup is registered. provideConvexAuthClient() registers oauth() by default, ' +
  'so include it yourself if you set `ambientSignIns`.';

export interface InjectOauthReturn {
  /** Failure of the OAuth callback handled on this page load, or `null`. */
  flowError: Signal<OauthFlowError | null>;
}

/** React `useOauth`. Throws when `oauth()` is not registered. */
export function injectOauth(options?: WithInjector): InjectOauthReturn {
  const value = injectAmbientSignInValue<OauthFlowError | null>(OAUTH_SETUP_ID, OAUTH_FLOW_ERROR_KEY, options);
  if (value() === undefined) throw new Error(NOT_REGISTERED_ERROR);
  return { flowError: computed(() => value() ?? null) };
}

export interface OauthSignIn {
  (options: SignInOptions & { code: string }): Promise<OauthCompleteResult>;
  (options?: Omit<SignInOptions, 'code'> & { code?: undefined }): Promise<OauthStartResult>;
}

export interface InjectOauthSignInReturn {
  /** Redirects to the provider, or finishes the flow when given a `code`. */
  signIn: OauthSignIn;
}

/** React `useOauthSignIn`. Throws when `oauth()` is not registered. */
export function injectOauthSignIn(refs: OauthProviderRefs, options?: WithInjector): InjectOauthSignInReturn {
  const actions = injectAmbientSignInValue<OauthActions>(OAUTH_SETUP_ID, OAUTH_ACTIONS_KEY, {
    injector: resolveInjector(options?.injector),
  });
  if (actions() === undefined) throw new Error(NOT_REGISTERED_ERROR);
  const signIn = ((signInOptions?: SignInOptions) => actions()!.signIn(refs, signInOptions)) as OauthSignIn;
  return { signIn };
}

/** `injectSignInWithGithub(api.github)`, from `methods/github/server`. */
export function injectSignInWithGithub(
  api: { startSignInWithGithub: MutationReference; completeSignInWithGithub: MutationReference },
  options?: WithInjector,
): InjectOauthSignInReturn {
  return injectOauthSignIn(
    { providerName: 'github', startSignIn: api.startSignInWithGithub, completeSignIn: api.completeSignInWithGithub },
    options,
  );
}

/** `injectSignInWithGoogle(api.google)`, from `methods/google/server`. */
export function injectSignInWithGoogle(
  api: { startSignInWithGoogle: MutationReference; completeSignInWithGoogle: MutationReference },
  options?: WithInjector,
): InjectOauthSignInReturn {
  return injectOauthSignIn(
    { providerName: 'google', startSignIn: api.startSignInWithGoogle, completeSignIn: api.completeSignInWithGoogle },
    options,
  );
}

/** `injectSignInWithApple(api.apple)`, from `methods/apple/server`. */
export function injectSignInWithApple(
  api: { startSignInWithApple: MutationReference; completeSignInWithApple: MutationReference },
  options?: WithInjector,
): InjectOauthSignInReturn {
  return injectOauthSignIn(
    { providerName: 'apple', startSignIn: api.startSignInWithApple, completeSignIn: api.completeSignInWithApple },
    options,
  );
}
