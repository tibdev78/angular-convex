import { v } from "convex/values";
import { vGithubProfile } from "@convex-dev/auth/methods/github/server";
import { vGoogleProfile } from "@convex-dev/auth/methods/google/server";
import { vAppleProfile } from "@convex-dev/auth/methods/apple/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { components } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib";

// Convex Auth calls these internal mutations (see ./auth.ts). The arguments
// must be declared exactly as `{ method: { name, profile } }` (+ `userId` for
// `onSignIn`), with the profile shape of the sign-in method.

const noProfile = v.object({});
const method = <N extends string, P extends ReturnType<typeof v.object>>(name: N, profile: P) =>
  v.object({ name: v.literal(name), profile });

async function touch(ctx: MutationCtx, userId: Id<"users">) {
  await ctx.db.patch(userId, { lastSignInAt: Date.now() });
  return null;
}

export const createUserUsernamePassword = internalMutation({
  args: { method: method("usernamePassword", noProfile) },
  returns: v.id("users"),
  handler: (ctx) => ctx.db.insert("users", { method: "usernamePassword" }),
});
export const onSignInUsernamePassword = internalMutation({
  args: { method: method("usernamePassword", noProfile), userId: v.id("users") },
  returns: v.null(),
  handler: (ctx, { userId }) => touch(ctx, userId),
});

export const createUserEmailPassword = internalMutation({
  args: { method: method("emailPassword", noProfile) },
  returns: v.id("users"),
  handler: (ctx) => ctx.db.insert("users", { name: "Email user", method: "emailPassword" }),
});
export const onSignInEmailPassword = internalMutation({
  args: { method: method("emailPassword", noProfile), userId: v.id("users") },
  returns: v.null(),
  handler: (ctx, { userId }) => touch(ctx, userId),
});

export const createUserPasskey = internalMutation({
  args: { method: method("usernamePasskey", noProfile) },
  returns: v.id("users"),
  handler: (ctx) => ctx.db.insert("users", { method: "usernamePasskey" }),
});
export const onSignInPasskey = internalMutation({
  args: { method: method("usernamePasskey", noProfile), userId: v.id("users") },
  returns: v.null(),
  handler: (ctx, { userId }) => touch(ctx, userId),
});

export const createUserGithub = internalMutation({
  args: { method: method("github", vGithubProfile) },
  returns: v.id("users"),
  handler: (ctx, { method: { profile } }) =>
    ctx.db.insert("users", {
      name: profile.name ?? profile.login,
      method: "github",
      username: profile.login,
      email: profile.emailVerified ? profile.email : undefined,
      avatarUrl: profile.avatarUrl,
    }),
});
export const onSignInGithub = internalMutation({
  args: { method: method("github", vGithubProfile), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { method: { profile }, userId }) => {
    // Keep the app profile in sync with GitHub on every sign-in.
    await ctx.db.patch(userId, { avatarUrl: profile.avatarUrl, username: profile.login });
    return touch(ctx, userId);
  },
});

export const createUserGoogle = internalMutation({
  args: { method: method("google", vGoogleProfile) },
  returns: v.id("users"),
  handler: (ctx, { method: { profile } }) =>
    ctx.db.insert("users", {
      name: profile.name,
      method: "google",
      email: profile.emailVerified ? profile.email : undefined,
      avatarUrl: profile.picture,
    }),
});
export const onSignInGoogle = internalMutation({
  args: { method: method("google", vGoogleProfile), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { method: { profile }, userId }) => {
    await ctx.db.patch(userId, { avatarUrl: profile.picture });
    return touch(ctx, userId);
  },
});

// Apple sends the user's name only on the first authorization: keep it then.
export const createUserApple = internalMutation({
  args: { method: method("apple", vAppleProfile) },
  returns: v.id("users"),
  handler: (ctx, { method: { profile } }) =>
    ctx.db.insert("users", {
      name: profile.name ?? "Apple user",
      method: "apple",
      email: profile.emailVerified ? profile.email : undefined,
    }),
});
export const onSignInApple = internalMutation({
  args: { method: method("apple", vAppleProfile), userId: v.id("users") },
  returns: v.null(),
  handler: (ctx, { userId }) => touch(ctx, userId),
});

export const createUserAnonymous = internalMutation({
  args: { method: method("anonymous", noProfile) },
  returns: v.id("users"),
  handler: (ctx) => ctx.db.insert("users", { method: "anonymous" }),
});

const vDemoIdpProfile = v.object({ id: v.string(), name: v.string(), email: v.string(), emailVerified: v.boolean() });
export const createUserDemoIdp = internalMutation({
  args: { method: method("demoIdp", vDemoIdpProfile) },
  returns: v.id("users"),
  handler: (ctx, { method: { profile } }) =>
    ctx.db.insert("users", { name: profile.name, method: "demoIdp", email: profile.emailVerified ? profile.email : undefined }),
});
export const onSignInDemoIdp = internalMutation({
  args: { method: method("demoIdp", vDemoIdpProfile), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { method: { profile }, userId }) => {
    await ctx.db.patch(userId, { name: profile.name });
    return touch(ctx, userId);
  },
});

const vMe = v.object({
  _id: v.id("users"),
  name: v.string(),
  method: v.string(),
  username: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
});

/** The signed-in user, enriched with what the auth components know. `null` when signed out. */
export const me = query({
  args: {},
  returns: v.union(vMe, v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId as Id<"users">);
    if (!user) return null;
    const username =
      user.username ?? (await ctx.runQuery(components.authUsername.public.getUsername, { userId }));
    const email =
      user.email ?? (await ctx.runQuery(components.authEmail.verifiedEmails.getPrimaryEmail, { userId }));
    const primaryEmail = typeof email === "string" ? email : null;
    return {
      _id: user._id,
      name: user.name ?? username ?? primaryEmail ?? "Anonymous",
      method: user.method,
      username: username ?? null,
      email: primaryEmail,
      avatarUrl: user.avatarUrl ?? null,
    };
  },
});

export const rename = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    const userId = await requireUserId(ctx);
    await ctx.db.patch(userId, { name: name.trim().slice(0, 60) || "Anonymous" });
    return null;
  },
});
