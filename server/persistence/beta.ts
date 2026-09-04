import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";
import { ANALYTICS_EVENT_NAMES, type AnalyticsEventName, type AnalyticsEventRecorder, type SafeAnalyticsMetadata } from "../analytics/events";
import { createAnalyticsRepository } from "./analytics";
import { PersistenceError } from "./errors";

export const PRODUCT_EVENT_NAMES = ANALYTICS_EVENT_NAMES;
export type ProductEventName = AnalyticsEventName;
export type SafeEventMetadata = SafeAnalyticsMetadata;

export type BetaParticipant = {
  status: "active" | "paused" | "completed";
  cohort: string;
  source: string | null;
  onboarding_started_at: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BetaFeedbackInput = {
  category: "bug" | "confusing_ux" | "feature_request" | "ai_answer_quality" | "project_engimatch" | "other";
  rating: number;
  product_area: "onboarding" | "dashboard" | "profile" | "ai_tutor" | "quests" | "projects" | "engimatch" | "messages" | "authentication" | "other";
  message: string;
};

function unavailable(): never {
  throw new PersistenceError(503, "beta_storage_unavailable", "Beta services are temporarily unavailable.");
}

export function createBetaRepository(env: ServerEnv) {
  const client = () => createSupabaseAdminClient(env);
  const analytics = createAnalyticsRepository(env);

  async function ensureParticipant(userId: string): Promise<BetaParticipant> {
    const admin = client();
    const inserted = await admin.from("beta_participants")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    if (inserted.error) unavailable();
    const result = await admin.from("beta_participants")
      .select("status,cohort,source,onboarding_started_at,onboarding_completed_at,created_at,updated_at")
      .eq("user_id", userId)
      .single();
    if (result.error || !result.data) unavailable();
    return result.data as BetaParticipant;
  }

  const recordEvent = analytics.recordEvent;

  return {
    ensureParticipant,
    recordEvent,
    async startOnboarding(userId: string): Promise<BetaParticipant> {
      await ensureParticipant(userId);
      const result = await client().from("beta_participants")
        .update({ onboarding_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("onboarding_started_at", null)
        .select("status,cohort,source,onboarding_started_at,onboarding_completed_at,created_at,updated_at")
        .maybeSingle();
      try { await recordEvent(userId, "onboarding_started", {}, "onboarding"); } catch { /* state remains authoritative */ }
      return result.data ? result.data as BetaParticipant : ensureParticipant(userId);
    },
    async completeOnboarding(userId: string): Promise<BetaParticipant> {
      const current = await ensureParticipant(userId);
      const now = new Date().toISOString();
      const result = await client().from("beta_participants")
        .update({ onboarding_started_at: current.onboarding_started_at ?? now, onboarding_completed_at: now, updated_at: now })
        .eq("user_id", userId)
        .is("onboarding_completed_at", null)
        .select("status,cohort,source,onboarding_started_at,onboarding_completed_at,created_at,updated_at")
        .maybeSingle();
      try { await recordEvent(userId, "onboarding_completed", {}, "onboarding"); } catch { /* state remains authoritative */ }
      return result.data ? result.data as BetaParticipant : ensureParticipant(userId);
    },
    async submitFeedback(userId: string, input: BetaFeedbackInput): Promise<{ id: string; created_at: string }> {
      const result = await client().from("beta_feedback").insert({ user_id: userId, ...input })
        .select("id,created_at").single();
      if (result.error || !result.data) unavailable();
      try {
        await recordEvent(userId, "feedback_submitted", {
          category: input.category,
          product_area: input.product_area,
          rating: input.rating,
        }, result.data.id as string);
      } catch { /* accepted feedback must not be duplicated because telemetry failed */ }
      return result.data as { id: string; created_at: string };
    },
  };
}

export type BetaRepository = ReturnType<typeof createBetaRepository>;
export type ProductEventRecorder = AnalyticsEventRecorder;
