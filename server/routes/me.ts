import { Router, type RequestHandler } from "express";
import type { ServerEnv } from "../config/env";
import { createProfileRepository, type CanonicalUser } from "../persistence/profiles";

export type { CanonicalUser } from "../persistence/profiles";

export type LoadCanonicalUser = (
  userId: string,
  accessToken: string,
) => Promise<CanonicalUser>;

export function createCanonicalUserLoader(env: ServerEnv): LoadCanonicalUser {
  return createProfileRepository(env).loadCanonicalUser;
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
