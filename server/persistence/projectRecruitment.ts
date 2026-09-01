import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerEnv } from "../config/env";
import { createSupabaseUserClient } from "../lib/supabaseUser";
import { PersistenceError } from "./errors";
import type { ProjectStatus } from "./projects";
import type { TaxonomyItem } from "./profiles";

export type ProjectRoleStatus = "open" | "filled" | "closed";
export type RoleSkillRequirement = "required" | "optional";
export type ProjectRequestStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "cancelled";
export type ProjectInvitationStatus = Exclude<ProjectRequestStatus, "withdrawn">;

export type SafeProfileSummary = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type ProjectRoleSkill = {
  skill: TaxonomyItem;
  requirement: RoleSkillRequirement;
  weight: number;
};

export type ProjectRole = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  discipline_id: string | null;
  discipline: TaxonomyItem | null;
  positions_total: number;
  positions_filled: number;
  positions_available: number;
  status: ProjectRoleStatus;
  skills: ProjectRoleSkill[];
  created_at: string;
  updated_at: string;
};

export type RoleSkillInput = {
  skill_id: string;
  requirement: RoleSkillRequirement;
  weight: number;
};

export type CreateProjectRoleInput = {
  title: string;
  description?: string;
  discipline_id?: string | null;
  positions_total?: number;
  skills?: RoleSkillInput[];
};

export type UpdateProjectRoleInput = Partial<CreateProjectRoleInput> & {
  status?: "open" | "closed";
};

export type ProjectRequestRoleSummary = {
  id: string;
  project_id: string;
  title: string;
  status: ProjectRoleStatus;
  project: { id: string; owner_id: string; title: string; status: ProjectStatus } | null;
};

export type ProjectApplication = {
  id: string;
  project_id: string;
  role_id: string;
  applicant_id: string;
  applicant: SafeProfileSummary | null;
  role: ProjectRequestRoleSummary | null;
  note: string;
  status: ProjectRequestStatus;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
};

export type ProjectInvitation = {
  id: string;
  project_id: string;
  role_id: string;
  invitee_id: string;
  inviter_id: string;
  invitee: SafeProfileSummary | null;
  inviter: SafeProfileSummary | null;
  role: ProjectRequestRoleSummary | null;
  note: string;
  status: ProjectInvitationStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
};

type Embedded<T> = T | T[] | null;
type RoleRow = Omit<ProjectRole, "discipline" | "positions_filled" | "positions_available" | "skills"> & {
  discipline: Embedded<TaxonomyItem>;
  skills: Array<{ requirement: RoleSkillRequirement; weight: number; skill: Embedded<TaxonomyItem> }>;
  members: Array<{ user_id: string }>;
};
type RequestRoleRow = Omit<ProjectRequestRoleSummary, "project"> & {
  project: Embedded<{ id: string; owner_id: string; title: string; status: ProjectStatus }>;
};
type ApplicationRow = Omit<ProjectApplication, "applicant" | "role"> & {
  applicant: Embedded<SafeProfileSummary>;
  role: Embedded<RequestRoleRow>;
};
type InvitationRow = Omit<ProjectInvitation, "invitee" | "inviter" | "role"> & {
  invitee: Embedded<SafeProfileSummary>;
  inviter: Embedded<SafeProfileSummary>;
  role: Embedded<RequestRoleRow>;
};

