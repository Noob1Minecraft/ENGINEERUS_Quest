import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createEngineerusMcpServer } from "../mcp/createServer";
import { createRemoteMcpHttpServer } from "../mcp/httpServer";
import { createGiveHintHandler } from "../mcp/tools/giveHint";

const INTERNAL_TOKEN = "internal-test-bearer-token-at-least-32-chars";
const ADMIN_SECRET = "personal-oauth-admin-secret-at-least-32-chars";
const SIGNING_SECRET = "personal-oauth-signing-secret-at-least-32-chars";
const CALLBACK = "https://chatgpt.com/connector/oauth/test-callback";

type StartedServer = Awaited<ReturnType<typeof startOAuthServer>>;

async function startOAuthServer(options: { now?: () => number } = {}) {
  const giveHint = createGiveHintHandler(async () => "Use the governing law first.");
  const server = createRemoteMcpHttpServer({
    authToken: INTERNAL_TOKEN,
    createMcpServer: () => createEngineerusMcpServer(giveHint, { oauthEnabled: true }),
    oauth: {
      issuer: "https://engineerus-quest-mcp-private.onrender.com",
      resource: "https://engineerus-quest-mcp-private.onrender.com/mcp",
      adminSecret: ADMIN_SECRET,
      signingSecret: SIGNING_SECRET,
      allowedRedirectUris: [CALLBACK],
      now: options.now,
    },
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function registerClient(app: StartedServer, redirectUri = CALLBACK): Promise<string> {
  const response = await fetch(`${app.baseUrl}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "ChatGPT personal test",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  assert.equal(response.status, 201);
  const body = await response.json() as { client_id: string };
  return body.client_id;
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

async function authorize(app: StartedServer, clientId: string, challenge: string) {
  const form = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CALLBACK,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: "https://engineerus-quest-mcp-private.onrender.com/mcp",
    scope: "mcp:tools",
    state: "opaque-test-state",
    approval_secret: ADMIN_SECRET,
  });
  const response = await fetch(`${app.baseUrl}/oauth/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
    redirect: "manual",
  });
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.origin + location.pathname, CALLBACK);
  assert.equal(location.searchParams.get("state"), "opaque-test-state");
  return location.searchParams.get("code")!;
}

async function exchangeCode(app: StartedServer, clientId: string, code: string, verifier: string) {
  return fetch(`${app.baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: CALLBACK,
      resource: "https://engineerus-quest-mcp-private.onrender.com/mcp",
    }),
  });
}

async function mcpList(app: StartedServer, token?: string) {
  const headers: Record<string, string> = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(`${app.baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
}

async function readMcpPayload(response: Response): Promise<Record<string, any>> {
  const body = await response.text();
  const data = response.headers.get("content-type")?.includes("text/event-stream")
    ? body.split(/\r?\n/).find((line) => line.startsWith("data: "))?.slice(6)
    : body;
  return JSON.parse(data ?? "{}") as Record<string, any>;
}

test("OAuth discovery advertises protected resource, authorization endpoints, scope, and PKCE S256", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);

  const resourceResponse = await fetch(`${app.baseUrl}/.well-known/oauth-protected-resource`);
  const authResponse = await fetch(`${app.baseUrl}/.well-known/oauth-authorization-server`);
  assert.equal(resourceResponse.status, 200);
  assert.equal(authResponse.status, 200);

  const resource = await resourceResponse.json() as Record<string, unknown>;
  const metadata = await authResponse.json() as Record<string, unknown>;
  assert.equal(resource.resource, "https://engineerus-quest-mcp-private.onrender.com/mcp");
  assert.deepEqual(resource.authorization_servers, ["https://engineerus-quest-mcp-private.onrender.com"]);
  assert.deepEqual(resource.scopes_supported, ["mcp:tools"]);
  assert.equal(metadata.authorization_endpoint, "https://engineerus-quest-mcp-private.onrender.com/oauth/authorize");
  assert.equal(metadata.token_endpoint, "https://engineerus-quest-mcp-private.onrender.com/oauth/token");
  assert.equal(metadata.registration_endpoint, "https://engineerus-quest-mcp-private.onrender.com/oauth/register");
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ["none"]);
});

