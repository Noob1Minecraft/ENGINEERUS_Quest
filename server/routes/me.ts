import { Router, type RequestHandler } from "express";
import type { ServerEnv } from "../config/env";
import {
  createProfileRepository,
  type CanonicalUser,
  type DailyActivity,
} from "../persistence/profiles";
import type { ProductEventRecorder } from "../persistence/beta";
import { trackProductEvent } from "../beta/trackProductEvent";

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
  recordEvent?: ProductEventRecorder,
): Router {
  const router = Router();

  router.get("/api/me", authenticate, rateLimiter, async (_request, response) => {
    try {
      const { userId, accessToken, claims } = response.locals.auth;
      const user = await loadCanonicalUser(userId, accessToken);
      const sessionId = typeof claims.session_id === "string" ? claims.session_id : null;
      const dedupeKey = sessionId
        ? `session:${sessionId}`
        : `daily:${new Date().toISOString().slice(0, 10)}`;
      await trackProductEvent(recordEvent, userId, "login_completed", {}, dedupeKey, { sessionId });
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
