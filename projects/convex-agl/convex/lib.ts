import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { components } from "./_generated/api";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/** The signed-in user's id, or a `ConvexError` the client can show. */
export async function requireUserId(ctx: Parameters<typeof getAuthUserId>[0]): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError({ code: "NOT_AUTHENTICATED" });
  return userId as Id<"users">;
}

/**
 * The name other users see. Username methods create the app row before the
 * username is stored (Convex Auth calls `createUser` first), so the username is
 * read from the `authUsername` component rather than copied at sign-up.
 */
export async function displayName(ctx: QueryCtx, user: Doc<"users">): Promise<string> {
  if (user.name) return user.name;
  if (user.username) return user.username;
  const username = await ctx.runQuery(components.authUsername.public.getUsername, { userId: user._id });
  return typeof username === "string" ? username : "Anonymous";
}

/** Throws unless `doc` exists and belongs to `userId`. */
export function assertOwner<T extends { ownerId: Id<"users"> }>(doc: T | null, userId: Id<"users">): T {
  if (!doc || doc.ownerId !== userId) throw new ConvexError({ code: "NOT_FOUND" });
  return doc;
}
