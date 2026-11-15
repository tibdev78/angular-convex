import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const emailFields = {
  from: v.string(),
  to: v.array(v.string()),
  subject: v.optional(v.string()),
  html: v.optional(v.string()),
  text: v.optional(v.string()),
};

/** Same signature as `@convex-dev/resend`'s `lib.sendEmail`: records, never sends. */
export const sendEmail = mutation({
  args: {
    options: v.object({
      apiKey: v.string(),
      testMode: v.boolean(),
      initialBackoffMs: v.number(),
      retryAttempts: v.number(),
    }),
    ...emailFields,
  },
  returns: v.string(),
  handler: async (ctx, { options: _options, ...email }) => {
    return await ctx.db.insert("emails", email);
  },
});

/** Most recent emails first. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({ _id: v.string(), _creationTime: v.number(), ...emailFields })),
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db.query("emails").order("desc").take(limit ?? 50);
    return rows.map((row) => ({ ...row, _id: row._id as string }));
  },
});

export const clear = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const rows = await ctx.db.query("emails").collect();
    await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
    return rows.length;
  },
});
