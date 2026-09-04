import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";
import {
  validateAnalyticsMetadata,
  type AnalyticsEventContext,
  type AnalyticsEventName,
  type SafeAnalyticsMetadata,
} from "../analytics/events";
import { PersistenceError } from "./errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unavailable(): never {
  throw new PersistenceError(503, "analytics_storage_unavailable", "Analytics storage is temporarily unavailable.");
}

export function createAnalyticsRepository(env: ServerEnv) {
  return {
    async recordEvent(
      userId: string,
      eventName: AnalyticsEventName,
      metadata: SafeAnalyticsMetadata,
      dedupeKey: string,
      context: AnalyticsEventContext = {},
    ): Promise<void> {
      const sessionId = context.sessionId && UUID_PATTERN.test(context.sessionId)
        ? context.sessionId
        : null;
      const result = await createSupabaseAdminClient(env).from("product_events").upsert({
        user_id: userId,
        event_name: eventName,
        metadata: validateAnalyticsMetadata(eventName, metadata),
        dedupe_key: dedupeKey,
        session_id: sessionId,
        source: "backend",
      }, { onConflict: "user_id,event_name,dedupe_key", ignoreDuplicates: true });
      if (result.error) unavailable();
    },
  };
}

export type AnalyticsRepository = ReturnType<typeof createAnalyticsRepository>;
