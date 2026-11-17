/*
 * Angular port of @convex-dev/auth 2.0.0 `src/methods/email-password/react.tsx`
 * (what the e-mail and password flows share).
 * Apache-2.0 © Convex, Inc.
 */
import type { Signal } from '@angular/core';
import type { WithInjector } from 'ngx-convex';
import { otherError } from '../sign-in';
import type { SignInUnexpectedFailure, UnexpectedFailure, UserErrorOf } from '../types';

export type EmailLinkFlow = 'signUp' | 'changeEmail' | 'passwordRecovery';

/** Storage keys of the browser secrets (same as React, so both can share a session). */
export const EMAIL_PASSWORD_SECRET_STORAGE_KEYS: Readonly<Record<EmailLinkFlow, string>> = {
  signUp: '__convexAuthEmailPasswordSignUpSecret',
  changeEmail: '__convexAuthEmailPasswordChangeEmailSecret',
  passwordRecovery: '__convexAuthEmailPasswordRecoverySecret',
};

export type MissingSecretError = { error: 'MISSING_SECRET' };

/** The secret is kept by the browser, never handed to the app. */
export type WithoutSecret<Result> = Result extends { success: true } ? Omit<Result, 'browserSecret'> : Result;

export type LinkFlowState<UserError> =
  | { status: 'loading' }
  | { status: 'complete' }
  | { status: 'error'; userError: UserError };

/** The e-mail code from the link: fixed, or read from a signal (e.g. a route param). */
export type EmailCodeInput = string | (() => string);

export interface EmailCodeOptions extends WithInjector {
  emailCode: EmailCodeInput;
}

export interface Tracked<Result> {
  pending: Signal<boolean>;
  /** `userError` of the latest result, `null` after a success. */
  userError: Signal<UserErrorOf<Result> | null>;
}

export const readCode = (code: EmailCodeInput): string => (typeof code === 'function' ? code() : code);
export const foldError = (cause: unknown): UnexpectedFailure => ({ success: false, userError: otherError(cause) });
export const foldSignInError = (cause: unknown): SignInUnexpectedFailure => ({
  status: 'error',
  userError: otherError(cause),
});
