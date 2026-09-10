import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { AdminFeedbackStatus, AdminRepository } from "../persistence/admin";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";

const uuid = z.string().uuid();
const feedbackStatus = z.enum(["new", "reviewed", "resolved"]);
const feedbackQuery = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(25),
  before_created_at: z.string().datetime({ offset: true }).optional(),
  before_id: uuid.optional(),
}).strict().refine(
  (value) => Boolean(value.before_created_at) === Boolean(value.before_id),
  "Both cursor fields are required together.",
);
const userSearchQuery = z.object({
  query: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(20).default(20),
}).strict();
const statusBody = z.object({ status: feedbackStatus }).strict();
const emptyBody = z.object({}).strict();

function invalid(code: string, message: string): PersistenceError {
  return new PersistenceError(400, code, message);
}

function parseUuid(value: string, code: string): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw invalid(code, "A valid resource ID is required.");
  return parsed.data;
}

export function createRequireAdmin(repository: AdminRepository): RequestHandler {
  return async (_request, response, next) => {
    try {
      if (!await repository.isAdmin(response.locals.auth.accessToken)) {
        throw new PersistenceError(403, "admin_forbidden", "Administrator access is required.");
      }
      next();
    } catch (error) {
      sendPersistenceError(response, error);
    }
  };
}

export function createAdminRouter(
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
  repository: AdminRepository,
): Router {
  const router = Router();
  const requireAdmin = createRequireAdmin(repository);
  const protectedRoute = [authenticate, rateLimiter, requireAdmin];

  router.get("/api/admin/access", authenticate, rateLimiter, async (_request, response) => {
    try {
      response.json({ is_admin: await repository.isAdmin(response.locals.auth.accessToken) });
    } catch (error) { sendPersistenceError(response, error); }
  });

  router.get("/api/admin/feedback", ...protectedRoute, async (request, response) => {
    try {
      const parsed = feedbackQuery.safeParse(request.query);
      if (!parsed.success) throw invalid("invalid_admin_feedback_query", "Feedback query parameters are invalid.");
      const cursor = parsed.data.before_created_at && parsed.data.before_id
        ? { createdAt: parsed.data.before_created_at, id: parsed.data.before_id }
        : undefined;
      response.json(await repository.listFeedback(response.locals.auth.accessToken, parsed.data.limit, cursor));
    } catch (error) { sendPersistenceError(response, error); }
  });

  router.get("/api/admin/feedback/:feedbackId", ...protectedRoute, async (request, response) => {
    try {
      const feedbackId = parseUuid(request.params.feedbackId, "invalid_admin_feedback_id");
      response.json({ feedback: await repository.getFeedback(response.locals.auth.accessToken, feedbackId) });
    } catch (error) { sendPersistenceError(response, error); }
  });

  router.patch("/api/admin/feedback/:feedbackId/status", ...protectedRoute, async (request, response) => {
    try {
      const feedbackId = parseUuid(request.params.feedbackId, "invalid_admin_feedback_id");
      const parsed = statusBody.safeParse(request.body);
      if (!parsed.success) throw invalid("invalid_admin_feedback_status", "A valid feedback status is required.");
      response.json({ feedback: await repository.updateFeedbackStatus(
        response.locals.auth.accessToken,
        feedbackId,
        parsed.data.status as AdminFeedbackStatus,
      ) });
    } catch (error) { sendPersistenceError(response, error); }
  });

  router.get("/api/admin/admins", ...protectedRoute, async (_request, response) => {
    try {
      response.json({ admins: await repository.listAdmins(response.locals.auth.accessToken) });
    } catch (error) { sendPersistenceError(response, error); }
  });

  router.get("/api/admin/users", ...protectedRoute, async (request, response) => {
    try {
      const parsed = userSearchQuery.safeParse(request.query);
      if (!parsed.success) throw invalid("invalid_admin_user_search", "User search parameters are invalid.");
      response.json({ users: await repository.searchUsers(
        response.locals.auth.accessToken,
        parsed.data.query,
        parsed.data.limit,
      ) });
    } catch (error) { sendPersistenceError(response, error); }
  });

  router.post("/api/admin/users/:userId/admin", ...protectedRoute, async (request, response) => {
    try {
      const userId = parseUuid(request.params.userId, "invalid_admin_user_id");
      const parsed = emptyBody.safeParse(request.body ?? {});
      if (!parsed.success) throw invalid("invalid_admin_role_input", "No role fields may be supplied by the client.");
      response.status(201).json({ admin: await repository.grantAdmin(response.locals.auth.accessToken, userId) });
    } catch (error) { sendPersistenceError(response, error); }
  });

  router.delete("/api/admin/users/:userId/admin", ...protectedRoute, async (request, response) => {
    try {
      const userId = parseUuid(request.params.userId, "invalid_admin_user_id");
      await repository.revokeAdmin(response.locals.auth.accessToken, userId);
      response.status(204).end();
    } catch (error) { sendPersistenceError(response, error); }
  });

  return router;
}