test("valid DCR, personal approval, and PKCE token reach the protected MCP tool list", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);
  const clientId = await registerClient(app);
  const pair = pkce();
  const code = await authorize(app, clientId, pair.challenge);
  const tokenResponse = await exchangeCode(app, clientId, code, pair.verifier);
  assert.equal(tokenResponse.status, 200);
  const tokenBody = await tokenResponse.json() as { access_token: string; token_type: string; scope: string };
  assert.equal(tokenBody.token_type, "Bearer");
  assert.equal(tokenBody.scope, "mcp:tools");

  const toolsResponse = await mcpList(app, tokenBody.access_token);
  const tools = await readMcpPayload(toolsResponse);
  assert.equal(toolsResponse.status, 200);
  assert.deepEqual(tools.result.tools.map((tool: { name: string }) => tool.name), ["give_hint"]);
  assert.deepEqual(tools.result.tools[0]._meta.securitySchemes, [{ type: "oauth2", scopes: ["mcp:tools"] }]);
});

test("authorization endpoint renders a protected approval form without embedding secrets", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);
  const clientId = await registerClient(app);
  const pair = pkce();
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CALLBACK,
    code_challenge: pair.challenge,
    code_challenge_method: "S256",
    resource: "https://engineerus-quest-mcp-private.onrender.com/mcp",
    scope: "mcp:tools",
    state: "opaque-test-state",
  });

  const response = await fetch(`${app.baseUrl}/oauth/authorize?${query}`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /Authorize Engineerus Quest/);
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.doesNotMatch(body, /personal-oauth-admin|personal-oauth-signing/);
});

test("invalid PKCE is rejected and the one-time authorization code cannot be retried", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);
  const clientId = await registerClient(app);
  const pair = pkce();
  const code = await authorize(app, clientId, pair.challenge);

  const invalid = await exchangeCode(app, clientId, code, `${pair.verifier}wrong`);
  const replay = await exchangeCode(app, clientId, code, pair.verifier);
  assert.equal(invalid.status, 400);
  assert.equal(replay.status, 400);
  assert.deepEqual(await invalid.json(), { error: "invalid_grant" });
});

test("DCR rejects redirect URIs outside the exact configured allowlist", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);
  const response = await fetch(`${app.baseUrl}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      redirect_uris: ["https://attacker.example/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_redirect_uri" });
});

test("expired authorization codes are rejected", async (t) => {
  let now = 1_800_000_000_000;
  const app = await startOAuthServer({ now: () => now });
  t.after(app.close);
  const clientId = await registerClient(app);
  const pair = pkce();
  const code = await authorize(app, clientId, pair.challenge);
  now += 121_000;

  const response = await exchangeCode(app, clientId, code, pair.verifier);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_grant" });
});

test("unknown authorization codes are rejected without diagnostic detail", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);
  const clientId = await registerClient(app);
  const pair = pkce();
  const response = await exchangeCode(app, clientId, "unknown-code-material", pair.verifier);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_grant" });
});

test("unauthenticated MCP requests advertise OAuth discovery and legacy bearer auth still works", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);

  const missing = await mcpList(app);
  const legacy = await mcpList(app, INTERNAL_TOKEN);
  assert.equal(missing.status, 401);
  assert.match(missing.headers.get("www-authenticate") ?? "", /resource_metadata="https:\/\/engineerus-quest-mcp-private\.onrender\.com\/\.well-known\/oauth-protected-resource"/);
  assert.match(missing.headers.get("www-authenticate") ?? "", /scope="mcp:tools"/);
  assert.equal(legacy.status, 200);
});

test("OAuth errors never expose approval, signing, authorization-code, or access-token material", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);
  const clientId = await registerClient(app);
  const pair = pkce();
  const response = await fetch(`${app.baseUrl}/oauth/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: CALLBACK,
      code_challenge: pair.challenge,
      code_challenge_method: "S256",
      resource: "https://engineerus-quest-mcp-private.onrender.com/mcp",
      scope: "mcp:tools",
      state: "opaque-state",
      approval_secret: "wrong-secret-that-must-not-appear",
    }),
  });
  const body = await response.text();
  assert.equal(response.status, 401);
  assert.doesNotMatch(body, /wrong-secret|personal-oauth|stack|access_token|authorization code/i);
});

test("personal authorization attempts are bounded without reflecting submitted secrets", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);
  const clientId = await registerClient(app);
  const pair = pkce();
  const request = () => fetch(`${app.baseUrl}/oauth/authorize`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: CALLBACK,
      code_challenge: pair.challenge,
      code_challenge_method: "S256",
      resource: "https://engineerus-quest-mcp-private.onrender.com/mcp",
      scope: "mcp:tools",
      state: "opaque-state",
      approval_secret: "wrong-secret-that-must-not-appear",
    }),
  });

  for (let index = 0; index < 5; index += 1) assert.equal((await request()).status, 401);
  const blocked = await request();
  assert.equal(blocked.status, 429);
  assert.match(blocked.headers.get("retry-after") ?? "", /^\d+$/);
  assert.doesNotMatch(await blocked.text(), /wrong-secret|personal-oauth|stack/i);
});
