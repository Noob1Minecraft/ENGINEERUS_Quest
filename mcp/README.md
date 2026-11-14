# Engineerus Quest MCP prototype

This directory contains an isolated Model Context Protocol server for Engineerus Quest. It supports local stdio and an opt-in Streamable HTTP transport. Remote HTTP can use the original private bearer token or an opt-in OAuth 2.1 authorization-code flow for personal ChatGPT testing. All modes expose the same single tool:

## `give_hint`

Input:

```json
{
  "problem": "U = 12 V, R = 4 Ohm. Find I.",
  "language": "en"
}
```

`language` must be `en`, `ru`, or `kk`. The tool validates the input, applies the existing engineering-domain policy, selects the existing Tutor `hint` mode, and calls the same two-pass Tutor pipeline used by the application. The existing calculation verifier, uncertainty fallback, multilingual behavior, and final-answer leakage protection therefore remain authoritative. This prototype does not read or persist chats, documents, images, profiles, or user sessions.

## Environment

The MCP process reuses the backend's existing environment variables:

- `GROQ_API_KEY` or `GROQ_API_KEY_2` (at least one is required)
- `GROQ_MODEL` (optional; the existing backend default is used when omitted)

Keep these values in the normal local secret environment or an untracked `.env` file. Do not put credentials in MCP client configuration committed to source control. The tool never returns credentials, prompts, provider metadata, internal errors, or stack traces.

Remote HTTP mode additionally uses:

- `MCP_REMOTE_ENABLED=true` — explicit opt-in; remote mode is disabled by default.
- `MCP_AUTH_TOKEN` — a private bearer token containing at least 32 characters.
- `MCP_PORT` — optional local port; when omitted, `PORT` is used, then `3100`.

The bearer token is a temporary boundary for private/personal testing. Store it in a secret manager or untracked local environment only.

OAuth mode is disabled by default and additionally uses:

- `MCP_OAUTH_ENABLED=true` — explicit OAuth opt-in.
- `MCP_PUBLIC_BASE_URL` — the canonical HTTPS service origin, without `/mcp`.
- `MCP_OAUTH_ADMIN_SECRET` — a random personal authorization secret of at least 32 characters.
- `MCP_OAUTH_SIGNING_SECRET` — a different random signing secret of at least 32 characters.
- `MCP_OAUTH_REDIRECT_URIS` — exact comma-separated callback URI(s) shown in ChatGPT's MCP management page; wildcards are not accepted.

The OAuth access token is restricted to the canonical `${MCP_PUBLIC_BASE_URL}/mcp` resource and the single `mcp:tools` scope. Do not reuse either OAuth secret as `MCP_AUTH_TOKEN` or as a Groq credential.

## Run locally

Install the repository dependencies, configure the existing Groq environment variables, then run:

```powershell
npm run mcp:start
```

The server uses stdio transport. Configure an MCP host to launch the command above from the repository root. Stdout is reserved for MCP protocol frames; startup failures are reported generically on stderr.

## Run remote HTTP locally

After configuring the existing Groq key plus the remote MCP variables, run:

```powershell
$env:MCP_REMOTE_ENABLED = "true"
$env:MCP_AUTH_TOKEN = "<a-random-private-token-of-at-least-32-characters>"
npm run mcp:http
```

The local endpoint is `http://127.0.0.1:3100/mcp` and the health endpoint is `http://127.0.0.1:3100/health`. The listener binds to `0.0.0.0` so a deployment platform can terminate HTTPS in front of it; the core implementation does not hardcode a public hostname.

For a protocol-level connectivity check with placeholder credentials:

