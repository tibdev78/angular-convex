/*
 * Public API of ngx-convex/convex-auth — Convex Auth 2.0 for Angular,
 * built on `@convex-dev/auth/browser` (no React). Every name is listed: the
 * storage keys and setup ids shared between modules stay internal.
 */
export type {
  AmbientSignInClient,
  AmbientSignInContext,
  AuthMutationReference,
  AuthSession,
  AuthSignInApi,
  ConvexAuthClientApi,
  ConvexMutationApi,
  OtherError,
  SignInEnvelope,
  SignInUnexpectedFailure,
  UnexpectedFailure,
  UserErrorOf,
} from './lib/types';
export {
  CONVEX_AUTH_CONTEXT,
  CONVEX_AUTH_HTTP_CLIENT,
  injectAuthActions,
  injectAuthClient,
  injectAuthSignInApi,
  injectAuthState,
  injectAuthToken,
  injectConvexAuthContext,
  provideConvexAuthClient,
} from './lib/provide-convex-auth-client';
export type {
  ConvexAuthActions,
  ConvexAuthClientOptions,
  ConvexAuthContext,
  ConvexAuthHttpClient,
} from './lib/provide-convex-auth-client';
export { injectAmbientSignInValue } from './lib/ambient-value';
export { retryOnNetworkError } from './lib/retry';

export { OAUTH_CODE_PARAM, OAUTH_ERROR_PARAM } from './lib/oauth/oauth-params';
export { oauth } from './lib/oauth/oauth-client';
export type {
  OauthActions,
  OauthCompleteResult,
  OauthFlowError,
  OauthProviderApi,
  OauthProviderRefs,
  OauthStartResult,
  SignInOptions,
} from './lib/oauth/oauth-client';
export {
  injectOauth,
  injectOauthSignIn,
  injectSignInWithApple,
  injectSignInWithGithub,
  injectSignInWithGoogle,
} from './lib/oauth/inject-oauth';
export type { InjectOauthReturn, InjectOauthSignInReturn, OauthSignIn } from './lib/oauth/inject-oauth';

export { injectSignInWithUsernamePassword, injectSignUpWithUsernamePassword } from './lib/username-password';
export type {
  PasswordFlow,
  SignInWithUsernamePasswordResult,
  SignUpWithUsernamePasswordResult,
  UsernamePasswordCredentials,
} from './lib/username-password';
export type {
  EmailCodeInput,
  EmailCodeOptions,
  LinkFlowState,
  MissingSecretError,
  WithoutSecret,
} from './lib/email-password/shared';
export { injectSignInWithEmailPassword } from './lib/email-password/sign-in';
export type { SignInWithEmailPasswordResult } from './lib/email-password/sign-in';
export {
  injectSignUpWithEmailPassword,
  injectStartChangeEmail,
  injectStartPasswordRecovery,
} from './lib/email-password/start-flows';
export type {
  SignUpWithEmailPasswordResult,
  StartChangeEmailResult,
  StartPasswordRecoveryResult,
} from './lib/email-password/start-flows';
export { injectCompleteChangeEmail, injectCompleteSignUpWithEmailPassword } from './lib/email-password/confirm-links';
export type { CompleteChangeEmailState, CompleteSignUpState } from './lib/email-password/confirm-links';
export { injectCompletePasswordRecovery } from './lib/email-password/password-recovery';
export type {
  CompletePasswordRecoveryResult,
  CompletePasswordRecoveryState,
  PasswordRecoveryApi,
  PasswordRecoveryLinkError,
} from './lib/email-password/password-recovery';
export { injectSignInAnonymously } from './lib/anonymous';
export type { InjectSignInAnonymouslyReturn } from './lib/anonymous';

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
} from './lib/passkey/ceremonies';
export type {
  WireCreationOptions,
  WireRequestOptions,
  WireRegistrationResponse,
  WireAuthenticationResponse,
} from './lib/passkey/wire';
export type { AlreadyPendingError, AlreadyPendingFailure, PasskeyAutofillStatus } from './lib/passkey/autofill';
export type {
  UsernamePasskeyApi,
  AddPasskeyApi,
  RemovePasskeyApi,
  SignInFlowResult,
  PasskeyManagementResult,
} from './lib/passkey/flows';
export {
  createUsernamePasskeyInjectors,
  injectAddPasskey,
  injectRemovePasskey,
  injectSignInWithUsernamePasskey,
  PASSKEY_CEREMONIES,
  providePasskeyCeremonies,
} from './lib/passkey/inject-passkey';
export type {
  AddPasskeyResult,
  PasskeyOptions,
  RemovePasskeyResult,
  SignInWithUsernamePasskey,
  SignInWithUsernamePasskeyOptions,
  SignInWithUsernamePasskeyResult,
  UsernamePasskeyAutofillError,
} from './lib/passkey/inject-passkey';

// Storage helpers of the session manager, re-exported for convenience.
export {
  defaultStorage,
  InMemoryStorage,
  JWT_STORAGE_KEY,
  REFRESH_TOKEN_STORAGE_KEY,
  type TokenStorage,
  type AuthState,
} from '@convex-dev/auth/browser';
