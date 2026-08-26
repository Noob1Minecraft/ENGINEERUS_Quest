# Engineerus Quest Gamification v2

## Authority and level curve

The backend and PostgreSQL are authoritative. Clients never submit an XP amount, level, achievement, or skill-progress mutation.

The canonical curve remains deliberately simple and backward compatible:

- Level 1: 0–99 XP
- Level 2: 100–199 XP
- Level `n`: `(n - 1) × 100` through `n × 100 - 1` XP
- `level = floor(total_xp / 100) + 1`

Every reward uses `award_xp`, which locks the user's progress row, records an immutable ledger entry, derives the level from the resulting balance, and emits one deduplicated `level_up` event when a threshold is crossed. The API exposes total XP, level, XP within the current level, XP remaining, and percentage.

## Daily quests

The system assigns a small, understandable three-quest cycle for each Asia/Almaty calendar day:

1. Record authenticated daily activity.
2. Receive one completed AI Tutor response.
3. Complete one core learning quest.

Assignments use the date as `cycle_key`. Completion is derived from persisted facts, and each reward key follows `daily_quest:<date>:<quest-id>`.

## Weekly quests

Weeks begin Monday in Asia/Almaty. Three bounded weekly goals cover completed core/daily quests, regular Tutor practice, and meaningful Projects/EngiMatch activity. Counting daily quests keeps the learning goal repeatable after the one-time starter quests are finished. The weekly start date is the cycle key. Rewards use `weekly_quest:<week>:<quest-id>` and are paid once.

## Achievements

The initial stable slugs are:

- `first-question`
- `first-quest`
- `streak-3`
- `streak-7`
- `first-project`
- `first-engimatch`
- `level-5`
- `level-10`

`user_achievements` has one immutable `earned_at` row per user and slug. Optional XP uses `achievement:<slug>`, so retries and concurrent refreshes cannot pay twice.

## Skill progression

Skill XP is conservative and source-keyed. Only completed quests with an explicit canonical `skills` taxonomy mapping can add it. Generic AI questions do not infer competence. Each source can contribute once.

**Skill progress is Engineerus platform learning progress, not certification, licensure, employment qualification, or proof of professional competency.**

## Quest chains

`engineering-starter` is a five-step ordered chain: complete Profile v2, ask the first AI question, complete the first core quest, explore EngiMatch, and create or join a project. The backend evaluates persisted facts in order, stores the highest completed prefix, exposes the next step, and awards `quest_chain:engineering-starter` once. It does not block navigation or restart onboarding.

## Streak integration

The existing `record_daily_activity()` implementation remains unchanged. Its Asia/Almaty calendar policy, same-day idempotency, consecutive-day increment, missed-day reset, row lock, and preserved longest streak remain authoritative. Gamification reads these values for UI and achievements; it does not create another streak mutation path.

## Reward and anti-abuse rules

- `xp_ledger` remains the platform XP audit trail.
- Every G2 reward has a stable per-user idempotency key.
- Progress refreshes are serialized by locking the user's `user_progress` row.
- Quest and achievement uniqueness constraints are additional defense in depth.
- AI XP retains its existing request-id idempotency and bounded award values.
- Page views do not directly award XP.
- EngiMatch and project progress rely on deduplicated persisted product events or real database rows.
- Feedback events never award XP.
- There is no public/client reward endpoint.

## RLS and API boundary

All new tables have RLS enabled. `PUBLIC`, `anon`, `authenticated`, and `service_role` receive no direct table privileges. The trusted backend calls only `refresh_gamification` with the user ID derived from the verified JWT. The RPC is `SECURITY DEFINER`, has an empty `search_path`, schema-qualifies all objects, is executable only by `service_role`, and returns a bounded DTO.

## Beta analytics

The content-free allowlist adds `daily_quest_completed`, `weekly_quest_completed`, `achievement_unlocked`, `level_up`, and `quest_chain_completed`. Dedupe keys prevent noisy repeats. Metadata contains stable IDs or numeric levels only—never prompts, responses, chat content, email, private profile fields, IP analytics, or browser fingerprints.
