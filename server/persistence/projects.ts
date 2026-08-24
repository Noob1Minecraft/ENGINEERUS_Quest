import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";
import { createSupabaseUserClient } from "../lib/supabaseUser";
import { PersistenceError } from "./errors";
import type { TaxonomyItem } from "./profiles";

export type ProjectStatus = "draft" | "open" | "in_progress" | "completed" | "cancelled" | "archived";
export type ProjectVisibility = "private" | "authenticated" | "public";

export type ProjectOwnerSummary = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type ProjectSummary = {
  id: string;
  title: string;
  description: string;
  primary_discipline: TaxonomyItem | null;
  status: ProjectStatus;
  owner: ProjectOwnerSummary | null;
  created_at: string;
  updated_at: string;
};

export type ProjectDetail = ProjectSummary;

export type MyProject = ProjectDetail & {
  owner_id: string;
  primary_discipline_id: string | null;
  visibility: ProjectVisibility;
};

export type CreateProjectInput = {
  title: string;
  description?: string;
  primary_discipline_id?: string | null;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
};

export type UpdateProjectInput = Partial<CreateProjectInput>;

export type ProjectSearch = {
  query?: string;
  discipline?: string;
  status?: "open" | "in_progress" | "completed";
  cursor?: string;
  limit: number;
};

export type OwnerProjectSearch = Pick<ProjectSearch, "cursor" | "limit">;

type EmbeddedTaxonomy = TaxonomyItem | TaxonomyItem[] | null;
type ProjectRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  primary_discipline_id: string | null;
  primary_discipline: EmbeddedTaxonomy;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  created_at: string;
  updated_at: string;
};

type OwnerRow = ProjectOwnerSummary & {
  profile_visibility: "public" | "authenticated" | "private";
};

const PROJECT_COLUMNS = [
  "id", "owner_id", "title", "description", "primary_discipline_id",
  "primary_discipline:engineering_disciplines(id,slug,label_ru,label_kk,label_en)",
  "status", "visibility", "created_at", "updated_at",
].join(",");

const DISCOVERABLE_STATUSES: ProjectStatus[] = ["open", "in_progress", "completed"];
const DISCOVERABLE_VISIBILITIES: ProjectVisibility[] = ["authenticated", "public"];

function projectFailure(error: { code?: string } | null, fallbackCode: string, fallbackMessage: string): never {
  if (error?.code === "23503") {
    throw new PersistenceError(400, "invalid_project_discipline", "The selected engineering discipline is invalid.");
  }
  if (error?.code === "23514") {
    throw new PersistenceError(400, "invalid_project_input", "The project fields do not satisfy validation rules.");
  }
  throw new PersistenceError(503, fallbackCode, fallbackMessage);
}

function taxonomy(value: EmbeddedTaxonomy): TaxonomyItem | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function loadOwnerSummaries(
  env: ServerEnv,
  requesterId: string,
  ownerIds: readonly string[],
): Promise<Map<string, ProjectOwnerSummary>> {
  const ids = [...new Set(ownerIds)];
  const owners = new Map<string, ProjectOwnerSummary>();
  if (ids.length === 0) return owners;

  const result = await createSupabaseAdminClient(env)
    .from("profiles")
    .select("id,username,display_name,avatar_url,profile_visibility")
    .in("id", ids);
  if (result.error) projectFailure(result.error, "projects_unavailable", "Projects are temporarily unavailable.");

  for (const row of result.data as OwnerRow[]) {
    if (row.id !== requesterId && row.profile_visibility === "private") continue;
    owners.set(row.id, {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
    });
  }
  return owners;
}

function mapSummary(row: ProjectRow, owners: Map<string, ProjectOwnerSummary>): ProjectSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    primary_discipline: taxonomy(row.primary_discipline),
    status: row.status,
    owner: owners.get(row.owner_id) ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMyProject(row: ProjectRow, owners: Map<string, ProjectOwnerSummary>): MyProject {
  return {
    ...mapSummary(row, owners),
    owner_id: row.owner_id,
    primary_discipline_id: row.primary_discipline_id,
    visibility: row.visibility,
  };
}

async function mapRows(
  env: ServerEnv,
  requesterId: string,
  rows: ProjectRow[],
): Promise<{ summaries: ProjectSummary[]; owners: Map<string, ProjectOwnerSummary> }> {
  const owners = await loadOwnerSummaries(env, requesterId, rows.map(({ owner_id }) => owner_id));
  return { summaries: rows.map((row) => mapSummary(row, owners)), owners };
}

function projectClient(env: ServerEnv, accessToken: string): SupabaseClient {
  return createSupabaseUserClient(env, accessToken);
}

