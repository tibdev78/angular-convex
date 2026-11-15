import { v, type ObjectType, type PropertyValidators, type Validator } from "convex/values";
import type { FunctionReference, GenericMutationCtx, RegisteredMutation } from "convex/server";
import { components, internal } from "./_generated/api";
import { env } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { DEMO_IDP_CLIENT_ID, callbackUrl, pkceChallenge, randomToken, sha256Hex, siteOrigin } from "./idp";
import { setupConvexAuth } from "@convex-dev/auth/server";
import { setupUsernamePassword } from "@convex-dev/auth/methods/username-password/server";
import { setupEmailPassword } from "@convex-dev/auth/methods/email-password/server";
import { setupUsernamePasskey } from "@convex-dev/auth/methods/username-passkey/server";
import { setupGithub } from "@convex-dev/auth/methods/github/server";

/** Public origin of the Angular demo. */
const SITE_URL = env.SITE_URL ?? "http://localhost:4200";
const site = new URL(SITE_URL);

const auth = setupConvexAuth({ component: components.auth });
export const { signOut, refreshSession, isAuthenticated } = auth;

// 1. Username + password: no email, no verification.
export const { signUpWithUsernamePassword, signInWithUsernamePassword, changePassword: changeUsernamePassword } =
  setupUsernamePassword(auth, {
    component: components.authPassword,
    usernameComponent: components.authUsername,
  }).attachUserCallbacks({
    createUser: internal.users.createUserUsernamePassword,
    onSignIn: internal.users.onSignInUsernamePassword,
  });

// 2. Email + password with email verification, recovery and email change.
// Emails go to the local fake Resend component (see ./resend).
export const {
  signUpWithEmailPassword,
  completeSignUpWithEmailPassword,
  signInWithEmailPassword,
  changePassword,
  startPasswordRecovery,
  checkPasswordRecovery,
  completePasswordRecovery,
  startChangeEmail,
  completeChangeEmail,
} = setupEmailPassword(auth, {
  component: components.authEmail,
  passwordComponent: components.authPassword,
  emailSender: {
    kind: "resend",
    sendEmail: components.resend.lib.sendEmail,
    apiKey: "re_fake_demo_key",
    from: "Convex AGL <auth@convex-agl.local>",
  },
  urls: {
    signUp: `${SITE_URL}/auth/validate-email`,
    changeEmail: `${SITE_URL}/auth/confirm-email-change`,
    recovery: `${SITE_URL}/auth/reset-password`,
  },
}).attachUserCallbacks({
  createUser: internal.users.createUserEmailPassword,
  onSignIn: internal.users.onSignInEmailPassword,
});

// 3. Username + passkey (WebAuthn).
export const {
  startSignInWithUsernamePasskey,
  startAutofillSignInWithUsernamePasskey,
  finishSignUpWithUsernamePasskey,
  finishSignInWithUsernamePasskey,
  listPasskeys,
  renamePasskey,
  startAddPasskey,
  verifyAddPasskey,
  finishAddPasskey,
  startRemovePasskey,
  finishRemovePasskey,
} = setupUsernamePasskey(auth, {
  component: components.authPasskey,
  usernameComponent: components.authUsername,
  rpId: site.hostname,
  origin: site.origin,
  rpName: "Convex AGL",
}).attachUserCallbacks({
  createUser: internal.users.createUserPasskey,
  onSignIn: internal.users.onSignInPasskey,
});

// 4. GitHub OAuth. Callback: <deployment site url>/oauth/github/callback.
export const { startSignInWithGithub, completeSignInWithGithub } = setupGithub(auth, {
  component: components.authGithub,
  allowedRedirectOrigins: [site.origin],
}).attachUserCallbacks({
  createUser: internal.users.createUserGithub,
  onSignIn: internal.users.onSignInGithub,
});

