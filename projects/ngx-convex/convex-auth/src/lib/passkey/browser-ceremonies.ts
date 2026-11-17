/*
 * Ported from @convex-dev/auth 2.0.0 `src/methods/username-passkey/client.ts`.
 * `@simplewebauthn/browser` (optional peer dependency) is loaded on first use
 * with a dynamic import, so apps without passkeys never bundle it.
 * Apache-2.0 © Convex, Inc.
 */
import {
  foldClientError,
  pruneAuthenticationResponse,
  pruneRegistrationResponse,
  type PasskeyAuthenticationResponse,
  type PasskeyAuthenticationResult,
  type PasskeyClientError,
  type PasskeyRegistrationResponse,
  type PasskeyRegistrationResult,
  type ResolvedPasskeyCeremonies,
} from './ceremonies';
import { fromBase64URL, toBase64URL } from './base64url';
import type { WireAuthenticationResponse, WireCreationOptions, WireRequestOptions } from './wire';

interface SimpleWebAuthn {
  startRegistration(args: { optionsJSON: unknown }): Promise<PasskeyRegistrationResponse>;
  startAuthentication(args: { optionsJSON: unknown }): Promise<PasskeyAuthenticationResponse>;
}

const loadSimpleWebAuthn = (): Promise<SimpleWebAuthn> =>
  import('@simplewebauthn/browser') as unknown as Promise<SimpleWebAuthn>;

export function supportsWebAuthn(): boolean {
  return typeof window !== 'undefined' && typeof PublicKeyCredential !== 'undefined' && window.isSecureContext;
}

function foldRegistrationError(cause: unknown): PasskeyClientError {
  if ((cause instanceof Error || cause instanceof DOMException) && cause.name === 'InvalidStateError') {
    return { error: 'PASSKEY_ALREADY_REGISTERED' };
  }
  return foldClientError(cause);
}

async function register(options: WireCreationOptions): Promise<PasskeyRegistrationResult> {
  if (!supportsWebAuthn()) return { success: false, userError: { error: 'WEBAUTHN_UNSUPPORTED' } };
  try {
    const { startRegistration } = await loadSimpleWebAuthn();
    const response = await startRegistration({ optionsJSON: options });
    return { success: true, response: pruneRegistrationResponse(response) };
  } catch (cause) {
    return { success: false, userError: foldRegistrationError(cause) };
  }
}

async function authenticate(options: WireRequestOptions): Promise<PasskeyAuthenticationResult> {
  if (!supportsWebAuthn()) return { success: false, userError: { error: 'WEBAUTHN_UNSUPPORTED' } };
  try {
    const { startAuthentication } = await loadSimpleWebAuthn();
    const response = await startAuthentication({ optionsJSON: options });
    return { success: true, response: pruneAuthenticationResponse(response) };
  } catch (cause) {
    return { success: false, userError: foldClientError(cause) };
  }
}

async function authenticateWithAutofill(
  options: WireRequestOptions,
  signal: AbortSignal,
): Promise<PasskeyAuthenticationResult> {
  if (!supportsWebAuthn()) return { success: false, userError: { error: 'WEBAUTHN_UNSUPPORTED' } };
  try {
    const credential = await navigator.credentials.get({
      mediation: 'conditional',
      signal,
      publicKey: {
        challenge: fromBase64URL(options.challenge),
        timeout: options.timeout,
        rpId: options.rpId,
        allowCredentials: [],
        userVerification: options.userVerification,
      },
    });
    if (credential === null) return { success: false, userError: { error: 'CEREMONY_ABORTED' } };
    return { success: true, response: assertionToJSON(credential as PublicKeyCredential) };
  } catch (cause) {
    return { success: false, userError: foldClientError(cause) };
  }
}

function assertionToJSON(credential: PublicKeyCredential): WireAuthenticationResponse {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toBase64URL(credential.rawId),
    response: {
      clientDataJSON: toBase64URL(response.clientDataJSON),
      authenticatorData: toBase64URL(response.authenticatorData),
      signature: toBase64URL(response.signature),
      ...(response.userHandle !== null ? { userHandle: toBase64URL(response.userHandle) } : {}),
    },
    clientExtensionResults: {},
    type: 'public-key',
  };
}

async function isConditionalMediationAvailable(): Promise<boolean> {
  try {
    return (
      supportsWebAuthn() &&
      typeof PublicKeyCredential.isConditionalMediationAvailable === 'function' &&
      (await PublicKeyCredential.isConditionalMediationAvailable())
    );
  } catch {
    return false;
  }
}

const WINDOW_EVENTS = ['focus', 'pageshow'] as const;
const DOCUMENT_EVENTS = ['visibilitychange', 'focusin'] as const;

/** Calls `listener` when the page may have been asleep (a stale challenge check). */
function onPageResume(listener: () => void): () => void {
  for (const event of WINDOW_EVENTS) window.addEventListener(event, listener);
  for (const event of DOCUMENT_EVENTS) document.addEventListener(event, listener);
  return () => {
    for (const event of WINDOW_EVENTS) window.removeEventListener(event, listener);
    for (const event of DOCUMENT_EVENTS) document.removeEventListener(event, listener);
  };
}

/** WebAuthn in the browser, through `@simplewebauthn/browser`. */
export const browserCeremonies: ResolvedPasskeyCeremonies = {
  isSupported: supportsWebAuthn,
  register,
  authenticate,
  isAutofillAvailable: isConditionalMediationAvailable,
  authenticateWithAutofill,
  onResume: onPageResume,
};
