# Engineerus Quest MCP prototype

This directory contains an isolated Model Context Protocol server for Engineerus Quest. It supports local stdio and an opt-in Streamable HTTP transport. Both transports expose the same single tool:

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

## Test

```powershell
npm run test:mcp
npm run typecheck
npm run build
```

The focused tests cover a successful hint, invalid language, empty input, sanitized Tutor failure, the existing no-final-answer guard, HTTP startup, bearer authentication, tool discovery/calls, body limits, throttling, and browser-origin rejection.

## Render deployment notes

Use a separate private-test web service with `npm run mcp:http` as its start command. Set `MCP_REMOTE_ENABLED=true`, inject `MCP_AUTH_TOKEN` and the existing Groq credential as secrets, and leave `MCP_PORT` unset so Render's `PORT` is used. Render terminates HTTPS and forwards traffic to the HTTP listener. The MCP endpoint is `https://<service-host>/mcp`; `/health` can be used as the health-check path.

This prototype rejects requests carrying a browser `Origin` header instead of enabling broad CORS, accepts at most 64 KiB per request, and applies a bounded in-memory global limiter (8 requests per 10 seconds and 30 per minute). The limiter resets on restart and does not coordinate across instances.

Before any production-public or multi-user deployment, replace the shared static token with stronger identity and authorization, enforce tenant isolation, use distributed rate/concurrency controls, add privacy-safe monitoring and abuse protection, and define secret rotation and incident procedures. These limitations make the current HTTP mode appropriate only for private/personal ChatGPT or Codex testing.
