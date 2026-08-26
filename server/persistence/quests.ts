import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";
import { createSupabaseUserClient } from "../lib/supabaseUser";
import { PersistenceError } from "./errors";

type LocalizedText = { ru?: string; kk?: string; en?: string };

export type PersistedQuestDefinition = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  reward_label: LocalizedText;
  criteria: Record<string, unknown>;
  xp_reward: number;
  repeat_policy: string;
  achievement_code: string | null;
  quest_kind: "legacy";
};

export type QuestState = {
  definitions: PersistedQuestDefinition[];
  completedQuestIds: string[];
};

export function createQuestRepository(env: ServerEnv) {
  async function state(userId: string, accessToken: string): Promise<QuestState> {
    const client = createSupabaseUserClient(env, accessToken);
    const [definitions, completions] = await Promise.all([
      client
        .from("quest_definitions")
        .select("id,name,description,reward_label,criteria,xp_reward,repeat_policy,achievement_code,quest_kind")
        .eq("is_active", true)
        .eq("quest_kind", "legacy")
        .order("created_at", { ascending: true }),
      client
        .from("user_quests")
        .select("quest_id")
        .eq("user_id", userId)
        .eq("status", "completed"),
    ]);

    if (definitions.error || completions.error) {
      throw new PersistenceError(503, "quests_unavailable", "Quest data is temporarily unavailable.");
    }

    return {
      definitions: definitions.data as PersistedQuestDefinition[],
      completedQuestIds: (completions.data as Array<{ quest_id: string }>).map((row) => row.quest_id),
    };
  }

  return {
    state,
    async complete(
      userId: string,
      accessToken: string,
      questId: string,
    ): Promise<Record<string, unknown> & { completed_quests: string[] }> {
      const client = createSupabaseAdminClient(env);
      const result = await client.rpc("complete_quest", {
        p_user_id: userId,
        p_quest_id: questId,
        p_cycle_key: "once",
      });

      if (result.error) {
        if (result.error.message.toLowerCase().includes("criteria")) {
          throw new PersistenceError(409, "quest_criteria_not_met", "Quest criteria have not been satisfied.");
        }
        if (result.error.message.toLowerCase().includes("does not exist")) {
          throw new PersistenceError(404, "quest_not_found", "Quest was not found.");
        }
        throw new PersistenceError(503, "quest_completion_failed", "Quest completion is temporarily unavailable.");
      }

      const currentState = await state(userId, accessToken);
      return {
        ...(result.data as Record<string, unknown>),
        completed_quests: currentState.completedQuestIds,
      };
    },
  };
}

export type QuestRepository = ReturnType<typeof createQuestRepository>;
