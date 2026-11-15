import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { displayName, requireUserId } from "./lib";

/** A client is "online" if its last heartbeat is more recent than this. */
export const ONLINE_MS = 30_000;

export const heartbeat = mutation({
  args: { channel: v.string(), typing: v.optional(v.boolean()) },
  handler: async (ctx, { channel, typing }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user_channel", (q) => q.eq("userId", userId).eq("channel", channel))
      .unique();
    const row = { lastSeen: Date.now(), typing: typing ?? false };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("presence", { channel, userId, ...row });
    return null;
  },
});

export const leave = mutation({
  args: { channel: v.string() },
  handler: async (ctx, { channel }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_user_channel", (q) => q.eq("userId", userId).eq("channel", channel))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/**
 * Users seen recently. `since` comes from the client (rounded) because
 * `Date.now()` inside a query would not re-run the query as time passes.
 */
export const list = query({
  args: { channel: v.string(), since: v.number() },
  handler: async (ctx, { channel, since }) => {
    await requireUserId(ctx);
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_channel_lastSeen", (q) => q.eq("channel", channel).gt("lastSeen", since))
      .collect();
    return await Promise.all(
      rows.map(async (row) => {
        const user = await ctx.db.get(row.userId);
        return { userId: row.userId, name: user ? await displayName(ctx, user) : "?", typing: row.typing, lastSeen: row.lastSeen };
      }),
    );
  },
});

/** Run by the cron: drop rows older than 5 minutes. */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 5 * 60_000;
    const stale = await ctx.db.query("presence").filter((q) => q.lt(q.field("lastSeen"), cutoff)).take(500);
    await Promise.all(stale.map((row) => ctx.db.delete(row._id)));
    return stale.length;
  },
});
