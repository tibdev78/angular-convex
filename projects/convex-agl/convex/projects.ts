import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertOwner, requireUserId } from "./lib";

/** Projects with their todo counts: a one-to-many "join" done in the query. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const projects = await ctx.db.query("projects").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    return await Promise.all(
      projects.map(async (project) => {
        const todos = await ctx.db.query("todos").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect();
        return { ...project, todoCount: todos.length, doneCount: todos.filter((t) => t.done).length };
      }),
    );
  },
});

export const create = mutation({
  args: { name: v.string(), color: v.optional(v.string()) },
  handler: async (ctx, { name, color }) => {
    const ownerId = await requireUserId(ctx);
    if (!name.trim()) throw new ConvexError({ code: "EMPTY_NAME" });
    return await ctx.db.insert("projects", { ownerId, name: name.trim(), color: color ?? "#6366f1" });
  },
});

/** Cascading delete: the project and all its todos, atomically. */
export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireUserId(ctx);
    assertOwner(await ctx.db.get(id), ownerId);
    const todos = await ctx.db.query("todos").withIndex("by_project", (q) => q.eq("projectId", id)).collect();
    await Promise.all(todos.map((t) => ctx.db.delete(t._id)));
    await ctx.db.delete(id);
    return todos.length;
  },
});
