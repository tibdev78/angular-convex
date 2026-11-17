/**
 * The "Lab": every server primitive the other pages do not already use.
 *
 * - validators: v.record, v.bytes, v.int64, v.any, v.nullable, v.commitTs, v.function, returns + schema.doc
 * - db: replace, normalizeId, first, explicit table names (`get("samples", id)`…)
 * - getDocumentSize, ctx.auth.getUserIdentity
 * - paginationResultValidator
 * - nested queries with transactionLimits / useStaleSnapshot
 * - function handles scheduled with ctx.scheduler
 * - actions: ctx.runAction into the Node runtime ("use node", ./node.ts), ctx.storage.store
 */
import { ConvexError, getDocumentSize, v } from "convex/values";
import { createFunctionHandle, type GenericDatabaseWriterWithTable, type FunctionHandle, paginationOptsValidator, paginationResultValidator } from "convex/server";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import schema, { sampleFields } from "./schema";
import { assertOwner, requireUserId } from "./lib";

const sample = schema.doc("samples");
const { ownerId: _owner, revision: _revision, committedAt: _committedAt, handle: _handle, ...input } = sampleFields;

export const create = mutation({
  args: input,
  returns: v.id("samples"),
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    // Explicit table name form of `insert`.
    return await ctx.db.insert("samples", { ...args, ownerId, revision: 0, committedAt: ctx.db.vars.commitTs });
  },
});

export const list = query({
  args: {},
  returns: v.array(v.object({ doc: sample, size: v.number() })),
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    // Newest commit first.
    const docs = await ctx.db.query("samples").withIndex("by_owner_commit", (q) => q.eq("ownerId", ownerId)).order("desc").take(20);
    return docs.map((doc) => ({ doc, size: getDocumentSize(doc) }));
  },
});

export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(sample),
  handler: async (ctx, { paginationOpts }) => {
    const ownerId = await requireUserId(ctx);
    return await ctx.db.query("samples").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).paginate(paginationOpts);
  },
});

/** `.first()` on an index, plus the caller's JWT identity. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const mine = () => ctx.db.query("samples").withIndex("by_owner", (q) => q.eq("ownerId", ownerId));
    const latest = await mine().order("desc").first();
    // A query is an async iterable: documents are read lazily, one page at a time.
    let iterated = 0;
    for await (const _doc of mine()) iterated++;
    // Filter expressions (not indexed): q.and / q.neq / q.gte on fields.
    const withNote = await mine()
      .filter((q) => q.and(q.neq(q.field("note"), null), q.gte(q.field("revision"), 0)))
      .collect();
    return {
      latestLabel: latest?.label ?? null,
      iterated,
      withNote: withNote.length,
      identity: identity && { subject: identity.subject, issuer: identity.issuer, tokenIdentifier: identity.tokenIdentifier },
    };
  },
});

/** `normalizeId`: is this string an id of the `samples` table? */
export const normalize = query({
  args: { id: v.string() },
  returns: v.object({ samples: v.union(v.id("samples"), v.null()), users: v.union(v.id("users"), v.null()) }),
  handler: async (ctx, { id }) => {
    await requireUserId(ctx);
    return { samples: ctx.db.normalizeId("samples", id), users: ctx.db.normalizeId("users", id) };
  },
});

/** `db.replace`: the whole document is rewritten, fields left out disappear. */
export const replace = mutation({
  args: { id: v.id("samples"), label: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, label }) => {
    const ownerId = await requireUserId(ctx);
    const doc = assertOwner(await ctx.db.get("samples", id), ownerId);
    await ctx.db.replace("samples", id, {
      ownerId,
      label,
      counts: {},
      payload: new ArrayBuffer(0),
      big: doc.big + 1n,
      extra: null,
      note: null,
      revision: doc.revision + 1,
      committedAt: ctx.db.vars.commitTs,
    });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("samples") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const ownerId = await requireUserId(ctx);
    assertOwner(await ctx.db.get("samples", id), ownerId);
    await ctx.db.delete("samples", id);
    return null;
  },
});

export const bump = internalMutation({
  args: { id: v.id("samples"), by: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, by }) => {
    const doc = await ctx.db.get(id);
    if (doc) await ctx.db.patch("samples", id, { revision: doc.revision + by });
    return null;
  },
});

/**
 * A function handle is a serialisable reference to a function: it is stored
 * in the document (`v.function()` field), then scheduled from what was stored.
 */
export const bumpLater = mutation({
  args: { id: v.id("samples") },
  returns: v.string(),
  handler: async (ctx, { id }) => {
    const ownerId = await requireUserId(ctx);
    const doc = assertOwner(await ctx.db.get(id), ownerId);
    let handle = doc.handle;
    if (!handle) {
      const created: FunctionHandle<"mutation", { id: Id<"samples">; by: number }, null> = await createFunctionHandle(internal.lab.bump);
      handle = created;
      await ctx.db.patch(id, { handle });
      await ctx.scheduler.runAfter(0, handle, { id, by: 10 });
    } else {
      // The stored handle is scheduled at an absolute time this time.
      await ctx.scheduler.runAt(Date.now(), handle, { id, by: 10 });
    }
    return handle;
  },
});

