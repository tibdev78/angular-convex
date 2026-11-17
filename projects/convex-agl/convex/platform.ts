/** Platform APIs probed for real: their answer depends on the plan and the deployment. */
import { ConvexError } from "convex/values";
import { getServiceToken, getServiceUrl, log } from "convex/server";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { probe, type Probe } from "./lib";

/**
 * Platform APIs whose availability depends on the plan or the deployment:
 * `log.audit` (Enterprise audit log), `getServiceUrl` / `getServiceToken`
 * (Convex-managed services). Each is called for real and the outcome is
 * returned as is, so the page shows what this deployment answers.
 */
export const check = action({
  args: {},
  handler: async (ctx): Promise<{ audit: Probe; auditDirect: Probe; serviceUrl: Probe; serviceToken: Probe; metadata: Probe }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ code: "NOT_AUTHENTICATED" });
    // Convex refuses `log.audit` inside an action ("Audit logging is not yet
    // supported in actions"). An action audits through a mutation instead: the
    // caller's identity carries over, so `log.vars.convexActor` is still the user.
    const audit = await probe(() => ctx.runMutation(internal.audit.fromAction, { action: "lab.platform", detail: { from: "action" } }));
    // The direct call, kept to show what Convex answers.
    const auditDirect = await probe(async () => {
      await log.audit({ action: "lab.platform.direct", actor: log.vars.convexActor, at: log.vars.now });
      return "recorded";
    });
    const serviceUrl = await probe(() => getServiceUrl("ai-gateway"));
    // The token itself is a credential: only its length leaves the action.
    const serviceToken = await probe(async () => `token of ${(await getServiceToken("ai-gateway")).length} chars`);
    const metadata = await probe(async () => {
      const id = await ctx.storage.store(new Blob(["metadata probe"], { type: "text/plain" }));
      // Deprecated in favour of db.system.get("_storage", id), still served.
      const meta = await ctx.storage.getMetadata(id);
      await ctx.storage.delete(id);
      return `size ${meta?.size} · ${meta?.contentType} · sha256 ${meta?.sha256.slice(0, 8)}…`;
    });
    return { audit, auditDirect, serviceUrl, serviceToken, metadata };
  },
});
