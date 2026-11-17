/**
 * The audit trail: `log.audit` (kept durably by Convex only on Enterprise)
 * mirrored into the `auditEvents` table, which any plan can read.
 */
import { v } from "convex/values";
import { log, type AuditLogValue } from "convex/server";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { probe, requireUserId, type Probe } from "./lib";

/**
 * Emits `log.audit` and writes the same event to the `auditEvents` table.
 * Convex only keeps `log.audit` durably on Enterprise; the table is the trail
 * any plan can read.
 */
async function recordAudit(ctx: MutationCtx, action: string, source: "mutation" | "action", detail: unknown): Promise<string> {
  const actorId = await requireUserId(ctx);
  await log.audit({
    action,
    requestId: log.vars.requestId,
    actor: log.vars.convexActor,
    ip: log.vars.ip,
    userAgent: log.vars.userAgent,
    at: log.vars.now,
    detail: (detail ?? null) as AuditLogValue,
  });
  await ctx.db.insert("auditEvents", { actorId, action, source, detail: detail ?? null });
  return source === "action" ? `recorded "${action}" via ctx.runMutation` : "recorded";
}

/**
 * Audits on behalf of an action (`ctx.runMutation`): `log.audit` only runs in
 * queries and mutations. The caller's identity carries over.
 */
export const fromAction = internalMutation({
  args: { action: v.string(), detail: v.optional(v.any()) },
  handler: (ctx, { action, detail }): Promise<string> => recordAudit(ctx, action, "action", detail),
});

/** The signed-in user's latest audit events, newest first. */
export const trail = query({
  args: {},
  handler: async (ctx) => {
    const actorId = await requireUserId(ctx);
    const events = await ctx.db.query("auditEvents").withIndex("by_actor", (q) => q.eq("actorId", actorId)).order("desc").take(5);
    return events.map((e) => ({ id: e._id, action: e.action, source: e.source }));
  },
});

/** `log.audit` from a mutation, with every `log.vars` placeholder. */
export const record = mutation({
  args: {},
  handler: (ctx): Promise<Probe> => probe(() => recordAudit(ctx, "lab.audit", "mutation", { nested: [1, "two", true] })),
});
