import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { jwtVerify, SignJWT } from "jose";

const OAUTH_SCOPE = "mcp:tools";
const AUTHORIZATION_CODE_TTL_MS = 120_000;
const ACCESS_TOKEN_TTL_SECONDS = 900;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_OAUTH_BODY_SIZE = 16 * 1024;
const MAX_REGISTERED_CLIENTS = 100;
const MAX_PENDING_CODES = 100;
const MAX_ACTIVE_REFRESH_TOKENS = 100;
const MIN_SECRET_LENGTH = 32;
const MAX_FAILED_APPROVALS = 5;
const APPROVAL_WINDOW_MS = 5 * 60_000;

export type PersonalOAuthConfig = {
  issuer: string;
  resource: string;
  adminSecret: string;
  signingSecret: string;
  allowedRedirectUris: string[];
  now?: () => number;
};

type RegisteredClient = {
  clientId: string;
  redirectUris: string[];
};

type AuthorizationCode = {
  clientId: string;
  redirectUri: string;
  resource: string;
  scope: string;
  codeChallenge: string;
  expiresAt: number;
};

type RefreshTokenRecord = {
  clientId: string;
  resource: string;
  scope: string;
  familyId: string;
  expiresAt: number;
};

type ValidAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  resource: string;
  scope: string;
  state: string;
  codeChallenge: string;
};

type SafeAuthorizationRedirect = {
  redirectUri: string;
  state: string;
};

export type PersonalOAuthServer = {
  challenge: string;
  handleRequest: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  verifyAccessToken: (token: string) => Promise<boolean>;
};

function json(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function safeEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function validateHttpsUrl(value: string, name: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be a canonical HTTPS URL.`);
  }
  return url.toString().replace(/\/$/, "");
}

function validateRedirectUri(value: string): string {
  const url = new URL(value);
  const local = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.hash) {
    throw new Error("OAuth redirect URIs must use HTTPS or loopback HTTP.");
  }
  return url.toString();
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const declaredLength = Number(req.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_OAUTH_BODY_SIZE) {
    throw new Error("body_too_large");
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_OAUTH_BODY_SIZE) throw new Error("body_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function contentType(req: IncomingMessage): string {
  return String(req.headers["content-type"] ?? "").split(";", 1)[0]!.trim().toLowerCase();
}

function safeDiagnosticStrings(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((item) => typeof item === "string" ? item.slice(0, 256) : "<non-string>");
}

function safeDiagnosticRedirectUris(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((item) => {
    if (typeof item !== "string") return "<non-string>";
    try {
      const url = new URL(item);
      if (url.username || url.password || url.search || url.hash || item.length > 2_048) {
        return "<redacted-noncanonical-uri>";
      }
      return item;
    } catch {
      return "<invalid-uri>";
    }
  });
}

function logDcrDiagnostic(status: number, reason: string, body: Record<string, unknown> = {}): void {
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  console.error(`OAuth DCR diagnostic: ${JSON.stringify({
    received: true,
    status,
    redirect_uris_count: redirectUris.length,
    redirect_uris: safeDiagnosticRedirectUris(redirectUris),
    grant_types: safeDiagnosticStrings(body.grant_types ?? ["authorization_code"]),
    response_types: safeDiagnosticStrings(body.response_types ?? ["code"]),
    token_endpoint_auth_method: typeof body.token_endpoint_auth_method === "string"
      ? body.token_endpoint_auth_method.slice(0, 100)
      : "none",
    client_name: typeof body.client_name === "string" ? body.client_name.slice(0, 100) : null,
    validation_reason: reason,
  })}`);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

function renderApprovalPage(res: ServerResponse, request: ValidAuthorizationRequest): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  const fields: Record<string, string> = {
    response_type: "code",
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    resource: request.resource,
    scope: request.scope,
    state: request.state,
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
  };
  const hidden = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("");
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize Engineerus Quest</title><style>body{font:16px system-ui;max-width:38rem;margin:4rem auto;padding:0 1rem}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{margin-top:.5rem;padding:.75rem}button{margin-top:1rem}</style><h1>Authorize Engineerus Quest</h1><p>Allow this client to use the guided engineering hint tool.</p><form method="post" action="/oauth/authorize">${hidden}<label>Personal authorization secret<input type="password" name="approval_secret" autocomplete="current-password" required></label><button type="submit">Authorize</button></form></html>`);
}

