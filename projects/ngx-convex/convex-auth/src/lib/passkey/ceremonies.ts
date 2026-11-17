/*
 * Ported from @convex-dev/auth 2.0.0 `src/methods/username-passkey/ceremonies.ts`
 * (not exported by the package). Apache-2.0 © Convex, Inc.
 */
import type { OtherError } from '../types';
import { otherError } from '../sign-in';
import type {
  WireAuthenticationResponse,
  WireCreationOptions,
  WireRegistrationResponse,
  WireRequestOptions,
} from './wire';

export type PasskeyClientError =
  | { error: 'CEREMONY_ABORTED' }
  | { error: 'PASSKEY_ALREADY_REGISTERED' }
  | { error: 'WEBAUTHN_UNSUPPORTED' }
  | OtherError;

export interface PasskeyClientFailure {
  success: false;
  userError: PasskeyClientError;
}

export type PasskeyRegistrationResult = { success: true; response: WireRegistrationResponse } | PasskeyClientFailure;
export type PasskeyAuthenticationResult = { success: true; response: WireAuthenticationResponse } | PasskeyClientFailure;

/** The WebAuthn operations the passkey flows need, with failures folded into results. */
export interface ResolvedPasskeyCeremonies {
  isSupported: () => boolean;
  register: (options: WireCreationOptions) => Promise<PasskeyRegistrationResult>;
  authenticate: (options: WireRequestOptions) => Promise<PasskeyAuthenticationResult>;
  isAutofillAvailable: () => Promise<boolean>;
  authenticateWithAutofill: (options: WireRequestOptions, signal: AbortSignal) => Promise<PasskeyAuthenticationResult>;
  onResume: (listener: () => void) => () => void;
}

export interface PasskeyRegistrationResponse {
  id: string;
  rawId: string;
  response: { clientDataJSON: string; attestationObject: string; transports?: string[] | null };
  type: 'public-key';
}

export interface PasskeyAuthenticationResponse {
  id: string;
  rawId: string;
  response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string | null };
  type: 'public-key';
}

/** Custom WebAuthn implementation (e.g. a native bridge), React `PasskeyCeremonies`. */
export interface PasskeyCeremonies {
  isSupported: () => boolean;
  register: (
    options: WireCreationOptions,
  ) => Promise<{ success: true; response: PasskeyRegistrationResponse } | PasskeyClientFailure>;
  authenticate: (
    options: WireRequestOptions,
  ) => Promise<{ success: true; response: PasskeyAuthenticationResponse } | PasskeyClientFailure>;
  autofill?: {
    isAvailable: () => Promise<boolean>;
    authenticate: (
      options: WireRequestOptions,
      signal: AbortSignal,
    ) => Promise<{ success: true; response: PasskeyAuthenticationResponse } | PasskeyClientFailure>;
    onResume?: (listener: () => void) => () => void;
  };
}

function isDOMException(cause: unknown): cause is DOMException {
  return typeof DOMException !== 'undefined' && cause instanceof DOMException;
}

/** `NotAllowedError` / `AbortError` mean the user (or another ceremony) ended it. */
export function foldClientError(cause: unknown): PasskeyClientError {
  if (cause instanceof Error || isDOMException(cause)) {
    if (cause.name === 'NotAllowedError' || cause.name === 'AbortError') return { error: 'CEREMONY_ABORTED' };
  }
  return otherError(cause);
}

export function pruneRegistrationResponse(response: PasskeyRegistrationResponse): WireRegistrationResponse {
  return {
    id: response.id,
    rawId: response.rawId,
    response: {
      clientDataJSON: response.response.clientDataJSON,
      attestationObject: response.response.attestationObject,
      ...(response.response.transports != null ? { transports: response.response.transports } : {}),
    },
    clientExtensionResults: {},
    type: response.type,
  };
}

export function pruneAuthenticationResponse(response: PasskeyAuthenticationResponse): WireAuthenticationResponse {
  return {
    id: response.id,
    rawId: response.rawId,
    response: {
      clientDataJSON: response.response.clientDataJSON,
      authenticatorData: response.response.authenticatorData,
      signature: response.response.signature,
      ...(response.response.userHandle != null ? { userHandle: response.response.userHandle } : {}),
    },
    clientExtensionResults: {},
    type: response.type,
  };
}

/** Wraps custom ceremonies so that every failure becomes a result. */
export function resolveCeremonies(ceremonies: PasskeyCeremonies): ResolvedPasskeyCeremonies {
  const { autofill } = ceremonies;
  const authenticated = (
    result: { success: true; response: PasskeyAuthenticationResponse } | PasskeyClientFailure,
  ): PasskeyAuthenticationResult =>
    result.success ? { success: true, response: pruneAuthenticationResponse(result.response) } : result;
  const failed = (cause: unknown): PasskeyClientFailure => ({ success: false, userError: foldClientError(cause) });
  return {
    isSupported: () => {
      try {
        return ceremonies.isSupported();
      } catch {
        return false;
      }
    },
    register: async (options) => {
      try {
        const result = await ceremonies.register(options);
        return result.success ? { success: true, response: pruneRegistrationResponse(result.response) } : result;
      } catch (cause) {
        return failed(cause);
      }
    },
    authenticate: async (options) => {
      try {
        return authenticated(await ceremonies.authenticate(options));
      } catch (cause) {
        return failed(cause);
      }
    },
    isAutofillAvailable: async () => {
      try {
        return (await autofill?.isAvailable()) ?? false;
      } catch {
        return false;
      }
    },
    authenticateWithAutofill: async (options, signal) => {
      if (autofill === undefined) return { success: false, userError: { error: 'WEBAUTHN_UNSUPPORTED' } };
      try {
        return authenticated(await autofill.authenticate(options, signal));
      } catch (cause) {
        return failed(cause);
      }
    },
    onResume: autofill?.onResume ?? (() => () => undefined),
  };
}
