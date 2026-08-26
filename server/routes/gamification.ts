import { Router, type RequestHandler } from "express";
import type { GamificationRepository } from "../persistence/gamification";
import { sendPersistenceError } from "../persistence/errors";

export function createGamificationRouter(
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
  repository: GamificationRepository,
): Router {
  const router = Router();

  router.get("/api/gamification", authenticate, rateLimiter, async (_request, response) => {
    try {
      response.json({ gamification: await repository.refresh(response.locals.auth.userId) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  return router;
}
