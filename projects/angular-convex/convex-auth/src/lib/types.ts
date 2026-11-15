import type { AuthClientConfig } from '@convex-dev/auth/browser';
import type { MutationReference, QueryReference } from 'angular-convex';

/**
 * Ambient sign-in registration, as accepted by `AuthClient`
 * (`AmbientSignInClient` is not re-exported by `@convex-dev/auth/browser`).
 */
export type AmbientSignInClient = NonNullable<AuthClientConfig['ambientSignIns']>['signIns'][number];

/** Context handed to an ambient sign-in's `setup`. */
export type AmbientSignInContext = Parameters<AmbientSignInClient['setup']>[0];

/** How sign-in functions are executed (over the WebSocket client). */
export type AuthSignInApi = AmbientSignInContext['signInApi'];

/** Session bundle accepted by `AuthClient.setSession`. */
export type AuthSession = Parameters<import('@convex-dev/auth/browser').AuthClient['setSession']>[0];

/** The three functions exported by `convex/auth.ts` (`api.auth`). */
export interface ConvexAuthClientApi {
  refreshSession: MutationReference;
  signOut: MutationReference;
  isAuthenticated: QueryReference;
}

/** `{ status: 'error', userError: { error: 'OTHER_ERROR', cause } }` — an unexpected failure. */
export interface SignInUnexpectedFailure {
  status: 'error';
  userError: { error: 'OTHER_ERROR'; cause: unknown };
}

/** `{ success: false, userError: { error: 'OTHER_ERROR', cause } }` — an unexpected failure. */
export interface UnexpectedFailure {
  success: false;
  userError: { error: 'OTHER_ERROR'; cause: unknown };
}

/** The `userError` member of an error result, if any. */
export type UserErrorOf<Result> = Result extends { userError: infer UserError } ? UserError : never;

/** Structural reading of a sign-in envelope. */
export interface SignInEnvelopeLike {
  status: 'complete' | 'error';
  tokens?: AuthSession;
  userError?: unknown;
}

/** The namespaced key/value view of the session storage (`NamespacedStorage`). */
export interface AuthClientStorage {
  get(key: string): string | Promise<string | null | undefined> | null | undefined;
  set(key: string, value: string): void | Promise<void>;
  remove(key: string): void | Promise<void>;
}

/**
 * `AuthClient.storage` exists at runtime (React's email-password hooks use it)
 * but is `@internal`, so stripped from the published typings.
 */
export function authClientStorage(client: import('@convex-dev/auth/browser').AuthClient): AuthClientStorage {
  return (client as unknown as { storage: AuthClientStorage }).storage;
}
