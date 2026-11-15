import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUserId } from "./lib";

/** Joins each message with its author and image URL. */
async function enrich(ctx: QueryCtx, messages: Doc<"messages">[]) {
  return await Promise.all(
    messages.map(async (m) => {
      const author = await ctx.db.get(m.authorId);
      return {
        ...m,
        author: author ? { name: author.name, avatarUrl: author.avatarUrl ?? null } : null,
        imageUrl: m.imageId ? await ctx.storage.getUrl(m.imageId) : null,
      };
    }),
  );
}

/** Newest first, paginated: the chat loads older pages on demand. */
export const list = query({
  args: { channel: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { channel, paginationOpts }) => {
    await requireUserId(ctx);
    const page = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channel", channel))
      .order("desc")
      .paginate(paginationOpts);
    return { ...page, page: await enrich(ctx, page.page) };
  },
});

export const search = query({
  args: { channel: v.string(), text: v.string() },
  handler: async (ctx, { channel, text }) => {
    await requireUserId(ctx);
    if (!text.trim()) return [];
    const hits = await ctx.db
      .query("messages")
      .withSearchIndex("search_body", (q) => q.search("body", text).eq("channel", channel))
      .take(20);
    return await enrich(ctx, hits);
  },
});

export const send = mutation({
  args: { channel: v.string(), body: v.string(), imageId: v.optional(v.id("_storage")) },
  handler: async (ctx, { channel, body, imageId }) => {
    const authorId = await requireUserId(ctx);
    const text = body.trim();
    if (!text && !imageId) throw new ConvexError({ code: "EMPTY_MESSAGE" });
    if (text.length > 2000) throw new ConvexError({ code: "TOO_LONG" });
    return await ctx.db.insert("messages", { channel, authorId, body: text, imageId });
  },
});