function parseAuthorizationRequest(
  params: URLSearchParams,
  clients: Map<string, RegisteredClient>,
  allowedRedirectUris: Set<string>,
  expectedResource: string,
): ValidAuthorizationRequest | null {
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const resource = params.get("resource") ?? "";
  const scope = params.get("scope") ?? "";
  const state = params.get("state") ?? "";
  const codeChallenge = params.get("code_challenge") ?? "";
  const client = clients.get(clientId);

  if (
    params.get("response_type") !== "code"
    || params.get("code_challenge_method") !== "S256"
    || !client
    || !client.redirectUris.includes(redirectUri)
    || !allowedRedirectUris.has(redirectUri)
    || resource !== expectedResource
    || scope !== OAUTH_SCOPE
    || state.length < 1
    || state.length > 512
    || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
  ) return null;

  return { clientId, redirectUri, resource, scope, state, codeChallenge };
}

function findSafeAuthorizationRedirect(
  params: URLSearchParams,
  clients: Map<string, RegisteredClient>,
  allowedRedirectUris: Set<string>,
): SafeAuthorizationRedirect | null {
  const client = clients.get(params.get("client_id") ?? "");
  const redirectUri = params.get("redirect_uri") ?? "";
  if (!client || !client.redirectUris.includes(redirectUri) || !allowedRedirectUris.has(redirectUri)) return null;
  const state = params.get("state") ?? "";
  return { redirectUri, state: state.length <= 512 ? state : "" };
}

function redirectAuthorizationResponse(
  res: ServerResponse,
  issuer: string,
  redirectUri: string,
  params: { code?: string; error?: string; state?: string },
): void {
  const redirect = new URL(redirectUri);
  if (params.code) redirect.searchParams.set("code", params.code);
  if (params.error) redirect.searchParams.set("error", params.error);
  if (params.state) redirect.searchParams.set("state", params.state);
  redirect.searchParams.set("iss", issuer);
  res.statusCode = 302;
  res.setHeader("Location", redirect.toString());
  res.end();
}