// 5 and 6. Custom sign-in methods, built on the core's `bindMethod`: the API
// the bundled methods above use. Convex Auth 2.0 ships it marked @internal
// ("not public until the API for custom methods is stable"), so it is not in
// the published types; this is the shape it has at runtime.
type TokenBundle = { accessToken: string; refreshToken: string; refreshTokenExpiresAt: number; userId: string };
type ConvexAuthHelpers = {
  completeSignUp(args: { profile: Record<string, unknown>; authenticatedBy: unknown }): Promise<TokenBundle>;
  completeSignIn(args: { userId: string; profile: Record<string, unknown>; authenticatedBy: unknown }): Promise<TokenBundle>;
};
type AuthMutationBuilder = <A extends PropertyValidators, R>(fn: {
  args: A;
  returns: Validator<R, "required", string>;
  handler: (ctx: GenericMutationCtx<DataModel> & { convexAuth: ConvexAuthHelpers }, args: ObjectType<A>) => Promise<R>;
}) => RegisteredMutation<"public", ObjectType<A>, Promise<R>>;
type BindMethod = (options: {
  name: string;
  createUser: FunctionReference<"mutation", "internal">;
  onSignIn?: FunctionReference<"mutation", "internal">;
}) => { authMutation: AuthMutationBuilder };
const { bindMethod } = auth as typeof auth & { bindMethod: BindMethod };

const vTokens = v.object({ accessToken: v.string(), refreshToken: v.string(), refreshTokenExpiresAt: v.number(), userId: v.string() });
const vComplete = v.object({ status: v.literal("complete"), tokens: vTokens });

// 5. Anonymous: a new account on every sign-in, no credentials. Mirrors
// `setupAnonymous`, which @convex-dev/auth 2.0 contains but does not export.
const anonymous = bindMethod({ name: "anonymous", createUser: internal.users.createUserAnonymous });
export const signInAnonymously = anonymous.authMutation({
  args: {},
  returns: vComplete,
  handler: async (ctx) => {
    const tokens = await ctx.convexAuth.completeSignUp({ profile: {}, authenticatedBy: components.demoAuth });
    await ctx.runMutation(components.demoAuth.lib.createAccount, { provider: "anonymous", subject: tokens.userId, userId: tokens.userId });
    return { status: "complete" as const, tokens };
  },
});

// 6. Generic OAuth / OpenID Connect against the demo provider of ./idp.ts:
// the same two mutations, and the same client protocol (`?convexAuthCode=`),
// as the bundled GitHub method, so the app signs in with `injectOauthSignIn`.
const demoIdp = bindMethod({
  name: "demoIdp",
  createUser: internal.users.createUserDemoIdp,
  onSignIn: internal.users.onSignInDemoIdp,
});

export const startSignInWithDemoIdp = demoIdp.authMutation({
  args: { redirectTo: v.string() },
  returns: v.object({ redirect: v.string(), state: v.string() }),
  handler: async (ctx, { redirectTo }) => {
    // Only send codes back to the app's own origin.
    if (new URL(redirectTo).origin !== site.origin) throw new Error(`redirectTo must be on ${site.origin}`);
    const state = randomToken();
    const codeVerifier = randomToken();
    await ctx.runMutation(components.demoAuth.lib.createRequest, { stateHash: await sha256Hex(state), redirectTo, codeVerifier });
    const url = new URL(`${siteOrigin()}/idp/authorize`);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: DEMO_IDP_CLIENT_ID,
      redirect_uri: callbackUrl(),
      scope: "openid profile email",
      state,
      code_challenge: await pkceChallenge(codeVerifier),
      code_challenge_method: "S256",
    }).toString();
    return { redirect: url.toString(), state };
  },
});

export const completeSignInWithDemoIdp = demoIdp.authMutation({
  args: { code: v.string(), state: v.string() },
  returns: v.union(vComplete, v.object({ status: v.literal("error"), userError: v.object({ error: v.literal("INVALID_CODE") }) })),
  handler: async (ctx, { code, state }) => {
    const profile = await ctx.runMutation(components.demoAuth.lib.claimTicket, {
      ticketHash: await sha256Hex(code),
      stateHash: await sha256Hex(state),
    });
    // Unknown, spent, expired or another browser's state: indistinguishable on purpose.
    if (!profile) return { status: "error" as const, userError: { error: "INVALID_CODE" as const } };
    const identity = { id: profile.sub, name: profile.name, email: profile.email, emailVerified: profile.emailVerified };
    const userId = await ctx.runQuery(components.demoAuth.lib.getAccount, { provider: "demoIdp", subject: profile.sub });
    if (userId !== null) {
      return { status: "complete" as const, tokens: await ctx.convexAuth.completeSignIn({ userId, profile: identity, authenticatedBy: components.demoAuth }) };
    }
    const tokens = await ctx.convexAuth.completeSignUp({ profile: identity, authenticatedBy: components.demoAuth });
    await ctx.runMutation(components.demoAuth.lib.createAccount, { provider: "demoIdp", subject: profile.sub, userId: tokens.userId });
    return { status: "complete" as const, tokens };
  },
});
