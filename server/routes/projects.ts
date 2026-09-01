import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";
import type {
  CreateProjectInput,
  OwnerProjectSearch,
  ProjectRepository,
  ProjectSearch,
  UpdateProjectInput,
} from "../persistence/projects";
import type { ProductEventRecorder } from "../persistence/beta";
import { trackProductEvent } from "../beta/trackProductEvent";

const uuid = z.string().uuid();
const status = z.enum(["draft", "open", "in_progress", "completed", "cancelled", "archived"]);
const discoveryStatus = z.enum(["open", "in_progress", "completed"]);
const visibility = z.enum(["private", "authenticated", "public"]);
const projectFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().max(5000),
  primary_discipline_id: uuid.nullable(),
  status,
  visibility,
};

const createSchema = z.object({
  title: projectFields.title,
  description: projectFields.description.optional(),
  primary_discipline_id: projectFields.primary_discipline_id.optional(),
  status: projectFields.status.optional(),
  visibility: projectFields.visibility.optional(),
}).strict();

const updateSchema = z.object({
  title: projectFields.title.optional(),
  description: projectFields.description.optional(),
  primary_discipline_id: projectFields.primary_discipline_id.optional(),
  status: projectFields.status.optional(),
  visibility: projectFields.visibility.optional(),
}).strict();

const discoverySchema = z.object({
  query: z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N} _.-]+$/u).optional(),
  discipline: uuid.optional(),
  status: discoveryStatus.optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(25).default(12),
}).strict();

const ownerListSchema = z.object({
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(25).default(12),
}).strict();

function invalid(code: string, message: string): PersistenceError {
  return new PersistenceError(400, code, message);
}

function parseProjectId(value: string): string {
  const result = uuid.safeParse(value);
  if (!result.success) throw invalid("invalid_project_id", "A valid project ID is required.");
  return result.data;
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown, requireFields = false): T {
  const result = schema.safeParse(value);
  if (!result.success || (requireFields && Object.keys(result.data as object).length === 0)) {
    throw invalid("invalid_project_input", "Valid project fields are required.");
  }
  return result.data;
}

function parseQuery<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw invalid("invalid_project_search", "Project search parameters are invalid.");
  return result.data;
}

function notFound(response: import("express").Response): void {
  response.status(404).json({ error: { code: "project_not_found", message: "Project not found." } });
}

export function createProjectsRouter(
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
  repository: ProjectRepository,
  recordEvent?: ProductEventRecorder,
): Router {
  const router = Router();

  router.post("/api/projects", authenticate, rateLimiter, async (request, response) => {
    try {
      const input = parseBody(createSchema, request.body) as CreateProjectInput;
      const { userId, accessToken } = response.locals.auth;
      const project = await repository.createProject(userId, accessToken, input);
      await trackProductEvent(recordEvent, userId, "project_created", {}, project.id);
      response.status(201).json({ project });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.get("/api/projects", authenticate, rateLimiter, async (request, response) => {
    try {
      const search = parseQuery(discoverySchema, request.query) as ProjectSearch;
      const { userId, accessToken } = response.locals.auth;
      response.json(await repository.searchProjects(userId, accessToken, search));
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.get("/api/me/projects", authenticate, rateLimiter, async (request, response) => {
    try {
      const search = parseQuery(ownerListSchema, request.query) as OwnerProjectSearch;
      const { userId, accessToken } = response.locals.auth;
      response.json(await repository.listMyProjects(userId, accessToken, search));
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.get("/api/projects/:projectId", authenticate, rateLimiter, async (request, response) => {
    try {
      const projectId = parseProjectId(request.params.projectId);
      const { userId, accessToken } = response.locals.auth;
      const result = await repository.getProject(userId, accessToken, projectId);
      if (!result) return notFound(response);
      response.json(result);
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.patch("/api/projects/:projectId", authenticate, rateLimiter, async (request, response) => {
    try {
      const projectId = parseProjectId(request.params.projectId);
      const input = parseBody(updateSchema, request.body, true) as UpdateProjectInput;
      const { userId, accessToken } = response.locals.auth;
      const project = await repository.updateProject(userId, accessToken, projectId, input);
      if (!project) return notFound(response);
      response.json({ project });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.delete("/api/projects/:projectId", authenticate, rateLimiter, async (request, response) => {
    try {
      const projectId = parseProjectId(request.params.projectId);
      const { userId, accessToken } = response.locals.auth;
      const project = await repository.archiveProject(userId, accessToken, projectId);
      if (!project) return notFound(response);
      response.json({ project, archived: true });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  return router;
}
