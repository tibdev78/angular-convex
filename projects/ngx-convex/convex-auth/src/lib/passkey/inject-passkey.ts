/*
 * Angular port of @convex-dev/auth 2.0.0 `src/methods/username-passkey/hooks.tsx`,
 * `react.tsx`, `react-custom.tsx` and `management/react.tsx`.
 * Apache-2.0 © Convex, Inc.
 */
import { computed, DestroyRef, InjectionToken, signal, type Provider, type Signal } from '@angular/core';
import { CONVEX_CLIENT, CONVEX_CONFIG, type WithInjector } from 'ngx-convex';
import { resolveInjector } from '../injector';
import { injectConvexAuthContext } from '../provide-convex-auth-client';
import { runSignIn } from '../sign-in';
import { browserCeremonies } from './browser-ceremonies';
import { resolveCeremonies, type PasskeyCeremonies, type PasskeyClientError, type ResolvedPasskeyCeremonies } from './ceremonies';
import {
  createPasskeyCeremonySlot,
  startPasskeyAutofill,
  type AlreadyPendingError,
  type PasskeyAutofillStatus,
} from './autofill';
import {
  runAddPasskeyFlow,
  runRemovePasskeyFlow,
  runSignInOrSignUpFlow,
  type AddPasskeyApi,
  type PasskeyManagementResult,
  type PasskeyMutationApi,
  type RemovePasskeyApi,
  type SignInFlowResult,
  type UsernamePasskeyApi,
} from './flows';
import type { WireRequestOptions } from './wire';

/** WebAuthn implementation used by the passkey inject functions. Defaults to the browser one. */
export const PASSKEY_CEREMONIES = new InjectionToken<ResolvedPasskeyCeremonies>('ngx-convex/convex-auth: passkey ceremonies', {
  providedIn: 'root',
  factory: () => browserCeremonies,
});

/** Replaces WebAuthn for every passkey inject function below this injector (native bridge, tests). */
export function providePasskeyCeremonies(ceremonies: PasskeyCeremonies): Provider {
  return { provide: PASSKEY_CEREMONIES, useValue: resolveCeremonies(ceremonies) };
}

export interface PasskeyOptions extends WithInjector {
  /** Overrides `PASSKEY_CEREMONIES` for this call. */
  ceremonies?: ResolvedPasskeyCeremonies;
}

export interface SignInWithUsernamePasskeyOptions extends PasskeyOptions {
  /** Set `false` to keep the autofill request off. Defaults to `true` (never on the server). */
  autofill?: boolean;
}

/** Error of a failed autofill assertion, as returned by the server. */
export type UsernamePasskeyAutofillError = unknown;

export type SignInWithUsernamePasskeyResult =
  | SignInFlowResult
  | { status: 'error'; userError: PasskeyClientError | AlreadyPendingError };

export interface SignInWithUsernamePasskey {
  /** Identifier-first flow: signs in, or creates the account when the username is new. */
  signIn: (args: { username: string }) => Promise<SignInWithUsernamePasskeyResult>;
  /** `true` while a `signIn` call runs or the server verifies an autofill assertion. */
  pending: Signal<boolean>;
  autofill: {
    /** Whether the platform offers passkeys in autocompletion; `null` while detecting. */
    available: Signal<boolean | null>;
    status: Signal<PasskeyAutofillStatus>;
    lastError: Signal<UsernamePasskeyAutofillError | PasskeyClientError | null>;
  };
}

function resolveContext(options: PasskeyOptions | undefined) {
  const injector = resolveInjector(options?.injector);
  const auth = injectConvexAuthContext({ injector });
  const convex = injector.get(CONVEX_CLIENT);
  const mutations: PasskeyMutationApi = { mutation: (fn, args) => convex.mutation(fn, args) };
  return {
    injector,
    auth,
    convex: mutations,
    ceremonies: options?.ceremonies ?? injector.get(PASSKEY_CEREMONIES),
  };
}

/**
 * React `useSignInWithUsernamePasskey`. Starts passkey autofill (conditional
 * mediation) at once, so call it from the component that renders the username
 * field (`autocomplete="username webauthn"`); it stops when that component is destroyed.
 */
