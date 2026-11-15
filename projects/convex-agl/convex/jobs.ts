import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertOwner, requireUserId } from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const jobs = await ctx.db.query("jobs").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).order("desc").take(20);
    return await Promise.all(
      jobs.map(async (job) => ({
        ...job,
        // The `_scheduled_functions` system table tracks the run itself.
        system: job.scheduledId ? ((await ctx.db.system.get(job.scheduledId))?.state.kind ?? null) : null,
      })),
    );
  },
});

/** `ctx.scheduler.runAfter`: the job runs `delayMs` later, even if the client leaves. */
export const schedule = mutation({
  args: { label: v.string(), delayMs: v.number() },
  handler: async (ctx, { label, delayMs }) => {
    const ownerId = await requireUserId(ctx);
    if (delayMs < 0 || delayMs > 3_600_000) throw new ConvexError({ code: "BAD_DELAY" });
    const jobId = await ctx.db.insert("jobs", { ownerId, label, status: "scheduled", runAt: Date.now() + delayMs });
    const scheduledId = await ctx.scheduler.runAfter(delayMs, internal.jobs.run, { jobId });
    await ctx.db.patch(jobId, { scheduledId });
    return jobId;
  },
});

export const cancel = mutation({
  args: { id: v.id("jobs") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireUserId(ctx);
    const job = assertOwner(await ctx.db.get(id), ownerId);
    if (job.status !== "scheduled") return false;
    if (job.scheduledId) await ctx.scheduler.cancel(job.scheduledId);
    await ctx.db.patch(id, { status: "canceled" });
    return true;
  },
});

export const run = internalMutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.status !== "scheduled") return null;
    await ctx.db.patch(jobId, { status: "done", result: `Ran at ${new Date().toISOString()}` });
    return null;
  },
});
