import { v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { assertOwner, requireUserId } from "./lib";
import { EMBEDDING_DIMENSIONS } from "./schema";

/**
 * A deterministic toy embedding (hashed bag of words, L2-normalized), so the
 * vector-search demo needs no external AI provider. Swap in a real model in
 * production.
 */
export function embed(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    let hash = 2166136261;
    for (const char of word) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
    vector[Math.abs(hash) % EMBEDDING_DIMENSIONS] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((x) => x / norm);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const notes = await ctx.db.query("notes").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).order("desc").collect();
    return notes.map(({ embedding: _embedding, ...note }) => note);
  },
});

export const add = mutation({
  args: { title: v.string(), body: v.string() },
  handler: async (ctx, { title, body }) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db.insert("notes", { ownerId, title, body, embedding: embed(`${title} ${body}`) });
  },
});

export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireUserId(ctx);
    assertOwner(await ctx.db.get(id), ownerId);
    await ctx.db.delete(id);
    return null;
  },
});

/** Resolves the caller from inside an action (auth is forwarded to `runQuery`). */
export const callerId = internalQuery({
  args: {},
  handler: (ctx) => requireUserId(ctx),
});

export const byIds = internalQuery({
  args: { ids: v.array(v.id("notes")) },
  handler: async (ctx, { ids }) => {
    const notes = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return notes.filter((n): n is Doc<"notes"> => n !== null);
  },
});

/** Vector search runs in actions only; the action then reads the documents. */
export const similar = action({
  args: { text: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { text, limit }): Promise<Array<{ _id: Id<"notes">; title: string; body: string; score: number }>> => {
    const ownerId = await ctx.runQuery(internal.notes.callerId, {});
    const hits = await ctx.vectorSearch("notes", "by_embedding", {
      vector: embed(text),
      limit: limit ?? 5,
      filter: (q) => q.eq("ownerId", ownerId),
    });
    const notes = await ctx.runQuery(internal.notes.byIds, { ids: hits.map((h) => h._id) });
    return hits.flatMap((hit) => {
      const note = notes.find((n) => n._id === hit._id);
      return note ? [{ _id: note._id, title: note.title, body: note.body, score: hit._score }] : [];
    });
  },
});
