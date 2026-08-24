import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";
import type { EngiMatchRepository } from "../persistence/engimatch";

const uuid = z.string().uuid();
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(12),
  min_score: z.coerce.number().min(0).max(100).default(0),
}).strict();

function query(value: unknown) {
  const parsed = querySchema.safeParse(value);
  if (!parsed.success) throw new PersistenceError(400, "invalid_engimatch_query", "EngiMatch parameters are invalid.");
  return { limit: parsed.data.limit, minScore: parsed.data.min_score };
}

export function createEngiMatchRouter(authenticate: RequestHandler, rateLimiter: RequestHandler, repository: EngiMatchRepository): Router {
  const router = Router();
  router.get("/api/project-roles/:roleId/matches", authenticate, rateLimiter, async (request, response) => {
    try {
      const roleId = uuid.safeParse(request.params.roleId);
      if (!roleId.success) throw new PersistenceError(400, "invalid_project_role_id", "A valid role ID is required.");
      const { userId, accessToken } = response.locals.auth;
      response.json(await repository.findTeammates(userId, accessToken, roleId.data, query(request.query)));
    } catch (error) { sendPersistenceError(response, error); }
  });
  router.get("/api/engimatch/projects", authenticate, rateLimiter, async (request, response) => {
    try {
      const { userId, accessToken } = response.locals.auth;
      response.json(await repository.findProjects(userId, accessToken, query(request.query)));
    } catch (error) { sendPersistenceError(response, error); }
  });
  return router;
}