const TAXONOMY_COLUMNS = "id,slug,label_ru,label_kk,label_en";
const SAFE_PROFILE_COLUMNS = "id,username,display_name,avatar_url";
const ROLE_COLUMNS = [
  "id", "project_id", "title", "description", "discipline_id",
  `discipline:engineering_disciplines(${TAXONOMY_COLUMNS})`,
  "positions_total", "status", "created_at", "updated_at",
  `skills:project_role_skills(requirement,weight,skill:skills(${TAXONOMY_COLUMNS}))`,
  "members:project_members(user_id)",
].join(",");
const REQUEST_ROLE_COLUMNS = "id,project_id,title,status,project:projects(id,owner_id,title,status)";
const APPLICATION_COLUMNS = [
  "id", "project_id", "role_id", "applicant_id", "note", "status",
  "created_at", "updated_at", "decided_at",
  `applicant:profiles!project_applications_applicant_id_fkey(${SAFE_PROFILE_COLUMNS})`,
  `role:project_roles(${REQUEST_ROLE_COLUMNS})`,
].join(",");
const INVITATION_COLUMNS = [
  "id", "project_id", "role_id", "invitee_id", "inviter_id", "note", "status",
  "expires_at", "created_at", "updated_at", "decided_at",
  `invitee:profiles!project_invitations_invitee_id_fkey(${SAFE_PROFILE_COLUMNS})`,
  `inviter:profiles!project_invitations_inviter_id_fkey(${SAFE_PROFILE_COLUMNS})`,
  `role:project_roles(${REQUEST_ROLE_COLUMNS})`,
].join(",");

const CONFLICT_MESSAGES = new Set([
  "already_project_member", "duplicate_project_application", "duplicate_project_invitation",
  "project_application_not_pending", "project_invitation_not_pending", "project_invitation_expired",
  "project_role_full", "project_role_not_open", "project_not_recruiting",
]);
const FORBIDDEN_MESSAGES = new Set([
  "project_role_forbidden", "project_application_forbidden", "project_invitation_forbidden",
  "self_application_forbidden", "self_invitation_forbidden", "project_invitations_disabled",
]);
const NOT_FOUND_MESSAGES = new Set([
  "project_not_found", "project_role_not_found", "project_application_not_found", "project_invitation_not_found",
]);

