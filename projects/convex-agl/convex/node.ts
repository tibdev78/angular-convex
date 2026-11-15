/// <reference types="node" />
"use node";
/**
 * Runs in the Node.js runtime instead of the Convex runtime, so Node built-ins
 * (here `node:crypto`) are available. Only actions can live in such a file.
 */
import { createHash } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export const sha256 = internalAction({
  args: { text: v.string() },
  returns: v.object({ sha256: v.string(), node: v.string() }),
  handler: async (_ctx, { text }) => ({
    sha256: createHash("sha256").update(text).digest("hex"),
    node: process.version,
  }),
});
