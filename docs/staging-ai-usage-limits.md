# Temporary staging Tutor protection

Disabled by default. Future activation requires `STAGING_AI_USAGE_LIMITS=true`
AND Render's built-in `RENDER_SERVICE_ID=srv-da1b9qe1egvs73adf810`.
Do not override the platform service identity. No cloud configuration was changed
as part of this implementation. Keep `GROQ_USAGE_DIAGNOSTICS=true` independently
enabled when measuring usage. No credentials are required in this document.

## Provisional limits (not derived from live usage measurements)

| Control | Value | Reason |
| --- | --- | --- |
| User input | 8000 UTF-16 code units AND <=4000 estimated token-equivalents | Room for a technical question while bounding accidental pastes |
| Estimate | ceil(UTF-8 bytes / 2) | Conservative size heuristic, not Groq tokenization or a guaranteed upper bound |
| Output | Existing 1600 max_tokens per provider call, unchanged | Preserve current Tutor configuration; applies separately to draft/review/fallbacks |
| Burst | 3 new generation attempts / rolling 30 seconds / user | Allow ordinary interaction, restrict rapid repeated submissions |
| Sustained | 20 attempts / rolling 15 minutes / user | Matches existing AI budget ceiling; not a daily/business quota |
| Deadline | 90 seconds shared across preparation, draft, review, provider fallbacks and standards retry | Reuse existing route budget, below the 120-second capacity lease |
| Existing timeouts | 45 seconds per provider attempt; 80 seconds per pipeline invocation | Retained, not extended |
| Memory | <=5000 user entries, <=20 timestamps each | Inactive timestamps cleaned on admission; full map rejects new entries, never evicts active budgets |

Applies to Tutor via both `/api/ai` and `/api/module` with module=tutor.
Identity comes exclusively from authenticated `response.locals.auth.userId`.
Existing distributed AI/vision budgets remain authoritative and are still checked
before new generation; in the opt-in path they run after completed replay detection.
General/pre-auth API protections are unchanged and can still throttle replay traffic.
Off-topic deterministic refusals need no provider budget. Other modules are unchanged.

Completed replay returns stored messages without another provider call or AI-budget
charge. Failed new generation attempts do count, including attempts rejected later
by the existing distributed capacity/budget controls. A retry after a failure is a
new generation attempt. Existing DB idempotency and capacity protection are retained.

Oversized input returns 413/ai_input_too_large. The existing 20000-character parser
ceiling remains: larger payloads are rejected before persistence; inputs below that
ceiling retain the saved question even when rejected by the smaller staging guard.
Rate rejection returns 429/ai_rate_limit_exceeded and Retry-After (seconds).
Deadline failure returns a safe 503 with the saved question and no assistant row.
No new prompt/content/credential logging is added. Usage diagnostics retain actual
provider-reported usage, including successful draft usage if review subsequently fails.

The deadline aborts signal-aware Groq fetch and response-body reads. Preparation
interfaces do not accept AbortSignal: the route stops awaiting them, but their own
bounded underlying work may finish later. Late generation cannot persist an answer.
Existing route-finally capacity release remains in place. The deadline is disposed
after completion/failure; it does not time-limit final DB persistence itself.

## Limits of this temporary design

Memory budgets reset on process restart and are per process, not globally shared.
Distributed budgets/concurrency are deliberately NOT removed. Do not treat the
local limiter as a production quota. Estimates cover the submitted text, not
system prompts, retrieved documents, history, images or review JSON. Output caps
are per call, not an aggregate token budget. Successful usage remains measured
by Groq metadata, never by client values or the input estimate.

This change has not been deployed or enabled. Review real staging measurements
before changing limits or scheduling any production rollout.
