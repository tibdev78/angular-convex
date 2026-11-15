import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

/** The signed-in user's id, or a `ConvexError` the client can show. */
export async function requireUserId(ctx: Parameters<typeof getAuthUserId>[0]): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError({ code: "NOT_AUTHENTICATED" });
  return userId as Id<"users">;
}

/** Throws unless `doc` exists and belongs to `userId`. */
export function assertOwner<T extends { ownerId: Id<"users"> }>(doc: T | null, userId: Id<"users">): T {
  if (!doc || doc.ownerId !== userId) throw new ConvexError({ code: "NOT_FOUND" });
  return doc;
}
