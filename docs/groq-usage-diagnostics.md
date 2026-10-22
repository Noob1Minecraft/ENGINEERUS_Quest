# Temporary Groq usage diagnostics

Backend-only, opt-in with `GROQ_USAGE_DIAGNOSTICS=true`. Unset it or use any other
value to disable. No environment files or cloud configuration are changed by this
implementation. Enable only for the intended environment during a separately
approved rollout; remove/disable after measurement and use short log retention.

Tutor requests on both AI routes create one request-local collector. Tutor v2
labels actual provider attempts `draft` / `review`; the legacy single-pass Tutor
uses `draft`. Existing standards regeneration is included in the same aggregate.
Other modules and no-provider/idempotent/off-topic paths emit no usage entries.

Each JSON line contains ONLY `request_id`, optional `stage`, `prompt_tokens`,
`completion_tokens`, `total_tokens`, `latency_ms`. A final line **without stage**
is the per-request aggregate; do not add it to stage lines when calculating usage.
The request ID comes from server-generated request context, never the client
idempotency header; an isolated invocation gets a random UUID.

Counts come from Groq response `usage`, not estimates. Only nonnegative safe
integers are accepted. Missing/invalid values are null, including failed attempts
whose usage is unavailable. Null propagates to totals so partial observations are
never reported as a complete bill. Available stage rows can still be inspected.
Reported usage is captured even if the returned content subsequently fails parsing.
HTTP error bodies are not read for diagnostic purposes.

Stage latency is client-observed provider-attempt time through response processing;
summary latency is elapsed AI route handling time (including persistence), not
provider-only processing time. Late completions after an aborted scope are ignored
and pending usage makes the summary unknown. Logging failures do not fail requests.

No prompts, responses, user IDs, chat IDs, email, headers, cookies, credentials or
provider response IDs are included. A dedicated strict numeric serializer avoids
the existing security logger's blanket redaction of keys containing “token”; that
logger and its security controls remain unchanged. Existing non-usage security
logs remain unchanged. No frontend response, quota, database or model behavior changes.

Provider field reference: https://console.groq.com/docs/api-reference
