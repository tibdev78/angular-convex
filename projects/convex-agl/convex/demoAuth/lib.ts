import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { vIdpProfile } from "./schema";

const TEN_MINUTES = 10 * 60 * 1000;

export const getAccount = query({
  args: { provider: v.string(), subject: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { provider, subject }) =>
    (await ctx.db.query("accounts").withIndex("by_subject", (q) => q.eq("provider", provider).eq("subject", subject)).unique())?.userId ?? null,
});

export const createAccount = mutation({
  args: { provider: v.string(), subject: v.string(), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("accounts", args);
    return null;
  },
});

export const createRequest = mutation({
  args: { stateHash: v.string(), redirectTo: v.string(), codeVerifier: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("requests", { ...args, expiresAt: Date.now() + TEN_MINUTES });
    return null;
  },
});

/** One use only: the request is deleted when claimed. */
export const claimRequest = mutation({
  args: { stateHash: v.string() },
  returns: v.union(v.object({ redirectTo: v.string(), codeVerifier: v.string() }), v.null()),
  handler: async (ctx, { stateHash }) => {
    const row = await ctx.db.query("requests").withIndex("by_state", (q) => q.eq("stateHash", stateHash)).unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    return row.expiresAt > Date.now() ? { redirectTo: row.redirectTo, codeVerifier: row.codeVerifier } : null;
  },
});

export const createCode = mutation({
  args: { codeHash: v.string(), clientId: v.string(), redirectUri: v.string(), codeChallenge: v.string(), profile: vIdpProfile },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("codes", { ...args, expiresAt: Date.now() + 60_000 });
    return null;
  },
});

export const redeemCode = mutation({
  args: { codeHash: v.string() },
  returns: v.union(v.object({ clientId: v.string(), redirectUri: v.string(), codeChallenge: v.string(), profile: vIdpProfile }), v.null()),
  handler: async (ctx, { codeHash }) => {
    const row = await ctx.db.query("codes").withIndex("by_code", (q) => q.eq("codeHash", codeHash)).unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt <= Date.now()) return null;
    return { clientId: row.clientId, redirectUri: row.redirectUri, codeChallenge: row.codeChallenge, profile: row.profile };
  },
});

export const createAccessToken = mutation({
  args: { tokenHash: v.string(), profile: vIdpProfile },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("accessTokens", { ...args, expiresAt: Date.now() + TEN_MINUTES });
    return null;
  },
});

export const userInfo = query({
  args: { tokenHash: v.string() },
  returns: v.union(vIdpProfile, v.null()),
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db.query("accessTokens").withIndex("by_token", (q) => q.eq("tokenHash", tokenHash)).unique();
    return row && row.expiresAt > Date.now() ? row.profile : null;
  },
});

export const createTicket = mutation({
  args: { ticketHash: v.string(), stateHash: v.string(), profile: vIdpProfile },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("tickets", { ...args, expiresAt: Date.now() + 60_000 });
    return null;
  },
});

/** The ticket must match the `state` of the browser that started the flow. */
export const claimTicket = mutation({
  args: { ticketHash: v.string(), stateHash: v.string() },
  returns: v.union(vIdpProfile, v.null()),
  handler: async (ctx, { ticketHash, stateHash }) => {
    const row = await ctx.db.query("tickets").withIndex("by_ticket", (q) => q.eq("ticketHash", ticketHash)).unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    return row.stateHash === stateHash && row.expiresAt > Date.now() ? row.profile : null;
  },
});
