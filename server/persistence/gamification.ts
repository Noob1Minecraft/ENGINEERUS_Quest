import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";
import { PersistenceError } from "./errors";

export type LocalizedGamificationText = Partial<Record<"ru" | "kk" | "en", string>>;

export type GamificationQuest = {
  id: string;
  name: LocalizedGamificationText;
  description: LocalizedGamificationText;
  xp_reward: number;
  cycle_key: string;
  status: "in_progress" | "completed";
  progress: { current: number; target: number };
  completed_at: string | null;
};

export type GamificationState = {
  progression: {
    total_xp: number;
    level: number;
    xp_into_level: number;
    xp_needed_for_next_level: number;
    progress_percent: number;
  };
  streak: {
    current: number;
    longest: number;
    last_active_date: string | null;
    timezone: "Asia/Almaty";
  };
  daily_quests: GamificationQuest[];
  weekly_quests: GamificationQuest[];
  achievements: Array<{
    slug: string;
    category: string;
    name: LocalizedGamificationText;
    description: LocalizedGamificationText;
    xp_reward: number;
    earned_at: string | null;
  }>;
  skills: Array<{
    skill_id: string;
    slug: string;
    name: LocalizedGamificationText;
    skill_xp: number;
  }>;
  quest_chains: Array<{
    slug: string;
    name: LocalizedGamificationText;
    description: LocalizedGamificationText;
    steps: Array<{ id: string; fact: string; name: LocalizedGamificationText }>;
    xp_reward: number;
    completed_steps: number;
    completed_at: string | null;
    next_step: { id: string; fact: string; name: LocalizedGamificationText } | null;
  }>;
};

export function createGamificationRepository(env: ServerEnv) {
  return {
    async refresh(userId: string): Promise<GamificationState> {
      const result = await createSupabaseAdminClient(env).rpc("refresh_gamification", {
        p_user_id: userId,
      });
      if (result.error || !result.data) {
        throw new PersistenceError(
          503,
          "gamification_unavailable",
          "Progression data is temporarily unavailable.",
        );
      }
      return result.data as GamificationState;
    },
  };
}

export type GamificationRepository = ReturnType<typeof createGamificationRepository>;
