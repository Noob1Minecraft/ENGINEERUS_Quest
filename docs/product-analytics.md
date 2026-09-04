# Engineerus product analytics

This foundation uses the existing first-party `public.product_events` store. Events are written only by trusted backend or database paths; browsers have no direct table access. The system intentionally does not add third-party trackers, tracking cookies, fingerprinting, session replay, or advertising pixels.

## Privacy boundary

Allowed metadata is defined per event in `server/analytics/events.ts` and is limited to short, low-risk categorical or boolean values. Analytics must never contain prompts, model responses, chat or direct-message content, document or image names/content, email addresses, tokens, raw IP addresses, user-agent strings, OAuth metadata, or secrets. User identity comes from verified authentication state or database ownership, never from request fields.

The initial event taxonomy covers signup, login, onboarding, activation, AI messages, quests, learning resources, projects and recruitment, EngiMatch actions, document/image uploads, direct-chat starts, and reserved referral-link lifecycle events. Reserved events are not emitted until the corresponding product flow exists.

## Metric definitions

All reporting days use UTC.

- Signup: the authoritative profile-creation trigger records `signup_completed` once.
- Activation: the first successful AI message, quest completion, project creation, or project application records `first_meaningful_action` once per user.
- DAU/WAU/MAU: distinct users with at least one meaningful product event during the UTC calendar day, trailing 7-day window, or trailing 30-day window. Login and page views alone do not make a user active.
- D1/D7/D30 retention: a signup cohort member has at least one meaningful product event on the exact first, seventh, or thirtieth UTC calendar day after signup.
- Core funnel: signup to activation. Anonymous visitor conversion is deliberately unavailable because this foundation does not track unauthenticated visitors.

Service-role-only, `security_invoker` views provide core aggregates, cohort retention, and bounded weekly active-user IDs. They are operational/admin data and must not be exposed in public APIs or frontend bundles.

## Reliability and lifecycle

Event writes are idempotent through `(user_id, event_name, dedupe_key)` and are non-blocking for product actions. Authoritative actions are recorded only after their corresponding operation succeeds. Analytics failure must not fail the user action and logs must contain only the event category, never event payloads.

Recommended future retention, subject to legal and product review, is 13 months for raw product events so D30 and seasonal cohort analysis remain possible, with longer-lived anonymous aggregates if required. No automatic cleanup is introduced by this phase. Existing user-owned rows retain their current deletion behavior through the user foreign key.

## Review checklist

Before adding an event or metadata field:

1. Show that the metric supports a documented product decision.
2. Add it to both the TypeScript and database allowlists.
3. Use a trusted user ID and an action-specific idempotency key.
4. Prove no user content or sensitive identifier is collected.
5. Add focused unit and database privacy/ACL coverage.
6. Keep analytics views private and review retention before enabling cleanup.
