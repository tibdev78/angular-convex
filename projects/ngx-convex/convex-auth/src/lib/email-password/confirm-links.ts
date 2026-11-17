/*
 * Angular port of @convex-dev/auth 2.0.0 `src/methods/email-password/react.tsx`
 * (sign-up and e-mail change confirmed from the link).
 * Apache-2.0 © Convex, Inc.
 */
import { untracked, type Signal } from '@angular/core';
import { CONVEX_CLIENT, type ReturnOf } from 'ngx-convex';
import { resolveInjector } from '../injector';
import { injectConvexAuthContext } from '../provide-convex-auth-client';
import { runSignIn } from '../sign-in';
import type { AuthMutationReference, OtherError, UserErrorOf } from '../types';
import { linkFlow } from './link-flow';
import { readCode, type EmailCodeOptions, type LinkFlowState, type MissingSecretError } from './shared';

export type CompleteSignUpState<Api extends { completeSignUpWithEmailPassword: AuthMutationReference }> = LinkFlowState<
  UserErrorOf<Extract<ReturnOf<Api['completeSignUpWithEmailPassword']>, { status: 'error' }>> | MissingSecretError | OtherError
>;

/**
 * React `useCompleteSignUpWithEmailPassword`: confirms the address from the
 * link and signs in. Starts once the stored session has been restored.
 */
export function injectCompleteSignUpWithEmailPassword<Api extends { completeSignUpWithEmailPassword: AuthMutationReference }>(
  api: Api,
  options: EmailCodeOptions,
): Signal<CompleteSignUpState<Api>> {
  const injector = resolveInjector(options.injector);
  const context = injectConvexAuthContext({ injector });
  const { client, signInApi } = context;
  return linkFlow(injector, context, 'signUp', (browserSecret) =>
    client.withSignInPending(async () => {
      const result = await runSignIn(signInApi, client, api.completeSignUpWithEmailPassword, {
        emailCode: untracked(() => readCode(options.emailCode)),
        browserSecret,
      });
      return result.status === 'complete'
        ? ({ done: true } as const)
        : ({ done: false, userError: result.userError } as const);
    }),
  ) as Signal<CompleteSignUpState<Api>>;
}

export type CompleteChangeEmailState<Api extends { completeChangeEmail: AuthMutationReference }> = LinkFlowState<
  UserErrorOf<Extract<ReturnOf<Api['completeChangeEmail']>, { success: false }>> | MissingSecretError | OtherError
>;

/** React `useCompleteChangeEmail`: confirms the new address from the link. */
export function injectCompleteChangeEmail<Api extends { completeChangeEmail: AuthMutationReference }>(
  api: Api,
  options: EmailCodeOptions,
): Signal<CompleteChangeEmailState<Api>> {
  const injector = resolveInjector(options.injector);
  const context = injectConvexAuthContext({ injector });
  const convex = injector.get(CONVEX_CLIENT);
  return linkFlow(injector, context, 'changeEmail', async (browserSecret) => {
    const result = (await convex.mutation(
      api.completeChangeEmail,
      { emailCode: untracked(() => readCode(options.emailCode)), browserSecret },
    )) as { success: boolean; userError?: unknown };
    if (result.success) return { done: true } as const;
    return { done: false, userError: result.userError } as const;
  }) as Signal<CompleteChangeEmailState<Api>>;
}
