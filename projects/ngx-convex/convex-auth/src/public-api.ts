/*
 * Public API of ngx-convex/convex-auth — Convex Auth 2.0 for Angular,
 * built on `@convex-dev/auth/browser` (no React).
 */
export * from './lib/types';
export * from './lib/provide-convex-auth-client';
export * from './lib/ambient-value';
export { retryOnNetworkError } from './lib/retry';

export * from './lib/oauth/oauth-params';
export * from './lib/oauth/oauth-client';
export * from './lib/oauth/inject-oauth';

export * from './lib/username-password';
export * from './lib/email-password';
export * from './lib/anonymous';

export {
  supportsWebAuthn,
  browserCeremonies,
} from './lib/passkey/browser-ceremonies';
export type {
  PasskeyCeremonies,
  ResolvedPasskeyCeremonies,
  PasskeyClientError,
  PasskeyClientFailure,
  PasskeyRegistrationResponse,
  PasskeyAuthenticationResponse,
  WireCreationOptions,
  WireRequestOptions,
  WireRegistrationResponse,
  WireAuthenticationResponse,
} from './lib/passkey/ceremonies';
export type { AlreadyPendingError, AlreadyPendingFailure, PasskeyAutofillStatus } from './lib/passkey/autofill';
export type {
  UsernamePasskeyApi,
  AddPasskeyApi,
  RemovePasskeyApi,
  SignInFlowResult,
  PasskeyManagementResult,
} from './lib/passkey/flows';
export * from './lib/passkey/inject-passkey';

// Storage helpers of the session manager, re-exported for convenience.
export {
  defaultStorage,
  InMemoryStorage,
  JWT_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
  type TokenStorage,
  type AuthState,
} from '@convex-dev/auth/browser';
