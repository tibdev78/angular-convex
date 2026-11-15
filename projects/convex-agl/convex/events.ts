import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./lib";

const kind = v.union(v.literal("info"), v.literal("warning"), v.literal("error"));
const KINDS = ["info", "warning", "error"] as const;

/** Large dataset browsing: paginated, optionally filtered through an index. */
export const list = query({
  args: { kind: v.optional(kind), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { kind, paginationOpts }) => {
    await requireUserId(ctx);
    const q = kind
      ? ctx.db.query("events").withIndex("by_kind", (i) => i.eq("kind", kind))
      : ctx.db.query("events");
    return await q.order("desc").paginate(paginationOpts);
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const stat = await ctx.db.query("stats").withIndex("by_key", (q) => q.eq("key", "events")).unique();
    return stat?.value ?? 0;
  },
});

/**
 * Seeds `total` rows in batches of 200: each batch is its own transaction and
 * schedules the next one, the usual way to stay under transaction limits.
 */
export const seed = mutation({
  args: { total: v.number() },
  handler: async (ctx, { total }) => {
    await requireUserId(ctx);
    await ctx.scheduler.runAfter(0, internal.events.seedBatch, { remaining: Math.min(total, 20_000), offset: 0 });
    return null;
  },
});

export const seedBatch = internalMutation({
  args: { remaining: v.number(), offset: v.number() },
  handler: async (ctx, { remaining, offset }) => {
    const size = Math.min(200, remaining);
    for (let i = 0; i < size; i++) {
      const n = offset + i;
      await ctx.db.insert("events", {
        kind: KINDS[n % 7 === 0 ? 2 : n % 3 === 0 ? 1 : 0],
        message: `Event #${n + 1}`,
        value: (n * 37) % 1000,
      });
    }
    await bump(ctx, size);
    if (remaining > size) {
      await ctx.scheduler.runAfter(0, internal.events.seedBatch, { remaining: remaining - size, offset: offset + size });
    }
    return null;
  },
});

async function bump(ctx: MutationCtx, by: number) {
  const stat = await ctx.db.query("stats").withIndex("by_key", (q) => q.eq("key", "events")).unique();
  if (stat) await ctx.db.patch(stat._id, { value: stat.value + by, updatedAt: Date.now() });
  else await ctx.db.insert("stats", { key: "events", value: by, updatedAt: Date.now() });
}
