import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createEngineerusMcpServer } from "../mcp/createServer";
import { createRemoteMcpHttpServer, main } from "../mcp/httpServer";
import { createGiveHintHandler } from "../mcp/tools/giveHint";

const INTERNAL_TOKEN = "internal-test-bearer-token-at-least-32-chars";
const ADMIN_SECRET = "personal-oauth-admin-secret-at-least-32-chars";
const SIGNING_SECRET = "personal-oauth-signing-secret-at-least-32-chars";
const CALLBACK = "https://chatgpt.com/connector_platform_oauth_redirect";

type StartedServer = Awaited<ReturnType<typeof startOAuthServer>>;

async function startOAuthServer(options: { now?: () => number; allowedRedirectUris?: string[] } = {}) {
  const giveHint = createGiveHintHandler(async () => "Use the governing law first.");
  const server = createRemoteMcpHttpServer({
    authToken: INTERNAL_TOKEN,
    createMcpServer: () => createEngineerusMcpServer(giveHint, { oauthEnabled: true }),
    oauth: {
      issuer: "https://engineerus-quest-mcp-private.onrender.com",
      resource: "https://engineerus-quest-mcp-private.onrender.com/mcp",
      adminSecret: ADMIN_SECRET,
      signingSecret: SIGNING_SECRET,
      allowedRedirectUris: options.allowedRedirectUris ?? [CALLBACK],
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
      grant_types: ["authorization_code", "refresh_token"],
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
  assert.equal(location.searchParams.get("iss"), "https://engineerus-quest-mcp-private.onrender.com");
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

async function refreshAccessToken(
  app: StartedServer,
  clientId: string,
  refreshToken: string,
  overrides: Record<string, string> = {},
) {
  return fetch(`${app.baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      resource: "https://engineerus-quest-mcp-private.onrender.com/mcp",
      scope: "mcp:tools",
      ...overrides,
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
  assert.deepEqual(metadata.grant_types_supported, ["authorization_code", "refresh_token"]);
  assert.equal(metadata.authorization_response_iss_parameter_supported, true);
});

test("OAuth discovery starts with no redirect allowlist while registration remains closed", async (t) => {
  const app = await startOAuthServer({ allowedRedirectUris: [] });
  t.after(app.close);

  const discovery = await fetch(`${app.baseUrl}/.well-known/oauth-authorization-server`);
  assert.equal(discovery.status, 200);

  const registration = await fetch(`${app.baseUrl}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [CALLBACK],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  assert.equal(registration.status, 400);
  assert.deepEqual(await registration.json(), { error: "invalid_redirect_uri" });

  const legacy = await mcpList(app, INTERNAL_TOKEN);
  assert.equal(legacy.status, 200);
});

test("OAuth DCR rejection logs only safe request metadata and the validation reason", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);
  const logs: string[] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => logs.push(values.map(String).join(" "));
  try {
    const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect_unlisted";
    const response = await fetch(`${app.baseUrl}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "ChatGPT plugin builder",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });
    assert.equal(response.status, 400);
  } finally {
    console.error = originalError;
  }

  const prefix = "OAuth DCR diagnostic: ";
  const diagnosticLog = logs.find((entry) => entry.startsWith(prefix));
  assert.ok(diagnosticLog);
  assert.ok(logs.includes("POST /oauth/register -> 400"));
  const diagnostic = JSON.parse(diagnosticLog.slice(prefix.length)) as Record<string, unknown>;
  assert.deepEqual(diagnostic, {
    received: true,
    status: 400,
    redirect_uris_count: 1,
    redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect_unlisted"],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_name: "ChatGPT plugin builder",
    validation_reason: "redirect_uri_not_allowlisted",
  });
  assert.doesNotMatch(logs.join("\n"), /authorization_header|access_token|refresh_token|cookie|client_secret|code_challenge/i);
});

test("OAuth startup validation reports a safe reason without reflecting secret material", () => {
  const logs: string[] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => logs.push(values.map(String).join(" "));
  try {
    const giveHint = createGiveHintHandler(async () => "Use the governing law first.");
    assert.throws(() => createRemoteMcpHttpServer({
      authToken: INTERNAL_TOKEN,
      createMcpServer: () => createEngineerusMcpServer(giveHint, { oauthEnabled: true }),
      oauth: {
        issuer: "https://engineerus-quest-mcp-private.onrender.com",
        resource: "https://engineerus-quest-mcp-private.onrender.com/mcp",
        adminSecret: "short-secret-material",
        signingSecret: SIGNING_SECRET,
        allowedRedirectUris: [],
      },
    }), /MCP OAuth secrets must contain at least 32 characters/);
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(logs, ["OAuth startup validation failed: MCP OAuth secrets must contain at least 32 characters."]);
  assert.doesNotMatch(logs.join("\n"), /short-secret-material/);
});

test("remote startup reports the give_hint phase safely when Groq credentials are missing", async () => {
  const keys = [
    "MCP_REMOTE_ENABLED",
    "MCP_AUTH_TOKEN",
    "MCP_PORT",
    "MCP_OAUTH_ENABLED",
    "MCP_PUBLIC_BASE_URL",
    "MCP_OAUTH_ADMIN_SECRET",
    "MCP_OAUTH_SIGNING_SECRET",
    "MCP_OAUTH_REDIRECT_URIS",
    "GROQ_API_KEY",
    "GROQ_API_KEY_2",
  ] as const;
  const saved = new Map(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    MCP_REMOTE_ENABLED: "true",
    MCP_AUTH_TOKEN: INTERNAL_TOKEN,
    MCP_PORT: "3100",
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_BASE_URL: "https://engineerus-quest-mcp-private.onrender.com",
    MCP_OAUTH_ADMIN_SECRET: ADMIN_SECRET,
    MCP_OAUTH_SIGNING_SECRET: SIGNING_SECRET,
    MCP_OAUTH_REDIRECT_URIS: "",
  });
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY_2;

  const logs: string[] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => logs.push(values.map(String).join(" "));
  try {
    await assert.rejects(main(), /requires an existing Groq credential/);
  } finally {
    console.error = originalError;
    for (const key of keys) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.ok(logs.includes("GROQ_API_KEY present: false."));
  assert.ok(logs.includes("GROQ_API_KEY_2 present: false."));
  assert.ok(logs.includes("MCP_REMOTE_ENABLED present: true."));
  assert.ok(logs.includes("Remote MCP enabled: true."));
  assert.ok(logs.includes("Creating give_hint handler..."));
  assert.ok(logs.includes("Startup failed during give_hint handler creation: The MCP server requires an existing Groq credential."));
  assert.doesNotMatch(logs.join("\n"), new RegExp(`${ADMIN_SECRET}|${SIGNING_SECRET}|${INTERNAL_TOKEN}`));
});

test("ChatGPT DCR payload is accepted and advertises authorization-code plus refresh-token grants", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);

  const response = await fetch(`${app.baseUrl}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "ChatGPT",
      redirect_uris: [CALLBACK],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  assert.equal(response.status, 201);
  const body = await response.json() as Record<string, unknown>;
  assert.deepEqual(body.grant_types, ["authorization_code", "refresh_token"]);

  const unsupported = await fetch(`${app.baseUrl}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [CALLBACK],
      grant_types: ["authorization_code", "password"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  assert.equal(unsupported.status, 400);
  assert.deepEqual(await unsupported.json(), { error: "invalid_client_metadata" });
});

test("authorization code exchange returns refresh token and PKCE access reaches MCP", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);
  const clientId = await registerClient(app);
  const pair = pkce();
  const code = await authorize(app, clientId, pair.challenge);
  const tokenResponse = await exchangeCode(app, clientId, code, pair.verifier);
  assert.equal(tokenResponse.status, 200);
  const tokenBody = await tokenResponse.json() as { access_token: string; refresh_token: string; token_type: string; scope: string };
  assert.equal(tokenBody.token_type, "Bearer");
  assert.equal(tokenBody.scope, "mcp:tools");
  assert.match(tokenBody.refresh_token, /^[A-Za-z0-9_.-]+$/);

  const toolsResponse = await mcpList(app, tokenBody.access_token);
  const tools = await readMcpPayload(toolsResponse);
  assert.equal(toolsResponse.status, 200);
  assert.deepEqual(tools.result.tools.map((tool: { name: string }) => tool.name), ["give_hint"]);
  assert.deepEqual(tools.result.tools[0]._meta.securitySchemes, [{ type: "oauth2", scopes: ["mcp:tools"] }]);
});

test("refresh grant rotates tokens, rejects replay, and refresh tokens cannot access MCP", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);
  const clientId = await registerClient(app);
  const pair = pkce();
  const code = await authorize(app, clientId, pair.challenge);
  const initial = await exchangeCode(app, clientId, code, pair.verifier);
  const initialBody = await initial.json() as { access_token: string; refresh_token: string };

  const refreshAsAccess = await mcpList(app, initialBody.refresh_token);
  assert.equal(refreshAsAccess.status, 401);
  const accessAsRefresh = await refreshAccessToken(app, clientId, initialBody.access_token);
  assert.equal(accessAsRefresh.status, 400);

  const rotated = await refreshAccessToken(app, clientId, initialBody.refresh_token);
  assert.equal(rotated.status, 200);
  const rotatedBody = await rotated.json() as { access_token: string; refresh_token: string; scope: string };
  assert.notEqual(rotatedBody.refresh_token, initialBody.refresh_token);
  assert.equal(rotatedBody.scope, "mcp:tools");
  assert.equal((await mcpList(app, rotatedBody.access_token)).status, 200);

  const replay = await refreshAccessToken(app, clientId, initialBody.refresh_token);
  assert.equal(replay.status, 400);
  assert.deepEqual(await replay.json(), { error: "invalid_grant" });
  const revokedFamily = await refreshAccessToken(app, clientId, rotatedBody.refresh_token);
  assert.equal(revokedFamily.status, 400);
  assert.deepEqual(await revokedFamily.json(), { error: "invalid_grant" });
});

test("concurrent refresh-token replay revokes the whole token family", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);
  const clientId = await registerClient(app);
  const pair = pkce();
  const code = await authorize(app, clientId, pair.challenge);
  const initial = await exchangeCode(app, clientId, code, pair.verifier);
  const initialBody = await initial.json() as { refresh_token: string };

  const attempts = await Promise.all([
    refreshAccessToken(app, clientId, initialBody.refresh_token),
    refreshAccessToken(app, clientId, initialBody.refresh_token),
  ]);
  assert.deepEqual(attempts.map((response) => response.status).sort(), [200, 400]);
  const successful = attempts.find((response) => response.status === 200)!;
  const rotated = await successful.json() as { refresh_token: string };

  const familyAfterReplay = await refreshAccessToken(app, clientId, rotated.refresh_token);
  assert.equal(familyAfterReplay.status, 400);
  assert.deepEqual(await familyAfterReplay.json(), { error: "invalid_grant" });
});

test("refresh grant rejects malformed, expired, wrong-client, wrong-resource, and wrong-scope tokens", async (t) => {
  let now = 1_800_000_000_000;
  const app = await startOAuthServer({ now: () => now });
  t.after(app.close);
  const clientId = await registerClient(app);
  const otherClientId = await registerClient(app);
  const pair = pkce();
  const code = await authorize(app, clientId, pair.challenge);
  const initial = await exchangeCode(app, clientId, code, pair.verifier);
  const body = await initial.json() as { refresh_token: string };

  assert.equal((await refreshAccessToken(app, clientId, "malformed-refresh-token")).status, 400);
  assert.equal((await refreshAccessToken(app, otherClientId, body.refresh_token)).status, 400);
  assert.equal((await refreshAccessToken(app, clientId, body.refresh_token, { resource: "https://attacker.example/mcp" })).status, 400);
  assert.equal((await refreshAccessToken(app, clientId, body.refresh_token, { scope: "mcp:admin" })).status, 400);

  now += 31 * 24 * 60 * 60 * 1_000;
  const expired = await refreshAccessToken(app, clientId, body.refresh_token);
  assert.equal(expired.status, 400);
  assert.deepEqual(await expired.json(), { error: "invalid_grant" });
});

test("safe authorization error redirects include the exact RFC 9207 issuer", async (t) => {
  const app = await startOAuthServer();
  t.after(app.close);
  const clientId = await registerClient(app);
  const pair = pkce();
  const query = new URLSearchParams({
    response_type: "token",
    client_id: clientId,
    redirect_uri: CALLBACK,
    code_challenge: pair.challenge,
    code_challenge_method: "S256",
    resource: "https://engineerus-quest-mcp-private.onrender.com/mcp",
    scope: "mcp:tools",
    state: "error-state",
  });

  const response = await fetch(`${app.baseUrl}/oauth/authorize?${query}`, { redirect: "manual" });
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.origin + location.pathname, CALLBACK);
  assert.equal(location.searchParams.get("error"), "invalid_request");
  assert.equal(location.searchParams.get("state"), "error-state");
  assert.equal(location.searchParams.get("iss"), "https://engineerus-quest-mcp-private.onrender.com");
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

test("DCR and authorization reject redirect URIs outside the exact configured allowlist", async (t) => {
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

  const clientId = await registerClient(app);
  const pair = pkce();
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "https://attacker.example/callback",
    code_challenge: pair.challenge,
    code_challenge_method: "S256",
    resource: "https://engineerus-quest-mcp-private.onrender.com/mcp",
    scope: "mcp:tools",
    state: "mismatch-state",
  });
  const authorization = await fetch(`${app.baseUrl}/oauth/authorize?${query}`, { redirect: "manual" });
  assert.equal(authorization.status, 400);
  assert.equal(authorization.headers.get("location"), null);
  assert.deepEqual(await authorization.json(), { error: "invalid_request" });
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
    redirect: "manual",
  });
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.searchParams.get("error"), "access_denied");
  assert.equal(location.searchParams.get("iss"), "https://engineerus-quest-mcp-private.onrender.com");
  assert.doesNotMatch(location.toString(), /wrong-secret|personal-oauth|stack|access_token|authorization code/i);
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
    redirect: "manual",
  });

  for (let index = 0; index < 5; index += 1) {
    const denied = await request();
    assert.equal(denied.status, 302);
    const location = new URL(denied.headers.get("location")!);
    assert.equal(location.searchParams.get("error"), "access_denied");
    assert.equal(location.searchParams.get("iss"), "https://engineerus-quest-mcp-private.onrender.com");
  }
  const blocked = await request();
  assert.equal(blocked.status, 302);
  assert.match(blocked.headers.get("retry-after") ?? "", /^\d+$/);
  const blockedLocation = new URL(blocked.headers.get("location")!);
  assert.equal(blockedLocation.searchParams.get("error"), "temporarily_unavailable");
  assert.equal(blockedLocation.searchParams.get("iss"), "https://engineerus-quest-mcp-private.onrender.com");
  assert.doesNotMatch(blockedLocation.toString(), /wrong-secret|personal-oauth|stack/i);
});
