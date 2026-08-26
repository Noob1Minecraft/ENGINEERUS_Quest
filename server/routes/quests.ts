import { Router, type RequestHandler } from "express";
import type { QuestRepository } from "../persistence/quests";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";
import type { ProductEventRecorder } from "../persistence/beta";
import { trackProductEvent } from "../beta/trackProductEvent";

export function createQuestsRouter(
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
  repository: QuestRepository,
  recordEvent?: ProductEventRecorder,
): Router {
  const router = Router();

  router.get("/api/quests", authenticate, rateLimiter, async (_request, response) => {
    try {
      const { userId, accessToken } = response.locals.auth;
      const state = await repository.state(userId, accessToken);
      response.json({
        quests: state.definitions,
        completed_quests: state.completedQuestIds,
      });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.post("/api/quests/complete", authenticate, rateLimiter, async (request, response) => {
    try {
      const questId = request.body?.quest_id;
      if (typeof questId !== "string" || !/^[a-z0-9_-]{1,100}$/.test(questId)) {
        throw new PersistenceError(400, "invalid_quest", "A valid quest is required.");
      }
      const { userId, accessToken } = response.locals.auth;
      const result = await repository.complete(userId, accessToken, questId);
      await trackProductEvent(recordEvent, userId, "quest_completed", { quest_id: questId }, questId);
      response.json({ status: "ok", ...result });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  return router;
}