export const countFor = internalQuery({
  args: { ownerId: v.id("users") },
  returns: v.object({ count: v.number(), snapshot: v.string() }),
  handler: async (ctx, { ownerId }) => {
    const rows = await ctx.db.query("samples").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    return { count: rows.length, snapshot: ctx.meta.getSnapshotTs().toString() };
  },
});

/** Nested query with lowered transaction limits, then on a stale snapshot. */
type Count = { count: number; snapshot: string };

export const nested = mutation({
  args: {},
  returns: v.object({
    limited: v.number(),
    stale: v.number(),
    parentSnapshot: v.string(),
    staleSnapshot: v.string(),
    limitHit: v.nullable(v.string()),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const limited: Count = await ctx.runQuery(internal.lab.countFor, { ownerId }, { transactionLimits: { documentsRead: 1000 } });
    const stale: Count = await ctx.runQuery(internal.lab.countFor, { ownerId }, { useStaleSnapshot: true });
    let limitHit: string | null = null;
    try {
      await ctx.runQuery(internal.lab.countFor, { ownerId }, { transactionLimits: { documentsRead: 0 } });
    } catch (e) {
      limitHit = e instanceof Error ? e.message.split("\n")[0].slice(0, 120) : String(e);
    }
    return { limited: limited.count, stale: stale.count, parentSnapshot: ctx.meta.getSnapshotTs().toString(), staleSnapshot: stale.snapshot, limitHit };
  },
});

/**
 * Action → Node action (`ctx.runAction`), then a blob written by the action
 * itself (`ctx.storage.store`) and read back (`ctx.storage.get`).
 */
export const digest = action({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<{ sha256: string; node: string; storageId: Id<"_storage">; url: string | null; readBack: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "NOT_AUTHENTICATED" });
    const { sha256, node } = await ctx.runAction(internal.node.sha256, { text });
    const storageId = await ctx.storage.store(new Blob([`${text}\nsha256=${sha256}\n`], { type: "text/plain" }));
    const blob = await ctx.storage.get(storageId);
    return { sha256, node, storageId, url: await ctx.storage.getUrl(storageId), readBack: (await blob?.text()) ?? "" };
  },
});

/** Written by the expression crons in ./crons.ts. */
export const cronRan = internalMutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    const key = `lab-cron:${name}`;
    const stat = await ctx.db.query("stats").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (stat) await ctx.db.patch(stat._id, { value: stat.value + 1, updatedAt: Date.now() });
    else await ctx.db.insert("stats", { key, value: 1, updatedAt: Date.now() });
    return null;
  },
});

export const cronStats = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const rows = await ctx.db.query("stats").withIndex("by_key", (q) => q.gte("key", "lab-cron:").lt("key", "lab-cron;")).collect();
    return rows.map(({ key, value, updatedAt }) => ({ name: key.slice("lab-cron:".length), value, updatedAt }));
  },
});

/** `_storage` metadata of a blob, readable from an HTTP action through `runQuery`. */
export const fileMeta = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const meta = await ctx.db.system.get("_storage", storageId);
    return { size: meta?.size ?? 0, contentType: meta?.contentType ?? null, sha256: meta?.sha256 ?? null };
  },
});

/** Always fails with a typed error, to show `throwOnError` on the client. */
export const boom = query({
  args: { code: v.string() },
  returns: v.null(),
  handler: async (_ctx, { code }) => {
    throw new ConvexError({ code });
  },
});

/** `db.system.query`: the last runs of the handle-scheduled mutation. */
export const scheduledBumps = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const recent = await ctx.db.system.query("_scheduled_functions").order("desc").take(50);
    return recent
      .filter((job) => job.name.includes("bump"))
      .slice(0, 5)
      .map(({ _id, name, state, scheduledTime, completedTime }) => ({ _id, name, state: state.kind, scheduledTime, completedTime: completedTime ?? null }));
  },
});

/**
 * `ctx.db.table(name)`: a database scoped to one table. The generated
 * `mutation` types `ctx.db` without it, so the `WithTable` interface from
 * `convex/server` is applied here.
 */
export const viaTable = mutation({
  args: {},
  returns: v.object({ inserted: v.string(), patched: v.number(), readBack: v.union(v.string(), v.null()), queried: v.number(), deleted: v.boolean() }),
  handler: async (ctx) => {
    const owner = await requireUserId(ctx);
    const samples = (ctx.db as unknown as GenericDatabaseWriterWithTable<DataModel>).table("samples");
    const id = await samples.insert({ ownerId: owner, label: "via db.table", counts: {}, payload: new ArrayBuffer(0), big: 0n, extra: null, note: null, revision: 0 });
    await samples.patch(id, { revision: 7 });
    const doc = await samples.get(id);
    const queried = (await samples.query().withIndex("by_owner", (q) => q.eq("ownerId", owner)).collect()).length;
    await samples.delete(id);
    return { inserted: id, patched: doc?.revision ?? -1, readBack: doc?.label ?? null, queried, deleted: (await samples.get(id)) === null };
  },
});
