import { Router, type RequestHandler } from "express";
import type { ServerEnv } from "../config/env";
import { createSupabaseUserClient } from "../lib/supabaseUser";

export type CanonicalUser = {
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    preferred_lang: "ru" | "kk" | "en";
    telegram_user_id: number | null;
  };
  progress: {
    total_xp: number;
    level: number;
    streak_days: number;
    requests_count: number;
    material_count: number;
    patent_count: number;
    modules_used: string[];
  };
};

export type LoadCanonicalUser = (
  userId: string,
  accessToken: string,
) => Promise<CanonicalUser>;

export function createCanonicalUserLoader(env: ServerEnv): LoadCanonicalUser {
  return async (userId, accessToken) => {
    const client = createSupabaseUserClient(env, accessToken);
    const [profileResult, progressResult] = await Promise.all([
      client
        .from("profiles")
        .select("id,username,display_name,avatar_url,preferred_lang,telegram_user_id")
        .eq("id", userId)
        .single(),
      client
        .from("user_progress")
        .select("total_xp,level,streak_days,requests_count,material_count,patent_count,modules_used")
        .eq("user_id", userId)
        .single(),
    ]);

    if (profileResult.error || progressResult.error) {
      throw new Error("Canonical user data is unavailable.");
    }

    return {
      profile: profileResult.data as CanonicalUser["profile"],
      progress: progressResult.data as CanonicalUser["progress"],
    };
  };
}

export function createMeRouter(
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
  loadCanonicalUser: LoadCanonicalUser,
): Router {
  const router = Router();

  router.get("/api/me", authenticate, rateLimiter, async (_request, response) => {
    try {
      const { userId, accessToken } = response.locals.auth;
      const user = await loadCanonicalUser(userId, accessToken);
      response.json(user);
    } catch {
      response.status(503).json({
        error: { code: "profile_unavailable", message: "Profile data is temporarily unavailable." },
      });
    }
  });

  return router;
}
