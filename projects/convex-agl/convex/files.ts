import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertOwner, requireUserId } from "./lib";

const MAX_BYTES = 5 * 1024 * 1024;

/** Step 1 of an upload: a short-lived URL the browser POSTs the file to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Step 2: record the uploaded blob, after checking its metadata in `_storage`. */
export const saveImage = mutation({
  args: { storageId: v.id("_storage"), name: v.string(), caption: v.optional(v.string()) },
  handler: async (ctx, { storageId, name, caption }) => {
    const ownerId = await requireUserId(ctx);
    const meta = await ctx.db.system.get(storageId);
    if (!meta) throw new ConvexError({ code: "UPLOAD_NOT_FOUND" });
    if (!meta.contentType?.startsWith("image/") || meta.size > MAX_BYTES) {
      await ctx.storage.delete(storageId);
      throw new ConvexError({ code: "INVALID_IMAGE", message: "Images only, 5 MB max." });
    }
    return await ctx.db.insert("images", { ownerId, storageId, name, caption });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const images = await ctx.db.query("images").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).order("desc").collect();
    return await Promise.all(
      images.map(async (image) => {
        const meta = await ctx.db.system.get(image.storageId);
        return {
          ...image,
          url: await ctx.storage.getUrl(image.storageId),
          size: meta?.size ?? 0,
          contentType: meta?.contentType ?? null,
          sha256: meta?.sha256 ?? null,
        };
      }),
    );
  },
});

export const remove = mutation({
  args: { id: v.id("images") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireUserId(ctx);
    const image = assertOwner(await ctx.db.get(id), ownerId);
    await ctx.storage.delete(image.storageId);
    await ctx.db.delete(id);
    return null;
  },
});
