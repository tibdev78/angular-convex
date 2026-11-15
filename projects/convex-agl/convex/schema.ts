import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Dimension of the demo embeddings (computed locally, no external AI call). */
export const EMBEDDING_DIMENSIONS = 32;

export const priority = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));

export default defineSchema({
  // App users. Convex Auth stores credentials in its components and only
  // keeps the id of the row created by our `createUser` callbacks.
  users: defineTable({
    name: v.string(),
    method: v.string(),
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    lastSignInAt: v.optional(v.number()),
  }).index("by_email", ["email"]),

  // One-to-many: a user owns projects, a project groups todos.
  projects: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    color: v.string(),
  }).index("by_owner", ["ownerId"]),

  todos: defineTable({
    ownerId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    text: v.string(),
    done: v.boolean(),
    priority,
    tags: v.array(v.string()),
    dueAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_done", ["ownerId", "done"])
    .index("by_owner_priority", ["ownerId", "priority"])
    .index("by_project", ["projectId"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["ownerId", "done"],
    }),

  // Real-time chat, shared by every signed-in user.
  messages: defineTable({
    channel: v.string(),
    authorId: v.id("users"),
    body: v.string(),
    imageId: v.optional(v.id("_storage")),
  })
    .index("by_channel", ["channel"])
    .searchIndex("search_body", { searchField: "body", filterFields: ["channel"] }),

  presence: defineTable({
    channel: v.string(),
    userId: v.id("users"),
    lastSeen: v.number(),
    typing: v.boolean(),
  })
    .index("by_channel_lastSeen", ["channel", "lastSeen"])
    .index("by_user_channel", ["userId", "channel"]),

  // File storage: the blob lives in `_storage`, this row is the metadata.
  images: defineTable({
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
    name: v.string(),
    caption: v.optional(v.string()),
  }).index("by_owner", ["ownerId"]),

  // Vector search over notes.
  notes: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    body: v.string(),
    embedding: v.array(v.float64()),
  })
    .index("by_owner", ["ownerId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIMENSIONS,
      filterFields: ["ownerId"],
    }),

  // Scheduled functions: each job is run later by `ctx.scheduler`.
  jobs: defineTable({
    ownerId: v.id("users"),
    label: v.string(),
    status: v.union(v.literal("scheduled"), v.literal("running"), v.literal("done"), v.literal("canceled")),
    runAt: v.number(),
    scheduledId: v.optional(v.id("_scheduled_functions")),
    result: v.optional(v.string()),
  }).index("by_owner", ["ownerId"]),

  // Large dataset for the loading / pagination demo.
  events: defineTable({
    kind: v.union(v.literal("info"), v.literal("warning"), v.literal("error")),
    message: v.string(),
    value: v.number(),
  }).index("by_kind", ["kind"]),

  // Written by the cron job.
  stats: defineTable({
    key: v.string(),
    value: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
