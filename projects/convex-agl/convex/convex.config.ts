import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@convex-dev/auth/convex.config";
import authPassword from "@convex-dev/auth/components/password/convex.config";
import authUsername from "@convex-dev/auth/components/username/convex.config";
import authEmail from "@convex-dev/auth/components/email/convex.config";
import authPasskey from "@convex-dev/auth/components/passkey/convex.config";
import authGithub from "@convex-dev/auth/components/github/convex.config";
import authGoogle from "@convex-dev/auth/components/google/convex.config";
import authApple from "@convex-dev/auth/components/apple/convex.config";
import resend from "./resend/convex.config";
import demoAuth from "./demoAuth/convex.config";

const app = defineApp({
  env: {
    /** Public origin of the Angular app, used in emailed links and redirects. */
    SITE_URL: v.optional(v.string()),
    AUTH_GITHUB_CLIENT_ID: v.string(),
    AUTH_GITHUB_CLIENT_SECRET: v.string(),
    AUTH_GOOGLE_CLIENT_ID: v.string(),
    AUTH_GOOGLE_CLIENT_SECRET: v.string(),
    // Sign in with Apple needs a paid Apple Developer account. Until one is
    // set up, the four values are the string "not-configured" and the login
    // page shows the method as unavailable (see `oauthProviders` in ./auth.ts).
    AUTH_APPLE_CLIENT_ID: v.string(),
    AUTH_APPLE_TEAM_ID: v.string(),
    AUTH_APPLE_KEY_ID: v.string(),
    AUTH_APPLE_PRIVATE_KEY: v.string(),
  },
});

// The core component must be mounted as `auth`.
app.use(auth);
app.use(authPassword);
app.use(authUsername);
app.use(authEmail);
app.use(authPasskey);
app.use(authGithub, {
  httpPrefix: "/oauth/github",
  env: {
    CLIENT_ID: app.env.AUTH_GITHUB_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GITHUB_CLIENT_SECRET,
  },
});
app.use(authGoogle, {
  httpPrefix: "/oauth/google",
  env: {
    CLIENT_ID: app.env.AUTH_GOOGLE_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GOOGLE_CLIENT_SECRET,
  },
});
app.use(authApple, {
  httpPrefix: "/oauth/apple",
  env: {
    CLIENT_ID: app.env.AUTH_APPLE_CLIENT_ID,
    TEAM_ID: app.env.AUTH_APPLE_TEAM_ID,
    KEY_ID: app.env.AUTH_APPLE_KEY_ID,
    PRIVATE_KEY: app.env.AUTH_APPLE_PRIVATE_KEY,
  },
});
app.use(resend);
// Accounts for the anonymous and demo OIDC sign-in methods (see ./auth.ts).
app.use(demoAuth);

export default app;
