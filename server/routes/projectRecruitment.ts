import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";
import type {
  CreateProjectRoleInput,
  ProjectRecruitmentRepository,
  UpdateProjectRoleInput,
} from "../persistence/projectRecruitment";
import type { ProductEventRecorder } from "../persistence/beta";
import { trackProductEvent } from "../beta/trackProductEvent";

const uuid = z.string().uuid();
const note = z.string().max(1000).default("");
const roleSkill = z.object({
  skill_id: uuid,
  requirement: z.enum(["required", "optional"]),
  weight: z.number().int().min(1).max(100),
}).strict();
const uniqueSkills = (values: Array<{ skill_id: string }>) =>
  new Set(values.map(({ skill_id }) => skill_id)).size === values.length;

const createRoleSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  discipline_id: uuid.nullable().optional(),
  positions_total: z.number().int().min(1).max(20).optional(),
  skills: z.array(roleSkill).max(20).refine(uniqueSkills, "Role skills must be unique.").optional(),
}).strict();

const updateRoleSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  discipline_id: uuid.nullable().optional(),
  positions_total: z.number().int().min(1).max(20).optional(),
  status: z.enum(["open", "closed"]).optional(),
  skills: z.array(roleSkill).max(20).refine(uniqueSkills, "Role skills must be unique.").optional(),
}).strict();

const applicationSchema = z.object({ note: note.optional() }).strict();
const invitationSchema = z.object({
  invitee_id: uuid,
  note: note.optional(),
  expires_at: z.string().datetime({ offset: true }).optional(),
}).strict();

function invalid(code: string, message: string): PersistenceError {
  return new PersistenceError(400, code, message);
}

function parseId(value: string, code: string): string {
  const result = uuid.safeParse(value);
  if (!result.success) throw invalid(code, "A valid project resource ID is required.");
  return result.data;
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown, requireFields = false): T {
  const result = schema.safeParse(value);
  if (!result.success || (requireFields && Object.keys(result.data as object).length === 0)) {
    throw invalid("invalid_project_recruitment_input", "Valid project recruiting fields are required.");
  }
  return result.data;
}

export function createProjectRecruitmentRouter(
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
  repository: ProjectRecruitmentRepository,
  recordEvent?: ProductEventRecorder,
): Router {
  const router = Router();

  router.get("/api/projects/:projectId/roles", authenticate, rateLimiter, async (request, response) => {
    try {
      const projectId = parseId(request.params.projectId, "invalid_project_id");
      response.json({ roles: await repository.listRoles(response.locals.auth.accessToken, projectId) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.post("/api/projects/:projectId/roles", authenticate, rateLimiter, async (request, response) => {
    try {
      const projectId = parseId(request.params.projectId, "invalid_project_id");
      const input = parseBody(createRoleSchema, request.body) as CreateProjectRoleInput;
      const role = await repository.createRole(response.locals.auth.accessToken, projectId, input);
      response.status(201).json({ role });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.patch("/api/project-roles/:roleId", authenticate, rateLimiter, async (request, response) => {
    try {
      const roleId = parseId(request.params.roleId, "invalid_project_role_id");
      const input = parseBody(updateRoleSchema, request.body, true) as UpdateProjectRoleInput;
      response.json({ role: await repository.updateRole(response.locals.auth.accessToken, roleId, input) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.delete("/api/project-roles/:roleId", authenticate, rateLimiter, async (request, response) => {
    try {
      const roleId = parseId(request.params.roleId, "invalid_project_role_id");
      response.json({ role: await repository.closeRole(response.locals.auth.accessToken, roleId), closed: true });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.post("/api/project-roles/:roleId/applications", authenticate, rateLimiter, async (request, response) => {
    try {
      const roleId = parseId(request.params.roleId, "invalid_project_role_id");
      const input = parseBody(applicationSchema, request.body ?? {});
      const application = await repository.createApplication(
        response.locals.auth.accessToken,
        roleId,
        input.note ?? "",
      );
      await trackProductEvent(recordEvent, response.locals.auth.userId, "project_applied", {}, application.id);
      await trackProductEvent(recordEvent, response.locals.auth.userId, "project_application_submitted", {}, application.id);
      response.status(201).json({ application });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.get("/api/me/project-applications", authenticate, rateLimiter, async (_request, response) => {
    try {
      const { accessToken, userId } = response.locals.auth;
      response.json({ applications: await repository.listMyApplications(accessToken, userId) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.get("/api/projects/:projectId/applications", authenticate, rateLimiter, async (request, response) => {
    try {
      const projectId = parseId(request.params.projectId, "invalid_project_id");
      response.json({ applications: await repository.listProjectApplications(response.locals.auth.accessToken, projectId) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.post("/api/project-applications/:applicationId/accept", authenticate, rateLimiter, async (request, response) => {
    try {
      const id = parseId(request.params.applicationId, "invalid_project_application_id");
      response.json({ application: await repository.acceptApplication(response.locals.auth.accessToken, id) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.post("/api/project-applications/:applicationId/reject", authenticate, rateLimiter, async (request, response) => {
    try {
      const id = parseId(request.params.applicationId, "invalid_project_application_id");
      response.json({ application: await repository.rejectApplication(response.locals.auth.accessToken, id) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.post("/api/project-applications/:applicationId/withdraw", authenticate, rateLimiter, async (request, response) => {
    try {
      const id = parseId(request.params.applicationId, "invalid_project_application_id");
      response.json({ application: await repository.withdrawApplication(response.locals.auth.accessToken, id) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.post("/api/project-roles/:roleId/invitations", authenticate, rateLimiter, async (request, response) => {
    try {
      const roleId = parseId(request.params.roleId, "invalid_project_role_id");
      const input = parseBody(invitationSchema, request.body);
      const invitation = await repository.createInvitation(
        response.locals.auth.accessToken,
        roleId,
        input.invitee_id,
        input.note ?? "",
        input.expires_at,
      );
      await trackProductEvent(recordEvent, response.locals.auth.userId, "engimatch_action_taken", {
        action: "project_invitation_created",
      }, invitation.id);
      response.status(201).json({ invitation });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.get("/api/me/project-invitations", authenticate, rateLimiter, async (_request, response) => {
    try {
      const { accessToken, userId } = response.locals.auth;
      response.json({ invitations: await repository.listMyInvitations(accessToken, userId) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.get("/api/projects/:projectId/invitations", authenticate, rateLimiter, async (request, response) => {
    try {
      const projectId = parseId(request.params.projectId, "invalid_project_id");
      response.json({ invitations: await repository.listProjectInvitations(response.locals.auth.accessToken, projectId) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.post("/api/project-invitations/:invitationId/accept", authenticate, rateLimiter, async (request, response) => {
    try {
      const id = parseId(request.params.invitationId, "invalid_project_invitation_id");
      const invitation = await repository.acceptInvitation(response.locals.auth.accessToken, id);
      await trackProductEvent(recordEvent, response.locals.auth.userId, "project_invitation_accepted", {}, invitation.id);
      response.json({ invitation });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.post("/api/project-invitations/:invitationId/reject", authenticate, rateLimiter, async (request, response) => {
    try {
      const id = parseId(request.params.invitationId, "invalid_project_invitation_id");
      response.json({ invitation: await repository.rejectInvitation(response.locals.auth.accessToken, id) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.post("/api/project-invitations/:invitationId/cancel", authenticate, rateLimiter, async (request, response) => {
    try {
      const id = parseId(request.params.invitationId, "invalid_project_invitation_id");
      response.json({ invitation: await repository.cancelInvitation(response.locals.auth.accessToken, id) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  return router;
}
