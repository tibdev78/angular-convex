import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertOwner, requireUserId } from "./lib";
import { priority } from "./schema";

const filter = v.union(v.literal("all"), v.literal("active"), v.literal("done"));

/** Index-backed listing: `by_owner_done` or `by_owner_priority`, newest first. */
export const list = query({
  args: {
    filter: v.optional(filter),
    priority: v.optional(priority),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    if (args.projectId) {
      const project = assertOwner(await ctx.db.get(args.projectId), ownerId);
      return await ctx.db
        .query("todos")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .order("desc")
        .collect();
    }
    if (args.priority) {
      const p = args.priority;
      return await ctx.db
        .query("todos")
        .withIndex("by_owner_priority", (q) => q.eq("ownerId", ownerId).eq("priority", p))
        .order("desc")
        .collect();
    }
    const f = args.filter ?? "all";
    if (f === "all") {
      return await ctx.db.query("todos").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).order("desc").collect();
    }
    return await ctx.db
      .query("todos")
      .withIndex("by_owner_done", (q) => q.eq("ownerId", ownerId).eq("done", f === "done"))
      .order("desc")
      .collect();
  },
});

/** Paginated listing, for `injectPaginatedQuery`. */
export const paginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db
      .query("todos")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

/** Full-text search (relevance order), optionally restricted to open todos. */
export const search = query({
  args: { text: v.string(), onlyActive: v.optional(v.boolean()) },
  handler: async (ctx, { text, onlyActive }) => {
    const ownerId = await requireUserId(ctx);
    if (!text.trim()) return [];
    return await ctx.db
      .query("todos")
      .withSearchIndex("search_text", (q) => {
        const base = q.search("text", text).eq("ownerId", ownerId);
        return onlyActive ? base.eq("done", false) : base;
      })
      .take(20);
  },
});

/** Aggregates computed in the query (Convex has no SQL `GROUP BY`). */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const todos = await ctx.db.query("todos").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    const byPriority = { low: 0, medium: 0, high: 0 };
    for (const t of todos) byPriority[t.priority]++;
    const done = todos.filter((t) => t.done).length;
    return { total: todos.length, done, active: todos.length - done, byPriority };
  },
});

export const add = mutation({
  args: {
    text: v.string(),
    priority: v.optional(priority),
    tags: v.optional(v.array(v.string())),
    projectId: v.optional(v.id("projects")),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const text = args.text.trim();
    if (!text) throw new ConvexError({ code: "EMPTY_TEXT", message: "A todo needs some text." });
    if (args.projectId) assertOwner(await ctx.db.get(args.projectId), ownerId);
    return await ctx.db.insert("todos", {
      ownerId,
      text,
      done: false,
      priority: args.priority ?? "medium",
      tags: args.tags ?? [],
      projectId: args.projectId,
      dueAt: args.dueAt,
    });
  },
});

export const toggle = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireUserId(ctx);
    const todo = assertOwner(await ctx.db.get(id), ownerId);
    await ctx.db.patch(id, { done: !todo.done });
    return !todo.done;
  },
});

export const update = mutation({
  args: {
    id: v.id("todos"),
    text: v.optional(v.string()),
    priority: v.optional(priority),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, ...patch }) => {
    const ownerId = await requireUserId(ctx);
    assertOwner(await ctx.db.get(id), ownerId);
    await ctx.db.patch(id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireUserId(ctx);
    assertOwner(await ctx.db.get(id), ownerId);
    await ctx.db.delete(id);
    return null;
  },
});

/** Bulk mutation in one transaction: all or nothing. */
export const clearCompleted = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const done = await ctx.db
      .query("todos")
      .withIndex("by_owner_done", (q) => q.eq("ownerId", ownerId).eq("done", true))
      .collect();
    await Promise.all(done.map((t) => ctx.db.delete(t._id)));
    return done.length;
  },
});