export function injectSignInWithUsernamePasskey(
  api: UsernamePasskeyApi,
  options?: SignInWithUsernamePasskeyOptions,
): SignInWithUsernamePasskey {
  const { injector, auth, convex, ceremonies } = resolveContext(options);
  const { client, signInApi } = auth;
  const ctx = { convex, api, signInApi, setSession: client.setSession, ceremonies };

  const autofillEnabled = (options?.autofill ?? true) && !injector.get(CONVEX_CONFIG).isServer;
  const autofill = autofillEnabled
    ? startPasskeyAutofill<UsernamePasskeyAutofillError>({
        ceremonies,
        start: async () => {
          const started: unknown = await convex.mutation(api.startAutofillSignInWithUsernamePasskey, {});
          if (typeof started !== 'object' || started === null || !('options' in started)) {
            throw new Error('startAutofillSignInWithUsernamePasskey did not return { options }.');
          }
          // The WebAuthn options are the server's; the ceremony validates them.
          const requestOptions: WireRequestOptions = started.options as WireRequestOptions;
          return requestOptions;
        },
        onAssertion: async (response) => {
          const result = await runSignIn(signInApi, client, api.finishSignInWithUsernamePasskey, { response });
          return result.status === 'complete' ? { success: true } : { success: false, userError: result.userError };
        },
      })
    : null;
  if (autofill !== null) injector.get(DestroyRef).onDestroy(autofill.stop);

  const slot = createPasskeyCeremonySlot(autofill);
  const signIn = async ({ username }: { username: string }): Promise<SignInWithUsernamePasskeyResult> => {
    const result = await slot.run(() => runSignInOrSignUpFlow(ctx, { username }));
    if ('status' in result) return result;
    return { status: 'error', userError: result.userError };
  };

  return {
    signIn,
    pending: computed(() => slot.pending() || autofill?.status() === 'signingIn'),
    autofill: {
      available: autofill?.available ?? signal<boolean | null>(null).asReadonly(),
      status: autofill?.status ?? signal<PasskeyAutofillStatus>('idle').asReadonly(),
      lastError: autofill?.lastError ?? signal(null).asReadonly(),
    },
  };
}

export type AddPasskeyResult = PasskeyManagementResult | { success: false; userError: AlreadyPendingError };
export type RemovePasskeyResult = AddPasskeyResult;

/** React `useAddPasskey`: re-authenticates with an existing passkey, then registers a new one. */
export function injectAddPasskey(
  api: AddPasskeyApi,
  options?: PasskeyOptions,
): { addPasskey: () => Promise<AddPasskeyResult>; pending: Signal<boolean> } {
  const { convex, ceremonies } = resolveContext(options);
  // Not a sign-in page, so no autofill to yield to.
  const slot = createPasskeyCeremonySlot(null);
  return {
    addPasskey: () => slot.run(() => runAddPasskeyFlow({ convex, api, ceremonies })),
    pending: slot.pending,
  };
}

/** React `useRemovePasskey`: re-authenticates, then removes the given passkey. */
export function injectRemovePasskey(
  api: RemovePasskeyApi,
  options?: PasskeyOptions,
): { removePasskey: (passkeyId: string) => Promise<RemovePasskeyResult>; pending: Signal<boolean> } {
  const { convex, ceremonies } = resolveContext(options);
  const slot = createPasskeyCeremonySlot(null);
  return {
    removePasskey: (passkeyId) => slot.run(() => runRemovePasskeyFlow({ convex, api, ceremonies }, { passkeyId })),
    pending: slot.pending,
  };
}

/** React `createUsernamePasskeyHooks`: the three inject functions bound to custom ceremonies. */
export function createUsernamePasskeyInjectors(custom: PasskeyCeremonies) {
  const ceremonies = resolveCeremonies(custom);
  return {
    injectSignInWithUsernamePasskey: (api: UsernamePasskeyApi, options?: SignInWithUsernamePasskeyOptions) =>
      injectSignInWithUsernamePasskey(api, { ...options, ceremonies }),
    injectAddPasskey: (api: AddPasskeyApi, options?: WithInjector) => injectAddPasskey(api, { ...options, ceremonies }),
    injectRemovePasskey: (api: RemovePasskeyApi, options?: WithInjector) =>
      injectRemovePasskey(api, { ...options, ceremonies }),
  };
}
