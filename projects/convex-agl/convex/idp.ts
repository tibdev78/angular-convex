/**
 * A small OpenID Connect provider served by the demo's own HTTP routes, and
 * the OAuth client callback that talks to it.
 *
 * It lets the demo run, and test end to end, the whole authorization-code
 * flow (consent page, PKCE, code → token exchange, signed `id_token`,
 * userinfo, one-time ticket handed back to the app) without a third-party
 * account. The sign-in method that consumes it is `demoIdp` in ./auth.ts.
 *
 * It is a demo: the client secret is public and the consent page accepts any
 * name and email. Do not use it to protect real data.
 */
import type { HttpRouter } from "convex/server";
import { components } from "./_generated/api";
import { env, httpAction } from "./_generated/server";

export const DEMO_IDP_CLIENT_ID = "convex-agl";
/** Public on purpose: the provider and the client are the same demo. */
const DEMO_IDP_CLIENT_SECRET = "convex-agl-demo-secret";
const SITE_URL = env.SITE_URL ?? "http://localhost:4200";

/** The deployment's `.convex.site` origin, where HTTP routes are served. */
export function siteOrigin(): string {
  const url = process.env["CONVEX_SITE_URL"];
  if (!url) throw new Error("CONVEX_SITE_URL is not set");
  return url.replace(/\/$/, "");
}
export const callbackUrl = () => `${siteOrigin()}/oauth/demo/callback`;

