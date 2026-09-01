# Engineerus Quest controlled beta plan

## Objective and boundary

Validate the complete Engineerus learning and collaboration journey with 15–30 invited engineering students before any public launch. Access remains limited through the approved Supabase Auth invitation/account process. Phase G1 does not implement public signup marketing or claim production maturity.

Each authenticated account receives one `controlled-beta-2026` participant record. An optional operational source may be recorded later. University is reused from the existing private-aware Profile v2 field instead of being collected twice. Suggested initial cohorts are NU, Satbayev University, KBTU, and a small `Other` group.

## First-use journey

The account-scoped checklist points testers to Profile, AI Tutor, Quests, Projects, and EngiMatch. Completion is persisted in Supabase, so a returning user is not forced through onboarding again. XP is awarded only by existing authoritative backend flows; onboarding copy never claims an award.

## Activation and metrics

A participant is **activated** after completing at least two distinct meaningful event types from:

- `ai_message_sent`
- `quest_completed`
- `project_created`
- `project_applied`
- `engimatch_viewed`

First-party, content-free events support total participant and active-user counts, activation rate, D1/D7 return activity, AI use, quest completion, project creation/application, EngiMatch use, Direct Chat opens/sends, and feedback volume. Retention is calculated from event dates; no IP address, fingerprint, prompt, message, note, email, or private profile field is stored in analytics.

## Feedback and support

Authenticated testers submit a category, 1–5 rating, product area, and a message of at most 2,000 characters. The verified JWT supplies identity. Testers are told not to include passwords, tokens, or private messages.

The named operational escalation owner is the **Engineerus project owner / beta coordinator**. The coordinator triages:

- product bugs and confusing UX through beta feedback;
- account/access issues through the same authenticated form when access is available, or the existing approved invitation contact when it is not;
- abusive Direct Chat behavior after the tester first uses the existing block control.

No full moderation dashboard is implied. The coordinator records necessary follow-up outside public product data and follows `docs/security/INCIDENT_RESPONSE.md` for security incidents.

## Known limitations

- The cohort is small and invite-only; this is not public-beta access control infrastructure.
- CSP remains Report-Only.
- Rate and AI concurrency stores are process-local and assume one Render instance.
- Direct Chat has blocking but not public-scale reporting/moderation workflow.
- Backup restoration and production configuration have not been approved.
- Beta analytics has no dashboard; metrics are computed later from trusted event rows.

## Exit criteria toward public beta

- No unresolved critical/high finding and controlled-beta regressions are closed.
- Activation, D1/D7 retention, AI reliability, feedback trends, and abuse/support load are reviewed with enough real tester data.
- Supabase leaked-password protection is enabled.
- CSP reports are reviewed and an enforcing policy is approved.
- `main` branch protection requires security CI and review.
- Direct Chat reporting/moderation ownership and user escalation are implemented.
- Supabase backup/restore is verified with a documented exercise.
- Production Vercel, Render, Supabase Auth, environment, domains, logs, and rollback settings are reviewed.
- A distributed limiter is added before multiple backend instances or public-scale traffic.
