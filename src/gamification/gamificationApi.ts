import { apiFetch } from "../utils/api";
import type { Language } from "../types";

export type LocalizedText = Partial<Record<Language, string>>;

export type GamificationQuest = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
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
  streak: { current: number; longest: number; last_active_date: string | null; timezone: "Asia/Almaty" };
  daily_quests: GamificationQuest[];
  weekly_quests: GamificationQuest[];
  achievements: Array<{
    slug: string;
    category: string;
    name: LocalizedText;
    description: LocalizedText;
    xp_reward: number;
    earned_at: string | null;
  }>;
  skills: Array<{ skill_id: string; slug: string; name: LocalizedText; skill_xp: number }>;
  quest_chains: Array<{
    slug: string;
    name: LocalizedText;
    description: LocalizedText;
    steps: Array<{ id: string; fact: string; name: LocalizedText }>;
    xp_reward: number;
    completed_steps: number;
    completed_at: string | null;
    next_step: { id: string; fact: string; name: LocalizedText } | null;
  }>;
};

export async function loadGamification(): Promise<GamificationState> {
  const result = await apiFetch<{ gamification: GamificationState }>("/api/gamification");
  return result.gamification;
}
