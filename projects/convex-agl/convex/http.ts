import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// Convex Auth's GitHub component serves its own routes under /oauth/github
// (declared with `httpPrefix` in convex.config.ts).

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

export default http;