function keepMapBounded<K, V>(map: Map<K, V>, maximum: number): void {
  while (map.size >= maximum) {
    const oldest = map.keys().next().value as K | undefined;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export function createPersonalOAuthServer(config: PersonalOAuthConfig): PersonalOAuthServer {
  const issuer = validateHttpsUrl(config.issuer, "MCP OAuth issuer");
  const resource = validateHttpsUrl(config.resource, "MCP OAuth resource");
  if (config.adminSecret.length < MIN_SECRET_LENGTH || config.signingSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`MCP OAuth secrets must contain at least ${MIN_SECRET_LENGTH} characters.`);
  }
  const allowedRedirectUris = new Set(config.allowedRedirectUris.map(validateRedirectUri));
  if (allowedRedirectUris.size !== config.allowedRedirectUris.length) {
    throw new Error("MCP OAuth redirect URIs must be unique.");
  }

  const now = config.now ?? Date.now;
  const signingKey = new TextEncoder().encode(config.signingSecret);
  const clients = new Map<string, RegisteredClient>();
  const codes = new Map<string, AuthorizationCode>();
  const activeRefreshTokens = new Map<string, RefreshTokenRecord>();
  const activeRefreshTokenByFamily = new Map<string, string>();
  let failedApprovals: number[] = [];
  const metadataUrl = `${issuer}/.well-known/oauth-protected-resource`;
  const challenge = `Bearer resource_metadata="${metadataUrl}", scope="${OAUTH_SCOPE}"`;

  function pruneCodes(): void {
    const current = now();
    for (const [digest, record] of codes) {
      if (record.expiresAt <= current) codes.delete(digest);
    }
  }

  function pruneRefreshTokens(): void {
    const current = now();
    for (const [jti, record] of activeRefreshTokens) {
      if (record.expiresAt <= current) {
        activeRefreshTokens.delete(jti);
        if (activeRefreshTokenByFamily.get(record.familyId) === jti) {
          activeRefreshTokenByFamily.delete(record.familyId);
        }
      }
    }
  }

  function keepRefreshTokensBounded(): void {
    while (activeRefreshTokens.size >= MAX_ACTIVE_REFRESH_TOKENS) {
      const oldestJti = activeRefreshTokens.keys().next().value as string | undefined;
      if (!oldestJti) break;
      const record = activeRefreshTokens.get(oldestJti);
      activeRefreshTokens.delete(oldestJti);
      if (record && activeRefreshTokenByFamily.get(record.familyId) === oldestJti) {
        activeRefreshTokenByFamily.delete(record.familyId);
      }
    }
  }

  function revokeRefreshFamily(familyId: string): void {
    const activeJti = activeRefreshTokenByFamily.get(familyId);
    if (activeJti) activeRefreshTokens.delete(activeJti);
    activeRefreshTokenByFamily.delete(familyId);
  }

  async function issueAccessToken(scope: string): Promise<string> {
    const issuedAt = Math.floor(now() / 1_000);
    return new SignJWT({ scope, token_use: "access" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(issuer)
      .setAudience(resource)
      .setSubject("engineerus-personal-owner")
      .setJti(randomBytes(16).toString("base64url"))
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
      .sign(signingKey);
  }

  async function issueRefreshToken(record: Omit<RefreshTokenRecord, "expiresAt">): Promise<{ token: string; jti: string; expiresAt: number }> {
    const issuedAt = Math.floor(now() / 1_000);
    const expiresAt = (issuedAt + REFRESH_TOKEN_TTL_SECONDS) * 1_000;
    const jti = randomBytes(16).toString("base64url");
    const token = await new SignJWT({
      scope: record.scope,
      token_use: "refresh",
      client_id: record.clientId,
      family_id: record.familyId,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(issuer)
      .setAudience(record.resource)
      .setSubject("engineerus-personal-owner")
      .setJti(jti)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + REFRESH_TOKEN_TTL_SECONDS)
      .sign(signingKey);
    return { token, jti, expiresAt };
  }

  function storeActiveRefreshToken(jti: string, record: RefreshTokenRecord): void {
    pruneRefreshTokens();
    keepRefreshTokensBounded();
    activeRefreshTokens.set(jti, record);
    activeRefreshTokenByFamily.set(record.familyId, jti);
  }

  async function handleRegistration(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST" || contentType(req) !== "application/json") {
      logDcrDiagnostic(400, "invalid_method_or_content_type");
      json(res, 400, { error: "invalid_client_metadata" });
      return;
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse((await readBody(req)).toString("utf8")) as Record<string, unknown>;
    } catch {
      logDcrDiagnostic(400, "invalid_json_or_body_size");
      json(res, 400, { error: "invalid_client_metadata" });
      return;
    }

    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    const grants = body.grant_types ?? ["authorization_code"];
    const responses = body.response_types ?? ["code"];
    if (redirectUris.length < 1 || redirectUris.length > 5) {
      logDcrDiagnostic(400, "redirect_uri_count_out_of_range", body);
      json(res, 400, { error: "invalid_redirect_uri" });
      return;
    }
    if (redirectUris.some((uri) => typeof uri !== "string")) {
      logDcrDiagnostic(400, "redirect_uri_type_invalid", body);
      json(res, 400, { error: "invalid_redirect_uri" });
      return;
    }
    if (redirectUris.some((uri) => !allowedRedirectUris.has(uri as string))) {
      logDcrDiagnostic(400, "redirect_uri_not_allowlisted", body);
      json(res, 400, { error: "invalid_redirect_uri" });
      return;
    }
    if (
      !Array.isArray(grants)
      || grants.length !== 2
      || new Set(grants).size !== 2
      || !grants.includes("authorization_code")
      || !grants.includes("refresh_token")
    ) {
      logDcrDiagnostic(400, "grant_types_invalid", body);
      json(res, 400, { error: "invalid_client_metadata" });
      return;
    }
    if (!Array.isArray(responses) || responses.length !== 1 || responses[0] !== "code") {
      logDcrDiagnostic(400, "response_types_invalid", body);
      json(res, 400, { error: "invalid_client_metadata" });
      return;
    }
    if ((body.token_endpoint_auth_method ?? "none") !== "none") {
      logDcrDiagnostic(400, "token_endpoint_auth_method_invalid", body);
      json(res, 400, { error: "invalid_client_metadata" });
      return;
    }

    if (clients.size >= MAX_REGISTERED_CLIENTS) {
      logDcrDiagnostic(429, "registration_capacity_exceeded", body);
      res.setHeader("Retry-After", "60");
      json(res, 429, { error: "temporarily_unavailable" });
      return;
    }
    const clientId = `mcp_${randomBytes(24).toString("base64url")}`;
    clients.set(clientId, { clientId, redirectUris: redirectUris as string[] });
    logDcrDiagnostic(201, "accepted", body);
    json(res, 201, {
      client_id: clientId,
      client_id_issued_at: Math.floor(now() / 1_000),
      client_name: typeof body.client_name === "string" ? body.client_name.slice(0, 100) : "MCP client",
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: OAUTH_SCOPE,
    });
  }

  async function handleAuthorize(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    let params = url.searchParams;
    let approvalSecret: string | null = null;
    if (req.method === "POST") {
      if (contentType(req) !== "application/x-www-form-urlencoded") {
        json(res, 400, { error: "invalid_request" });
        return;
      }
      try {
        params = new URLSearchParams((await readBody(req)).toString("utf8"));
      } catch {
        json(res, 400, { error: "invalid_request" });
        return;
      }
      approvalSecret = params.get("approval_secret");
    } else if (req.method !== "GET") {
      json(res, 405, { error: "invalid_request" });
      return;
    }

    const request = parseAuthorizationRequest(params, clients, allowedRedirectUris, resource);
    if (!request) {
      const safeRedirect = findSafeAuthorizationRedirect(params, clients, allowedRedirectUris);
      if (safeRedirect) {
        redirectAuthorizationResponse(res, issuer, safeRedirect.redirectUri, {
          error: "invalid_request",
          state: safeRedirect.state,
        });
      } else {
        json(res, 400, { error: "invalid_request" });
      }
      return;
    }
    if (req.method === "GET") {
      renderApprovalPage(res, request);
      return;
    }
    const current = now();
    failedApprovals = failedApprovals.filter((timestamp) => current - timestamp < APPROVAL_WINDOW_MS);
    if (failedApprovals.length >= MAX_FAILED_APPROVALS) {
      const retryAfter = Math.max(1, Math.ceil(((failedApprovals[0] ?? current) + APPROVAL_WINDOW_MS - current) / 1_000));
      res.setHeader("Retry-After", String(retryAfter));
      redirectAuthorizationResponse(res, issuer, request.redirectUri, {
        error: "temporarily_unavailable",
        state: request.state,
      });
      return;
    }
    if (!approvalSecret || !safeEquals(approvalSecret, config.adminSecret)) {
      failedApprovals.push(current);
      redirectAuthorizationResponse(res, issuer, request.redirectUri, {
        error: "access_denied",
        state: request.state,
      });
      return;
    }
    failedApprovals = [];

    pruneCodes();
    keepMapBounded(codes, MAX_PENDING_CODES);
    const code = randomBytes(32).toString("base64url");
    codes.set(sha256(code), {
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      resource: request.resource,
      scope: request.scope,
      codeChallenge: request.codeChallenge,
      expiresAt: now() + AUTHORIZATION_CODE_TTL_MS,
    });
    redirectAuthorizationResponse(res, issuer, request.redirectUri, { code, state: request.state });
  }

  async function handleToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST" || contentType(req) !== "application/x-www-form-urlencoded") {
      json(res, 400, { error: "invalid_request" });
      return;
    }
    let params: URLSearchParams;
    try {
      params = new URLSearchParams((await readBody(req)).toString("utf8"));
    } catch {
      json(res, 400, { error: "invalid_request" });
      return;
    }
    const grantType = params.get("grant_type");
    if (grantType !== "authorization_code" && grantType !== "refresh_token") {
      json(res, 400, { error: "unsupported_grant_type" });
      return;
    }

    if (grantType === "refresh_token") {
      const refreshToken = params.get("refresh_token") ?? "";
      try {
        pruneRefreshTokens();
        const { payload } = await jwtVerify(refreshToken, signingKey, {
          algorithms: ["HS256"],
          issuer,
          audience: resource,
          currentDate: new Date(now()),
        });
        const jti = payload.jti ?? "";
        const familyId = typeof payload.family_id === "string" ? payload.family_id : "";
        const record = activeRefreshTokens.get(jti);
        const requestedScope = params.get("scope");
        if (
          payload.token_use !== "refresh"
          || payload.sub !== "engineerus-personal-owner"
          || typeof payload.client_id !== "string"
          || typeof payload.scope !== "string"
          || !jti
          || !familyId
          || !clients.has(payload.client_id)
          || params.get("client_id") !== payload.client_id
          || params.get("resource") !== resource
          || (requestedScope !== null && requestedScope !== payload.scope)
        ) {
          json(res, 400, { error: "invalid_grant" });
          return;
        }
        if (!record) {
          revokeRefreshFamily(familyId);
          json(res, 400, { error: "invalid_grant" });
          return;
        }
        if (
          payload.client_id !== record.clientId
          || payload.scope !== record.scope
          || familyId !== record.familyId
          || record.resource !== resource
        ) {
          json(res, 400, { error: "invalid_grant" });
          return;
        }

        const [nextRefresh, accessToken] = await Promise.all([
          issueRefreshToken({
            clientId: record.clientId,
            resource: record.resource,
            scope: record.scope,
            familyId: record.familyId,
          }),
          issueAccessToken(record.scope),
        ]);
        if (
          activeRefreshTokens.get(jti) !== record
          || activeRefreshTokenByFamily.get(record.familyId) !== jti
        ) {
          revokeRefreshFamily(record.familyId);
          json(res, 400, { error: "invalid_grant" });
          return;
        }
        activeRefreshTokens.delete(jti);
        activeRefreshTokenByFamily.delete(record.familyId);
        storeActiveRefreshToken(nextRefresh.jti, {
          clientId: record.clientId,
          resource: record.resource,
          scope: record.scope,
          familyId: record.familyId,
          expiresAt: nextRefresh.expiresAt,
        });
        json(res, 200, {
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: ACCESS_TOKEN_TTL_SECONDS,
          scope: record.scope,
          refresh_token: nextRefresh.token,
        });
      } catch {
        json(res, 400, { error: "invalid_grant" });
      }
      return;
    }

    pruneCodes();
    const code = params.get("code") ?? "";
    const digest = sha256(code);
    const record = codes.get(digest);
    codes.delete(digest);
    const verifier = params.get("code_verifier") ?? "";
    if (
      !record
      || record.expiresAt <= now()
      || params.get("client_id") !== record.clientId
      || params.get("redirect_uri") !== record.redirectUri
      || params.get("resource") !== record.resource
      || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)
      || !safeEquals(sha256(verifier), record.codeChallenge)
    ) {
      json(res, 400, { error: "invalid_grant" });
      return;
    }

    const familyId = randomBytes(16).toString("base64url");
    const refreshToken = await issueRefreshToken({
      clientId: record.clientId,
      resource: record.resource,
      scope: record.scope,
      familyId,
    });
    storeActiveRefreshToken(refreshToken.jti, {
      clientId: record.clientId,
      resource: record.resource,
      scope: record.scope,
      familyId,
      expiresAt: refreshToken.expiresAt,
    });
    json(res, 200, {
      access_token: await issueAccessToken(record.scope),
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: record.scope,
      refresh_token: refreshToken.token,
    });
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", issuer);
    if (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/.well-known/oauth-protected-resource/mcp") {
      if (req.method !== "GET") {
        json(res, 405, { error: "method_not_allowed" });
      } else {
        json(res, 200, {
          resource,
          authorization_servers: [issuer],
          scopes_supported: [OAUTH_SCOPE],
          bearer_methods_supported: ["header"],
          resource_name: "Engineerus Quest MCP",
        });
      }
      return true;
    }
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      if (req.method !== "GET") {
        json(res, 405, { error: "method_not_allowed" });
      } else {
        json(res, 200, {
          issuer,
          authorization_endpoint: `${issuer}/oauth/authorize`,
          token_endpoint: `${issuer}/oauth/token`,
          registration_endpoint: `${issuer}/oauth/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          token_endpoint_auth_methods_supported: ["none"],
          code_challenge_methods_supported: ["S256"],
          scopes_supported: [OAUTH_SCOPE],
          authorization_response_iss_parameter_supported: true,
        });
      }
      return true;
    }
    if (url.pathname === "/oauth/register") {
      await handleRegistration(req, res);
      return true;
    }
    if (url.pathname === "/oauth/authorize") {
      await handleAuthorize(req, res, url);
      return true;
    }
    if (url.pathname === "/oauth/token") {
      await handleToken(req, res);
      return true;
    }
    return false;
  }

  async function verifyAccessToken(token: string): Promise<boolean> {
    try {
      const { payload } = await jwtVerify(token, signingKey, {
        algorithms: ["HS256"],
        issuer,
        audience: resource,
        currentDate: new Date(now()),
      });
      const scopes = typeof payload.scope === "string" ? payload.scope.split(/\s+/) : [];
      return payload.token_use === "access"
        && payload.sub === "engineerus-personal-owner"
        && scopes.includes(OAUTH_SCOPE);
    } catch {
      return false;
    }
  }

  return { challenge, handleRequest, verifyAccessToken };
}

export const personalOAuthScope = OAUTH_SCOPE;
