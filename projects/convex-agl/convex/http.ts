import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { registerDemoIdp } from "./idp";

const http = httpRouter();

// Convex Auth's GitHub component serves its own routes under /oauth/github
// (declared with `httpPrefix` in convex.config.ts).

// The demo OIDC provider (/idp/*, /.well-known/openid-configuration) and its
// client callback (/oauth/demo/callback). See ./idp.ts.
registerDemoIdp(http);

http.route({
  path: "/api/health",
  method: "GET",
  handler: httpAction(async () => Response.json({ ok: true, at: new Date().toISOString() })),
});

/** Plain HTTP read of the fake inbox (e.g. for scripts or e2e checks). */
http.route({
  path: "/api/inbox",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const emails = await ctx.runQuery(api.mail.inbox, { limit: 10 });
    return Response.json(emails.map(({ subject, to, _creationTime }) => ({ subject, to, _creationTime })));
  }),
});

http.route({
  pathPrefix: "/api/echo/",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    return Response.json({ path: url.pathname, body: await request.text() });
  }),
});

// Lab: a CORS-enabled upload straight into storage from an HTTP action, and a
// GET that streams the blob back with `ctx.storage.get`.
const cors = (request: Request) => ({
  "Access-Control-Allow-Origin": request.headers.get("Origin") ?? "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
});

for (const path of ["/api/lab/upload", "/api/lab/file"]) {
  http.route({ path, method: "OPTIONS", handler: httpAction(async (_ctx, request) => new Response(null, { status: 204, headers: cors(request) })) });
}

http.route({
  path: "/api/lab/upload",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // The client sends its Convex Auth JWT as a bearer token.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return new Response("Unauthorized", { status: 401, headers: cors(request) });
    const storageId = await ctx.storage.store(await request.blob());
    const meta = await ctx.runQuery(internal.lab.fileMeta, { storageId });
    return Response.json({ storageId, ...meta, subject: identity.subject }, { headers: cors(request) });
  }),
});

http.route({
  path: "/api/lab/file",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const blob = await ctx.storage.get(id as Id<"_storage">).catch(() => null);
    if (!blob) return new Response("Not found", { status: 404, headers: cors(request) });
    return new Response(blob, { headers: { ...cors(request), "Content-Type": blob.type || "application/octet-stream" } });
  }),
});

export default http;
