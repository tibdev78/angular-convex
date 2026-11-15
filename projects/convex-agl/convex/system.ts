import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib";

/** Written every minute by the cron in ./crons.ts. */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stat = await ctx.db.query("stats").withIndex("by_key", (q) => q.eq("key", "cron")).unique();
    if (stat) await ctx.db.patch(stat._id, { value: stat.value + 1, updatedAt: Date.now() });
    else await ctx.db.insert("stats", { key: "cron", value: 1, updatedAt: Date.now() });
    return null;
  },
});

export const cronStat = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("stats").withIndex("by_key", (q) => q.eq("key", "cron")).unique();
  },
});

/** `ctx.meta`: function, deployment and transaction metadata. */
export const info = query({
  args: {},
  handler: async (ctx) => {
    const [fn, deployment, metrics] = await Promise.all([
      ctx.meta.getFunctionMetadata(),
      ctx.meta.getDeploymentMetadata(),
      ctx.meta.getTransactionMetrics(),
    ]);
    return { fn, deployment, documentsRead: metrics.documentsRead, snapshotTs: ctx.meta.getSnapshotTs().toString() };
  },
});

/** Throws on purpose, to show error handling in the client. */
export const fail = mutation({
  args: { message: v.string() },
  handler: async (ctx, { message }) => {
    await requireUserId(ctx);
    throw new Error(message);
  },
});

/** An action calling the outside world (here: the deployment's own HTTP route). */
export const ping = action({
  args: {},
  handler: async (_ctx): Promise<{ ok: boolean; status: number; body: string }> => {
    const site = process.env.CONVEX_SITE_URL;
    if (!site) return { ok: false, status: 0, body: "CONVEX_SITE_URL is not set" };
    const res = await fetch(`${site}/api/health`);
    return { ok: res.ok, status: res.status, body: await res.text() };
  },
});
