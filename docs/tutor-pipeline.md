# Minimal structured Tutor pipeline

## Existing flow preserved

Authenticated `/api/ai` (or `/api/module` with `module=tutor`) validates input,
derives the owner from the existing auth middleware, and calls `beginExchange`
before generation. Completed idempotency replays return before any provider work.
Off-topic requests retain their deterministic zero-reward path. Existing capacity,
rate controls, image/document ownership, standards guards, `completeExchange`, XP,
and history loading remain authoritative. No persistence/schema changes are made.

## New flow

1. `taskRouter.ts`: deterministic task metadata and five modes: `hint`,
   `step_by_step`, `full_explanation`, `check_my_solution`, `quiz_me`.
2. `knowledge.ts`: adapter over already prepared standards/document/image/history
   context. No new corpus, retrieval network service, or vector store is invented.
   A future owner-scoped course/pgvector adapter can implement `TutorKnowledgeSource`.
3. `tutoringPolicy`: hint depth and format instructions derived from server metadata.
   Calculations begin at hint 1; stand-alone “I don't understand” follow-ups reach
   2, then 3, then a full explanation. Explicit full-solution requests take precedence.
   Conceptual questions can be answered directly. RU/KK/EN controls are supported.
4. Solver: the existing Groq responder produces a bounded JSON draft containing a
   public explanation and declared numeric operations, not private reasoning.
5. Verifier: deterministic arithmetic/dimension checks over the declared operations,
   followed by a separate Groq review for formulas, assumptions, contradictions and
   hint leakage. Corrected operations are checked again before response formatting.
6. Formatter: only the sanitized public explanation reaches existing output guards
   and persistence. Unresolved numerical errors/premature answers become localized
   clarification. Malformed JSON/provider failure follows the existing saved-question
   error path, without persisting a partial draft or fake assistant answer.
7. Learning context: topic, unknown difficulty, hint depth and requested mode are
   derived per request from at most eight owner-scoped messages. No cross-user cache,
   separate learner profile, telemetry, or additional stored personal data.

## API and compatibility

Existing payloads remain valid. Clients may optionally send `tutor_mode` with one
of the five mode names. No UI selector was added; natural-language controls already
work through chat. Specialized non-Tutor modules ignore the tutoring pipeline.
The production composition root supplies the pipeline only when Groq credentials
exist, preserving the previous no-key demo behavior. Dependency injection keeps
the route transport independent from tutoring implementation.

No LaTeX dependency/UI change: public explanations use readable plain formulas.

## Verification limits and rollout risks

- This is not a general symbolic solver. Deterministic checks support a small SI
  unit table and binary arithmetic. They validate **declared operations only**, not
  the entire prose, provenance, formula applicability or engineering safety.
- The second model pass is review, not independent mathematical certification.
  Instructions forbid claims of comprehensive verification and require uncertainty
  when information is missing. Live model adherence still needs staging evaluation.
- Two provider passes replace one for Tutor; latency and token cost increase.
  Existing provider fallbacks remain. A pipeline has an 80-second deadline and all
  Tutor attempts including an existing standards retry share 90 seconds, below the
  existing 120-second capacity lease. Disconnect cancellation propagates to both passes.
- The existing 1600-token output limit is unchanged. Long structured outputs can
  be malformed/truncated; those fail safely and retain the user question. Validate
  structured responses with actual configured models before considering rollout.
- Hint depth is inferred from bounded conversation text, not durable mastery state.
  Long histories, unusual phrasing or mode-only API changes may not reconstruct
  perfectly. No schema change is proposed for this first iteration.
- No live provider, Supabase, or cloud verification was performed. Regression tests
  use synthetic in-memory repositories and providers; they do not prove deployed RLS.

Existing uncommitted Sentry work is separate and was preserved.
