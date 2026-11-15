import { components, internal } from "./_generated/api";
import { env } from "./_generated/server";
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
