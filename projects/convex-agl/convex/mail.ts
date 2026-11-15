import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { requireUserId } from "./lib";

/**
 * Fake mailing: everything goes through the local `resend` stub component,
 * the same path Convex Auth uses for its verification and recovery emails.
 * Nothing leaves the deployment.
 */
export const inbox = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    // The fake inbox is a dev tool: it shows every email of the deployment,
    // including the auth links needed to finish sign-up while signed out.
    return await ctx.runQuery(components.resend.lib.list, { limit: limit ?? 50 });
  },
});

/** Sends now, or later through the scheduler. */
export const send = mutation({
  args: {
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    delayMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    if (!/^\S+@\S+\.\S+$/.test(args.to)) throw new ConvexError({ code: "INVALID_EMAIL" });
    await ctx.scheduler.runAfter(args.delayMs ?? 0, internal.mail.deliver, {
      to: args.to,
      subject: args.subject,
      text: args.text,
    });
    return null;
  },
});

export const deliver = internalMutation({
  args: { to: v.string(), subject: v.string(), text: v.string() },
  handler: async (ctx, { to, subject, text }) => {
    await ctx.runMutation(components.resend.lib.sendEmail, {
      options: { apiKey: "re_fake_demo_key", testMode: true, initialBackoffMs: 0, retryAttempts: 0 },
      from: "Convex AGL <hello@convex-agl.local>",
      to: [to],
      subject,
      text,
      html: `<p>${text.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`)}</p>`,
    });
    return null;
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.runMutation(components.resend.lib.clear, {});
  },
});
