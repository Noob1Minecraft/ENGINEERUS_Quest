import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { BetaFeedbackInput, BetaRepository } from "../persistence/beta";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";

const feedbackSchema = z.object({
  category: z.enum(["bug", "confusing_ux", "feature_request", "ai_answer_quality", "project_engimatch", "other"]),
  rating: z.number().int().min(1).max(5),
  product_area: z.enum(["onboarding", "dashboard", "profile", "ai_tutor", "quests", "projects", "engimatch", "messages", "authentication", "other"]),
  message: z.string().trim().min(3).max(2000),
}).strict();

const clientEventSchema = z.object({
  event_name: z.enum(["engimatch_viewed", "direct_chat_opened"]),
}).strict();

function invalid(code: string, message: string): PersistenceError {
  return new PersistenceError(400, code, message);
}

export function createBetaRouter(
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
  repository: BetaRepository,
): Router {
  const router = Router();

  router.get("/api/beta/state", authenticate, rateLimiter, async (_request, response) => {
    try {
      response.json({ participant: await repository.ensureParticipant(response.locals.auth.userId) });
    } catch (error) { sendPersistenceError(response, error); }
  });

  router.post("/api/beta/onboarding/start", authenticate, rateLimiter, async (_request, response) => {
    try {
      response.json({ participant: await repository.startOnboarding(response.locals.auth.userId) });
    } catch (error) { sendPersistenceError(response, error); }
  });

  router.post("/api/beta/onboarding/complete", authenticate, rateLimiter, async (_request, response) => {
    try {
      response.json({ participant: await repository.completeOnboarding(response.locals.auth.userId) });
    } catch (error) { sendPersistenceError(response, error); }
  });

  router.post("/api/beta/feedback", authenticate, rateLimiter, async (request, response) => {
    try {
      const parsed = feedbackSchema.safeParse(request.body);
      if (!parsed.success) throw invalid("invalid_beta_feedback", "Valid, non-sensitive feedback is required.");
      response.status(201).json({ feedback: await repository.submitFeedback(response.locals.auth.userId, parsed.data as BetaFeedbackInput) });
    } catch (error) { sendPersistenceError(response, error); }
  });

  router.post("/api/beta/events", authenticate, rateLimiter, async (request, response) => {
    try {
      const parsed = clientEventSchema.safeParse(request.body);
      if (!parsed.success) throw invalid("invalid_product_event", "The product event is not allowed.");
      const day = new Date().toISOString().slice(0, 10);
      await repository.recordEvent(response.locals.auth.userId, parsed.data.event_name, {}, `daily:${day}`);
      response.status(204).end();
    } catch (error) { sendPersistenceError(response, error); }
  });

  return router;
}
