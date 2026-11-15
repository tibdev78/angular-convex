import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@convex-dev/auth/convex.config";
import authPassword from "@convex-dev/auth/components/password/convex.config";
import authUsername from "@convex-dev/auth/components/username/convex.config";
import authEmail from "@convex-dev/auth/components/email/convex.config";
import authPasskey from "@convex-dev/auth/components/passkey/convex.config";
import authGithub from "@convex-dev/auth/components/github/convex.config";
import resend from "./resend/convex.config";

const app = defineApp({
  env: {
    /** Public origin of the Angular app, used in emailed links and redirects. */
    SITE_URL: v.optional(v.string()),
    AUTH_GITHUB_CLIENT_ID: v.string(),
    AUTH_GITHUB_CLIENT_SECRET: v.string(),
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
app.use(resend);

export default app;