export function createProjectRepository(env: ServerEnv) {
  async function updateOwnedProject(
    userId: string,
    accessToken: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<MyProject | null> {
    const result = await projectClient(env, accessToken)
      .from("projects")
      .update(input)
      .eq("id", projectId)
      .eq("owner_id", userId)
      .select(PROJECT_COLUMNS)
      .maybeSingle();
    if (result.error) projectFailure(result.error, "project_update_failed", "The project could not be updated.");
    if (!result.data) return null;
    const owners = await loadOwnerSummaries(env, userId, [userId]);
    return mapMyProject(result.data as unknown as ProjectRow, owners);
  }

  return {
    async createProject(
      userId: string,
      accessToken: string,
      input: CreateProjectInput,
    ): Promise<MyProject> {
      const result = await projectClient(env, accessToken)
        .from("projects")
        .insert({
          title: input.title,
          description: input.description ?? "",
          primary_discipline_id: input.primary_discipline_id ?? null,
          status: input.status ?? "draft",
          visibility: input.visibility ?? "private",
        })
        .select(PROJECT_COLUMNS)
        .single();
      if (result.error) projectFailure(result.error, "project_create_failed", "The project could not be created.");
      const row = result.data as unknown as ProjectRow;
      if (row.owner_id !== userId) {
        throw new PersistenceError(403, "project_owner_mismatch", "Project ownership could not be verified.");
      }
      const owners = await loadOwnerSummaries(env, userId, [userId]);
      return mapMyProject(row, owners);
    },

    async searchProjects(
      userId: string,
      accessToken: string,
      search: ProjectSearch,
    ): Promise<{ projects: ProjectSummary[]; next_cursor: string | null }> {
      let query = projectClient(env, accessToken)
        .from("projects")
        .select(PROJECT_COLUMNS)
        .in("status", DISCOVERABLE_STATUSES)
        .in("visibility", DISCOVERABLE_VISIBILITIES)
        .order("id", { ascending: true })
        .limit(search.limit + 1);
      if (search.query) {
        const pattern = `*${search.query}*`;
        query = query.or(`title.ilike.${pattern},description.ilike.${pattern}`);
      }
      if (search.discipline) query = query.eq("primary_discipline_id", search.discipline);
      if (search.status) query = query.eq("status", search.status);
      if (search.cursor) query = query.gt("id", search.cursor);
      const result = await query;
      if (result.error) projectFailure(result.error, "projects_unavailable", "Projects are temporarily unavailable.");
      const allRows = result.data as unknown as ProjectRow[];
      const rows = allRows.slice(0, search.limit);
      const { summaries } = await mapRows(env, userId, rows);
      return {
        projects: summaries,
        next_cursor: allRows.length > search.limit ? rows.at(-1)?.id ?? null : null,
      };
    },

    async listMyProjects(
      userId: string,
      accessToken: string,
      search: OwnerProjectSearch,
    ): Promise<{ projects: MyProject[]; next_cursor: string | null }> {
      let query = projectClient(env, accessToken)
        .from("projects")
        .select(PROJECT_COLUMNS)
        .eq("owner_id", userId)
        .order("id", { ascending: true })
        .limit(search.limit + 1);
      if (search.cursor) query = query.gt("id", search.cursor);
      const result = await query;
      if (result.error) projectFailure(result.error, "projects_unavailable", "Projects are temporarily unavailable.");
      const allRows = result.data as unknown as ProjectRow[];
      const rows = allRows.slice(0, search.limit);
      const { owners } = await mapRows(env, userId, rows);
      return {
        projects: rows.map((row) => mapMyProject(row, owners)),
        next_cursor: allRows.length > search.limit ? rows.at(-1)?.id ?? null : null,
      };
    },

    async getProject(
      userId: string,
      accessToken: string,
      projectId: string,
    ): Promise<{ project: ProjectDetail | MyProject; is_owner: boolean } | null> {
      const result = await projectClient(env, accessToken)
        .from("projects")
        .select(PROJECT_COLUMNS)
        .eq("id", projectId)
        .maybeSingle();
      if (result.error) projectFailure(result.error, "projects_unavailable", "Projects are temporarily unavailable.");
      if (!result.data) return null;
      const row = result.data as unknown as ProjectRow;
      const isOwner = row.owner_id === userId;
      const owners = await loadOwnerSummaries(env, userId, [row.owner_id]);
      return { project: isOwner ? mapMyProject(row, owners) : mapSummary(row, owners), is_owner: isOwner };
    },

    async updateProject(
      userId: string,
      accessToken: string,
      projectId: string,
      input: UpdateProjectInput,
    ): Promise<MyProject | null> {
      return updateOwnedProject(userId, accessToken, projectId, input);
    },

    async archiveProject(
      userId: string,
      accessToken: string,
      projectId: string,
    ): Promise<MyProject | null> {
      return updateOwnedProject(userId, accessToken, projectId, { status: "archived" });
    },
  };
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>;