function one<T>(value: Embedded<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function recruitmentFailure(
  error: { code?: string; message?: string } | null,
  fallbackCode = "project_recruitment_unavailable",
  fallbackMessage = "Project recruiting is temporarily unavailable.",
): never {
  const databaseMessage = error?.message?.split("\n")[0]?.trim() ?? "";
  if (error?.code === "23505") {
    throw new PersistenceError(409, "duplicate_project_request", "A matching pending project request already exists.");
  }
  if (NOT_FOUND_MESSAGES.has(databaseMessage)) {
    throw new PersistenceError(404, databaseMessage, "The requested project resource was not found.");
  }
  if (FORBIDDEN_MESSAGES.has(databaseMessage) || error?.code === "42501") {
    throw new PersistenceError(403, databaseMessage || "project_recruitment_forbidden", "This project action is not allowed.");
  }
  if (CONFLICT_MESSAGES.has(databaseMessage)) {
    throw new PersistenceError(409, databaseMessage, "The project request conflicts with its current state.");
  }
  if (error?.code === "23503" || error?.code === "23514" || error?.code === "22023") {
    throw new PersistenceError(400, databaseMessage || "invalid_project_recruitment_input", "The project recruiting input is invalid.");
  }
  throw new PersistenceError(503, fallbackCode, fallbackMessage);
}

function mapRequestRole(value: Embedded<RequestRoleRow>): ProjectRequestRoleSummary | null {
  const role = one(value);
  return role ? { ...role, project: one(role.project) } : null;
}

function mapRole(row: RoleRow): ProjectRole {
  const filled = row.members?.length ?? 0;
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    discipline_id: row.discipline_id,
    discipline: one(row.discipline),
    positions_total: row.positions_total,
    positions_filled: filled,
    positions_available: Math.max(0, row.positions_total - filled),
    status: row.status,
    skills: (row.skills ?? []).flatMap((entry) => {
      const skill = one(entry.skill);
      return skill ? [{ skill, requirement: entry.requirement, weight: entry.weight }] : [];
    }),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapApplication(row: ApplicationRow): ProjectApplication {
  return { ...row, applicant: one(row.applicant), role: mapRequestRole(row.role) };
}

function mapInvitation(row: InvitationRow): ProjectInvitation {
  return {
    ...row,
    invitee: one(row.invitee),
    inviter: one(row.inviter),
    role: mapRequestRole(row.role),
  };
}

function roleSkillArrays(skills: RoleSkillInput[] | undefined) {
  if (skills === undefined) return {};
  return {
    p_skill_ids: skills.map(({ skill_id }) => skill_id),
    p_skill_requirements: skills.map(({ requirement }) => requirement),
    p_skill_weights: skills.map(({ weight }) => weight),
  };
}

export function createProjectRecruitmentRepository(env: ServerEnv) {
  const client = (token: string): SupabaseClient => createSupabaseUserClient(env, token);

  async function loadRole(db: SupabaseClient, roleId: string): Promise<ProjectRole> {
    const result = await db.from("project_roles").select(ROLE_COLUMNS).eq("id", roleId).single();
    if (result.error) recruitmentFailure(result.error, "project_role_unavailable", "The project role is unavailable.");
    return mapRole(result.data as unknown as RoleRow);
  }

  async function loadApplication(db: SupabaseClient, applicationId: string): Promise<ProjectApplication> {
    const result = await db.from("project_applications").select(APPLICATION_COLUMNS).eq("id", applicationId).single();
    if (result.error) recruitmentFailure(result.error, "project_application_unavailable", "The project application is unavailable.");
    return mapApplication(result.data as unknown as ApplicationRow);
  }

  async function loadInvitation(db: SupabaseClient, invitationId: string): Promise<ProjectInvitation> {
    const result = await db.from("project_invitations").select(INVITATION_COLUMNS).eq("id", invitationId).single();
    if (result.error) recruitmentFailure(result.error, "project_invitation_unavailable", "The project invitation is unavailable.");
    return mapInvitation(result.data as unknown as InvitationRow);
  }

  return {
    async listRoles(accessToken: string, projectId: string): Promise<ProjectRole[]> {
      const result = await client(accessToken).from("project_roles").select(ROLE_COLUMNS)
        .eq("project_id", projectId).order("created_at", { ascending: true });
      if (result.error) recruitmentFailure(result.error);
      return (result.data as unknown as RoleRow[]).map(mapRole);
    },

    async createRole(accessToken: string, projectId: string, input: CreateProjectRoleInput): Promise<ProjectRole> {
      const db = client(accessToken);
      const result = await db.rpc("create_project_role", {
        p_project_id: projectId,
        p_title: input.title,
        p_description: input.description ?? "",
        p_discipline_id: input.discipline_id ?? null,
        p_positions_total: input.positions_total ?? 1,
        ...roleSkillArrays(input.skills ?? []),
      });
      if (result.error) recruitmentFailure(result.error);
      return loadRole(db, result.data as string);
    },

    async updateRole(accessToken: string, roleId: string, input: UpdateProjectRoleInput): Promise<ProjectRole> {
      const db = client(accessToken);
      const parameters: Record<string, unknown> = {
        p_role_id: roleId,
        p_title: input.title ?? null,
        p_description: input.description ?? null,
        p_positions_total: input.positions_total ?? null,
        p_status: input.status ?? null,
        p_discipline_id: input.discipline_id ?? null,
        p_set_discipline: Object.prototype.hasOwnProperty.call(input, "discipline_id"),
        ...roleSkillArrays(input.skills),
      };
      const result = await db.rpc("update_project_role", parameters);
      if (result.error) recruitmentFailure(result.error);
      return loadRole(db, roleId);
    },

    async closeRole(accessToken: string, roleId: string): Promise<ProjectRole> {
      const db = client(accessToken);
      const result = await db.rpc("close_project_role", { p_role_id: roleId });
      if (result.error) recruitmentFailure(result.error);
      return loadRole(db, roleId);
    },

    async createApplication(accessToken: string, roleId: string, note: string): Promise<ProjectApplication> {
      const db = client(accessToken);
      const result = await db.rpc("create_project_application", { p_role_id: roleId, p_note: note });
      if (result.error) recruitmentFailure(result.error);
      return loadApplication(db, result.data as string);
    },

    async listMyApplications(accessToken: string, userId: string): Promise<ProjectApplication[]> {
      const result = await client(accessToken).from("project_applications").select(APPLICATION_COLUMNS)
        .eq("applicant_id", userId).order("created_at", { ascending: false });
      if (result.error) recruitmentFailure(result.error);
      return (result.data as unknown as ApplicationRow[]).map(mapApplication);
    },

    async listProjectApplications(accessToken: string, projectId: string): Promise<ProjectApplication[]> {
      const result = await client(accessToken).from("project_applications").select(APPLICATION_COLUMNS)
        .eq("project_id", projectId).order("created_at", { ascending: false });
      if (result.error) recruitmentFailure(result.error);
      return (result.data as unknown as ApplicationRow[]).map(mapApplication);
    },

    async acceptApplication(accessToken: string, applicationId: string): Promise<ProjectApplication> {
      const db = client(accessToken);
      const result = await db.rpc("accept_project_application", { p_application_id: applicationId });
      if (result.error) recruitmentFailure(result.error);
      return loadApplication(db, applicationId);
    },

    async rejectApplication(accessToken: string, applicationId: string): Promise<ProjectApplication> {
      const db = client(accessToken);
      const result = await db.rpc("reject_project_application", { p_application_id: applicationId });
      if (result.error) recruitmentFailure(result.error);
      return loadApplication(db, applicationId);
    },

    async withdrawApplication(accessToken: string, applicationId: string): Promise<ProjectApplication> {
      const db = client(accessToken);
      const result = await db.rpc("withdraw_project_application", { p_application_id: applicationId });
      if (result.error) recruitmentFailure(result.error);
      return loadApplication(db, applicationId);
    },

    async createInvitation(
      accessToken: string,
      roleId: string,
      inviteeId: string,
      note: string,
      expiresAt?: string,
    ): Promise<ProjectInvitation> {
      const db = client(accessToken);
      const result = await db.rpc("create_project_invitation", {
        p_role_id: roleId,
        p_invitee_id: inviteeId,
        p_note: note,
        p_expires_at: expiresAt ?? null,
      });
      if (result.error) recruitmentFailure(result.error);
      return loadInvitation(db, result.data as string);
    },

    async listMyInvitations(accessToken: string, userId: string): Promise<ProjectInvitation[]> {
      const result = await client(accessToken).from("project_invitations").select(INVITATION_COLUMNS)
        .eq("invitee_id", userId).order("created_at", { ascending: false });
      if (result.error) recruitmentFailure(result.error);
      return (result.data as unknown as InvitationRow[]).map(mapInvitation);
    },

    async listProjectInvitations(accessToken: string, projectId: string): Promise<ProjectInvitation[]> {
      const result = await client(accessToken).from("project_invitations").select(INVITATION_COLUMNS)
        .eq("project_id", projectId).order("created_at", { ascending: false });
      if (result.error) recruitmentFailure(result.error);
      return (result.data as unknown as InvitationRow[]).map(mapInvitation);
    },

    async acceptInvitation(accessToken: string, invitationId: string): Promise<ProjectInvitation> {
      const db = client(accessToken);
      const result = await db.rpc("accept_project_invitation", { p_invitation_id: invitationId });
      if (result.error) recruitmentFailure(result.error);
      return loadInvitation(db, invitationId);
    },

    async rejectInvitation(accessToken: string, invitationId: string): Promise<ProjectInvitation> {
      const db = client(accessToken);
      const result = await db.rpc("reject_project_invitation", { p_invitation_id: invitationId });
      if (result.error) recruitmentFailure(result.error);
      return loadInvitation(db, invitationId);
    },

    async cancelInvitation(accessToken: string, invitationId: string): Promise<ProjectInvitation> {
      const db = client(accessToken);
      const result = await db.rpc("cancel_project_invitation", { p_invitation_id: invitationId });
      if (result.error) recruitmentFailure(result.error);
      return loadInvitation(db, invitationId);
    },
  };
}

export type ProjectRecruitmentRepository = ReturnType<typeof createProjectRecruitmentRepository>;
