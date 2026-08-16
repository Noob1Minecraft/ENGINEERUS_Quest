import { randomUUID } from "node:crypto";
import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";

type ProgressSnapshot = {
  total_xp: number;
  level: number;
  streak_days: number;
  requests_count: number;
  material_count: number;
  patent_count: number;
  modules_used: string[];
};

export type AwardedProgress = {
  xp: number;
  level: number;
  streak: number;
};

export function createIdempotencyKey(value: string | undefined, scope: string): string {
  if (!value) return `${scope}:${randomUUID()}`;
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw new Error("Invalid idempotency key.");
  }
  return `${scope}:${value}`;
}

export async function recordAiUsage(
  env: ServerEnv,
  userId: string,
  moduleName: string,
  xpAmount: number,
  idempotencyKey: string,
): Promise<AwardedProgress> {
  const client = createSupabaseAdminClient(env);
  const progressResult = await client.rpc("record_user_progress", {
    p_user_id: userId,
    p_requests: 1,
    p_material: moduleName === "material" ? 1 : 0,
    p_patent: moduleName === "patent" ? 1 : 0,
    p_module: moduleName,
  });
  if (progressResult.error) throw new Error("Progress update failed.");

  const awardResult = await client.rpc("award_xp", {
    p_user_id: userId,
    p_amount: xpAmount,
    p_reason: `AI module used: ${moduleName}`,
    p_source_type: "ai_module",
    p_source_id: moduleName,
    p_idempotency_key: idempotencyKey,
    p_metadata: { module: moduleName },
  });
  if (awardResult.error) throw new Error("XP award failed.");

  const progress = progressResult.data as ProgressSnapshot;
  const award = Array.isArray(awardResult.data) ? awardResult.data[0] : awardResult.data;
  return {
    xp: Number(award?.total_xp ?? progress.total_xp),
    level: Number(award?.level ?? progress.level),
    streak: Number(progress.streak_days ?? 0),
  };
}

export async function completeUserQuest(
  env: ServerEnv,
  userId: string,
  questId: string,
): Promise<Record<string, unknown>> {
  const client = createSupabaseAdminClient(env);
  const result = await client.rpc("complete_quest", {
    p_user_id: userId,
    p_quest_id: questId,
    p_cycle_key: "once",
  });
  if (result.error) throw new Error("Quest completion failed.");
  return result.data as Record<string, unknown>;
}