const encoder = new TextEncoder();

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function base64url(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

export async function sha256Hex(text: string): Promise<string> {
  return [...(await sha256(text))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** PKCE S256 challenge of a verifier. */
export const pkceChallenge = async (verifier: string) => base64url(await sha256(verifier));

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(DEMO_IDP_CLIENT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

const b64urlJson = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));

/** An HS256 JWT signed with the client secret, as OIDC allows for confidential clients. */
async function signJwt(claims: Record<string, unknown>): Promise<string> {
  const input = `${b64urlJson({ alg: "HS256", typ: "JWT" })}.${b64urlJson(claims)}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(input));
  return `${input}.${base64url(signature)}`;
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

type IdTokenClaims = { iss?: unknown; aud?: unknown; sub?: unknown; exp?: unknown };

/** Verifies the signature and the standard claims; returns the claims or null. */
async function verifyIdToken(token: string): Promise<IdTokenClaims | null> {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromBase64url(signature), encoder.encode(`${header}.${payload}`));
  if (!ok) return null;
  const claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as IdTokenClaims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== siteOrigin() || claims.aud !== DEMO_IDP_CLIENT_ID || typeof claims.exp !== "number" || claims.exp < now) return null;
  return claims;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const redirect = (url: string) => new Response(null, { status: 302, headers: { Location: url } });
const oauthError = (error: string, status = 400) => Response.json({ error }, { status });

function withParams(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function consentPage(params: URLSearchParams): string {
  const hidden = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope"]
    .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(params.get(name) ?? "")}">`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Demo OIDC provider</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f4f7;color:#1c1c28;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#fff;border-radius:12px;padding:28px;box-shadow:0 2px 12px #0002;width:min(360px,90vw);display:grid;gap:12px}
h1{font-size:1.2rem;margin:0}p{margin:0;color:#555;font-size:.9rem}label{display:grid;gap:4px;font-size:.9rem}
input{padding:8px;border:1px solid #ccc;border-radius:6px;font:inherit}.row{display:flex;gap:8px;justify-content:flex-end}
button{padding:8px 14px;border-radius:6px;border:1px solid #888;background:#fff;font:inherit;cursor:pointer}
button[value=allow]{background:#3b5bdb;color:#fff;border-color:#3b5bdb}</style></head>
<body><form method="post" action="/idp/authorize">
<h1>Demo OIDC provider</h1>
<p><strong>${escapeHtml(params.get("client_id") ?? "")}</strong> asks for your profile and email (scope: ${escapeHtml(params.get("scope") ?? "")}).</p>
${hidden}
<label>Name <input name="name" data-testid="idp-name" required value="Ada Lovelace"></label>
<label>Email <input name="email" type="email" data-testid="idp-email" required value="ada@example.test"></label>
<div class="row"><button name="decision" value="deny" data-testid="idp-deny" formnovalidate>Deny</button>
<button name="decision" value="allow" data-testid="idp-allow">Allow</button></div>
</form></body></html>`;
}

/** Adds the provider's routes and the client callback to the app's router. */
export function registerDemoIdp(http: HttpRouter): void {
  http.route({
    path: "/.well-known/openid-configuration",
    method: "GET",
    handler: httpAction(async () => {
      const issuer = siteOrigin();
      return Response.json({
        issuer,
        authorization_endpoint: `${issuer}/idp/authorize`,
        token_endpoint: `${issuer}/idp/token`,
        userinfo_endpoint: `${issuer}/idp/userinfo`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        id_token_signing_alg_values_supported: ["HS256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
        scopes_supported: ["openid", "profile", "email"],
      });
    }),
  });

  // 1. Authorization endpoint: the consent page...
  http.route({
    path: "/idp/authorize",
    method: "GET",
    handler: httpAction(async (_ctx, request) => {
      const params = new URL(request.url).searchParams;
      if (params.get("client_id") !== DEMO_IDP_CLIENT_ID || params.get("redirect_uri") !== callbackUrl()) {
        return new Response("Unknown client or redirect_uri", { status: 400 });
      }
      if (params.get("response_type") !== "code" || params.get("code_challenge_method") !== "S256" || !params.get("code_challenge")) {
        return redirect(withParams(callbackUrl(), { error: "invalid_request", state: params.get("state") ?? "" }));
      }
      return new Response(consentPage(params), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }),
  });

  // ...and its answer: back to the client with a code, or with access_denied.
  http.route({
    path: "/idp/authorize",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const form = await request.formData();
      const field = (name: string) => String(form.get(name) ?? "").trim();
      if (field("client_id") !== DEMO_IDP_CLIENT_ID || field("redirect_uri") !== callbackUrl()) {
        return new Response("Unknown client or redirect_uri", { status: 400 });
      }
      const state = field("state");
      if (field("decision") !== "allow") return redirect(withParams(callbackUrl(), { error: "access_denied", state }));
      const email = field("email").toLowerCase();
      if (!/^[^@\s]+@[^@\s]+$/.test(email)) return redirect(withParams(callbackUrl(), { error: "invalid_request", state }));
      const code = randomToken();
      await ctx.runMutation(components.demoAuth.lib.createCode, {
        codeHash: await sha256Hex(code),
        clientId: DEMO_IDP_CLIENT_ID,
        redirectUri: callbackUrl(),
        codeChallenge: field("code_challenge"),
        // The subject is stable per email, so signing in again finds the same account.
        profile: { sub: `demo|${await sha256Hex(email)}`.slice(0, 37), name: field("name") || email, email, emailVerified: true },
      });
      return redirect(withParams(callbackUrl(), { code, state }));
    }),
  });

  // 2. Token endpoint: code + PKCE verifier + client secret → tokens.
  http.route({
    path: "/idp/token",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const form = await request.formData();
      const field = (name: string) => String(form.get(name) ?? "");
      if (field("grant_type") !== "authorization_code") return oauthError("unsupported_grant_type");
      if (field("client_id") !== DEMO_IDP_CLIENT_ID || field("client_secret") !== DEMO_IDP_CLIENT_SECRET) return oauthError("invalid_client", 401);
      const grant = await ctx.runMutation(components.demoAuth.lib.redeemCode, { codeHash: await sha256Hex(field("code")) });
      if (!grant || grant.clientId !== DEMO_IDP_CLIENT_ID || grant.redirectUri !== field("redirect_uri")) return oauthError("invalid_grant");
      if ((await pkceChallenge(field("code_verifier"))) !== grant.codeChallenge) return oauthError("invalid_grant");
      const accessToken = randomToken();
      await ctx.runMutation(components.demoAuth.lib.createAccessToken, { tokenHash: await sha256Hex(accessToken), profile: grant.profile });
      const now = Math.floor(Date.now() / 1000);
      const idToken = await signJwt({
        iss: siteOrigin(),
        aud: DEMO_IDP_CLIENT_ID,
        sub: grant.profile.sub,
        iat: now,
        exp: now + 300,
        name: grant.profile.name,
        email: grant.profile.email,
        email_verified: grant.profile.emailVerified,
      });
      return Response.json(
        { access_token: accessToken, token_type: "Bearer", expires_in: 600, id_token: idToken, scope: "openid profile email" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }),
  });

  // 3. Userinfo endpoint.
  http.route({
    path: "/idp/userinfo",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      const profile = await ctx.runQuery(components.demoAuth.lib.userInfo, { tokenHash: await sha256Hex(token) });
      if (!profile) return oauthError("invalid_token", 401);
      return Response.json({ sub: profile.sub, name: profile.name, email: profile.email, email_verified: profile.emailVerified });
    }),
  });

  // 4. The client's callback: exchange the code, check the id_token, hand the
  //    app a one-time ticket (`?convexAuthCode=`) it redeems with
  //    `completeSignInWithDemoIdp`.
  http.route({
    path: "/oauth/demo/callback",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const params = new URL(request.url).searchParams;
      const state = params.get("state") ?? "";
      const stateHash = await sha256Hex(state);
      const pending = state ? await ctx.runMutation(components.demoAuth.lib.claimRequest, { stateHash }) : null;
      // Without a pending request there is no trusted redirectTo: go home.
      if (!pending) return redirect(withParams(`${SITE_URL}/login`, { convexAuthError: "invalid_request" }));
      const error = params.get("error");
      if (error) return redirect(withParams(pending.redirectTo, { convexAuthError: error }));

      const tokenResponse = await fetch(`${siteOrigin()}/idp/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: params.get("code") ?? "",
          redirect_uri: callbackUrl(),
          client_id: DEMO_IDP_CLIENT_ID,
          client_secret: DEMO_IDP_CLIENT_SECRET,
          code_verifier: pending.codeVerifier,
        }),
      });
      if (!tokenResponse.ok) return redirect(withParams(pending.redirectTo, { convexAuthError: "server_error" }));
      const tokens = (await tokenResponse.json()) as { access_token: string; id_token: string };
      const claims = await verifyIdToken(tokens.id_token);
      if (!claims) return redirect(withParams(pending.redirectTo, { convexAuthError: "server_error" }));
      const userInfo = await fetch(`${siteOrigin()}/idp/userinfo`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const info = (await userInfo.json()) as { sub: string; name: string; email: string; email_verified: boolean };
      if (!userInfo.ok || info.sub !== claims.sub) return redirect(withParams(pending.redirectTo, { convexAuthError: "server_error" }));

      const ticket = randomToken();
      await ctx.runMutation(components.demoAuth.lib.createTicket, {
        ticketHash: await sha256Hex(ticket),
        stateHash,
        profile: { sub: info.sub, name: info.name, email: info.email, emailVerified: info.email_verified },
      });
      return redirect(withParams(pending.redirectTo, { convexAuthCode: ticket }));
    }),
  });
}
