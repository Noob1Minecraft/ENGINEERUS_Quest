import { Router, type RequestHandler } from "express";
import type { ServerEnv } from "../config/env";
import {
  createProfileRepository,
  type CanonicalUser,
  type DailyActivity,
} from "../persistence/profiles";

export type { CanonicalUser } from "../persistence/profiles";

export type LoadCanonicalUser = (
  userId: string,
  accessToken: string,
) => Promise<CanonicalUser>;

export type RecordDailyActivity = (accessToken: string) => Promise<DailyActivity>;

export function createCanonicalUserLoader(env: ServerEnv): LoadCanonicalUser {
  return createProfileRepository(env).loadCanonicalUser;
}

export function createDailyActivityRecorder(env: ServerEnv): RecordDailyActivity {
  return createProfileRepository(env).recordDailyActivity;
}

export function createMeRouter(
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
  loadCanonicalUser: LoadCanonicalUser,
  recordDailyActivity: RecordDailyActivity,
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

  router.post("/api/me/daily-activity", authenticate, rateLimiter, async (_request, response) => {
    try {
      const activity = await recordDailyActivity(response.locals.auth.accessToken);
      response.json({ activity });
    } catch {
      response.status(503).json({
        error: { code: "daily_activity_unavailable", message: "Daily activity could not be recorded." },
      });
    }
  });

  return router;
}
