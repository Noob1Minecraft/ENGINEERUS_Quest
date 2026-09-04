# Beta analytics reporting

Engineerus beta reporting remains first-party, aggregate, and UTC-based. The server-only reporting service in `server/analytics/reporting.ts` turns the existing content-free `product_events` and beta-participant state into decision-oriented metrics. It is deliberately not mounted as an HTTP endpoint or frontend page.

## Authorization decision

Engineerus currently verifies an authenticated Supabase JWT but has no immutable admin claim, dedicated admin membership table, or equivalent server-authorized operator role. A hidden route, browser boolean, hardcoded email, or ordinary `authenticated` role would not be sufficient authorization. Until a reviewed admin lifecycle exists, only trusted server/service-role code and direct operator access to the existing service-role-only views may use reporting.

The reporting service selects only `user_id`, `event_name`, and `created_at` from events and `user_id` plus `onboarding_completed_at` from participants. It never selects event metadata, feedback messages, profile data, email, AI/chat content, filenames, tokens, IP addresses, user agents, or storage URLs. Its returned DTO is aggregate-only and contains no user identifiers.

## Metric definitions

- **Signups:** distinct users with the database-authored `signup_completed` event.
- **Activated users:** signed-up users with the idempotent `first_meaningful_action` event.
- **Activation rate:** activated users divided by signups.
- **DAU / WAU / MAU:** distinct users with a meaningful action during the current UTC day, trailing seven UTC calendar days, or trailing thirty UTC calendar days.
- **D1 / D7 / D30:** signup-cohort users with a meaningful action on the exact UTC day offset. Immature users are excluded from the eligible denominator.
- **Feature adoption:** unique users and event volume in the selected period, with percentages against all signups and activated users.
- **Funnel:** signup, completed onboarding, activation, and mature D1/D7/D30 return counts. Onboarding is available because the authenticated beta flow explicitly records completion; it is not inferred from navigation.

Meaningful actions are limited to successful AI messages, quest completions, project creation, project applications, accepted project invitations, EngiMatch actions, document/image uploads, and direct-chat starts. Login, page opening, locale changes, navigation, profile opening, and reloads are excluded.

## Periods and maturity

`today`, `7d`, and `30d` begin at UTC calendar-day boundaries; `all` covers all recorded beta history through report generation. Retention returns one of:

- `mature`: an eligible cohort exists; `0%` is a real observed zero when retained users are zero;
- `immature_cohort`: signups exist but none are old enough for the requested offset;
- `no_eligible_cohort`: the selected period contains no signups.

The report includes immature-user counts and never turns an immature D30 cohort into a displayed `0%`.

## Interpretation

The health section reports sample size, an explicit small-sample warning below 30 signups, activation direction when both adjacent seven-day cohorts exist, feature concentration, and most/least-used meaningful features. These are descriptive signals, not universal startup benchmarks, and do not label the beta successful or unsuccessful.

## Existing feedback readiness

The authenticated first-party beta feedback form already supports category, rating, bounded description, and current product area. It warns against secrets/private messages, returns a sanitized error state, and records only content-free category/rating/area analytics. No support platform or third-party tracker is needed for this phase.

## Safest next step for an internal UI

Before exposing `/api/admin/analytics/*`, define and review an administrator lifecycle using immutable Supabase `app_metadata` or a dedicated owner-managed table, including assignment, revocation, token-refresh behavior, audit logging, and emergency removal. Then enforce that role after JWT verification on every endpoint, keep the service role server-only, validate the four fixed range values, apply a dedicated read limit, and return only the aggregate DTO. Do not create an analytics UI before that prerequisite is complete.

Operationally, current production metrics may be read through the Supabase SQL editor or trusted connector using the existing service-role-only views. Raw event rows and user-level exports are not required for routine beta review.

## Failure behavior

Reporting limits its input to 25,000 rows and fails closed with a sanitized reporting error if storage is unavailable or the bound is exceeded. The module is not part of login or product-action execution paths. Existing event writes remain best-effort and non-blocking, so analytics/reporting failure cannot block Tutor, quests, projects, EngiMatch, Direct Chat, documents, or navigation.