```powershell
curl.exe -X POST http://127.0.0.1:3100/mcp `
  -H "Authorization: Bearer <private-test-token>" `
  -H "Content-Type: application/json" `
  -H "Accept: application/json, text/event-stream" `
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Do not put the real bearer token in documentation, committed MCP configuration, URLs, or shell scripts. A supported MCP client should send it as an `Authorization: Bearer ...` header.

## OAuth 2.1 personal-test mode

OAuth mode implements the MCP authorization-code profile with PKCE `S256`, Dynamic Client Registration (DCR), protected-resource discovery, authorization-server discovery, exact redirect validation, short-lived one-time codes, and short-lived audience-bound access tokens. It does not change stdio or `give_hint` behavior.

Configure only placeholder or secret-manager values; never paste real secrets into committed scripts or client-visible configuration:

```powershell
$env:MCP_REMOTE_ENABLED = "true"
$env:MCP_OAUTH_ENABLED = "true"
$env:MCP_PUBLIC_BASE_URL = "https://your-mcp-service.example"
$env:MCP_OAUTH_REDIRECT_URIS = "https://chatgpt.com/connector/oauth/<callback-id>"
$env:MCP_OAUTH_ADMIN_SECRET = "<random-secret-at-least-32-characters>"
$env:MCP_OAUTH_SIGNING_SECRET = "<different-random-secret-at-least-32-characters>"
npm run mcp:http
```

The relevant local/public routes are:

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-protected-resource/mcp`
- `GET /.well-known/oauth-authorization-server`
- `POST /oauth/register`
- `GET|POST /oauth/authorize`
- `POST /oauth/token`
- `POST /mcp`

Use the official MCP Inspector OAuth flow for local testing. Register only an exact HTTPS callback or a loopback callback that is explicitly included in `MCP_OAUTH_REDIRECT_URIS`. The authorization page asks for the personal authorization secret; the secret is submitted only to the MCP service and is never placed in a redirect or access token.

When adding the deployed `/mcp` URL in ChatGPT, select **OAuth** authentication and choose **Dynamic Client Registration** if the UI asks for a client-registration method. Copy the exact callback URI shown by ChatGPT into `MCP_OAUTH_REDIRECT_URIS` before starting the connection.

## Test

```powershell
npm run test:mcp
npm run typecheck
npm run build
```

The focused tests cover a successful hint, invalid language, empty input, sanitized Tutor failure, the existing no-final-answer guard, HTTP startup, bearer authentication, tool discovery/calls, body limits, throttling, browser-origin rejection, OAuth discovery/DCR, authorization and PKCE, redirect validation, code expiry/replay, OAuth access to `/mcp`, and sanitized OAuth errors.

## Render deployment notes

Use a separate private-test web service with `npm run mcp:http` as its start command. Set `MCP_REMOTE_ENABLED=true`, inject `MCP_AUTH_TOKEN` and the existing Groq credential as secrets, and leave `MCP_PORT` unset so Render's `PORT` is used. Render terminates HTTPS and forwards traffic to the HTTP listener. The MCP endpoint is `https://<service-host>/mcp`; `/health` can be used as the health-check path.

To opt in to OAuth on that dedicated service, add `MCP_OAUTH_ENABLED=true`, the service's exact HTTPS origin in `MCP_PUBLIC_BASE_URL`, two independently generated secrets in `MCP_OAUTH_ADMIN_SECRET` and `MCP_OAUTH_SIGNING_SECRET`, and ChatGPT's exact callback URI in `MCP_OAUTH_REDIRECT_URIS`. Do not alter the main Engineerus Quest web/API service for this personal MCP test.

This prototype rejects requests carrying a browser `Origin` header instead of enabling broad CORS, accepts at most 64 KiB per request, and applies a bounded in-memory global limiter (8 requests per 10 seconds and 30 per minute). The limiter resets on restart and does not coordinate across instances.

The built-in OAuth server intentionally has no social login, Engineerus Quest user accounts, or multi-tenancy. DCR registrations and authorization codes are bounded but stored in process memory, so a restart invalidates registered clients and pending codes; a multi-instance service would not share them. Access tokens expire after 15 minutes and no refresh token is issued, so reauthorization is expected. Open DCR can still be a denial-of-service target even though redirect URIs are allowlisted and tool access requires the personal secret. For a public, durable, multi-user, or multi-instance service, use an established identity provider with persistent client registration, refresh-token rotation/revocation, distributed abuse controls, monitoring, and tenant isolation.
