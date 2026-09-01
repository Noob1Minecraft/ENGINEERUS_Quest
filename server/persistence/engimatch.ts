import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";
import { createSupabaseUserClient } from "../lib/supabaseUser";
import { scoreEngiMatch, stableMatchSort, type MatchSkill } from "../matching/engimatchScoring";
import { isEligibleProjectRole, isEligibleTeammateProfile } from "../matching/engimatchEligibility";
import { PersistenceError } from "./errors";
import type { PublicProfile, ProfileCapability, ProfileLanguageItem, TaxonomyItem } from "./profiles";

const MAX_POOL = 100;
const PROFILE_COLUMNS = "id,username,display_name,avatar_url,university_name,primary_discipline_id,bio,portfolio_url,profile_visibility,portfolio_visibility,available_for_projects,created_at,updated_at";
const TAXONOMY_COLUMNS = "id,slug,label_ru,label_kk,label_en";

type ProfileRow = {
  id: string; username: string | null; display_name: string | null; avatar_url: string | null;
  university_name: string | null; primary_discipline_id: string | null; bio: string | null;
  portfolio_url: string | null; profile_visibility: "public" | "authenticated" | "private";
  portfolio_visibility: "public" | "authenticated" | "private"; available_for_projects: boolean;
  created_at: string; updated_at: string;
};
type ProjectRow = { id: string; owner_id: string; title: string; description: string; primary_discipline_id: string | null; status: string; visibility: string; created_at: string; updated_at: string };
type RoleRow = { id: string; project_id: string; title: string; description: string; discipline_id: string | null; positions_total: number; status: string; created_at: string; updated_at: string };
type RoleSkillRow = { role_id: string; skill_id: string; requirement: "required" | "optional" };
type RelationBundle = {
  skills: Map<string, ProfileCapability[]>; tools: Map<string, ProfileCapability[]>;
  interests: Map<string, TaxonomyItem[]>; languages: Map<string, ProfileLanguageItem[]>;
  disciplines: Map<string, TaxonomyItem>; taxonomies: Map<string, TaxonomyItem>;
};

export type EngiMatchQuery = { limit: number; minScore: number };
export type EngiMatchTeammate = ReturnType<typeof teammateResult>;
export type EngiMatchProject = ReturnType<typeof projectResult>;

function fail(error: { code?: string; message?: string } | null, code = "engimatch_unavailable", message = "EngiMatch is temporarily unavailable."): never {
  if (error?.code === "42501") throw new PersistenceError(403, "engimatch_forbidden", "This matching request is not allowed.");
  throw new PersistenceError(503, code, message);
}
function one<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value; }
function itemLabel(item: TaxonomyItem): string { return item.label_ru || item.label_kk || item.label_en || item.slug; }
function matchSkills(items: Array<TaxonomyItem | ProfileCapability>): MatchSkill[] { return items.map((item) => ({ id: item.id, label: itemLabel(item) })); }
function append<T>(map: Map<string, T[]>, id: string, value: T): void { map.set(id, [...(map.get(id) ?? []), value]); }

async function relations(admin: SupabaseClient, profileIds: string[], extraSkillIds: string[] = [], extraDisciplineIds: string[] = []): Promise<RelationBundle> {
  const skills = new Map<string, ProfileCapability[]>(), tools = new Map<string, ProfileCapability[]>(), interests = new Map<string, TaxonomyItem[]>(), languages = new Map<string, ProfileLanguageItem[]>(), disciplines = new Map<string, TaxonomyItem>(), taxonomies = new Map<string, TaxonomyItem>();
  if (!profileIds.length && !extraSkillIds.length) return { skills, tools, interests, languages, disciplines, taxonomies };
  const [profiles, skillRows, toolRows, interestRows, languageRows] = await Promise.all([
    profileIds.length ? admin.from("profiles").select("id,primary_discipline_id").in("id", profileIds) : Promise.resolve({ data: [], error: null }),
    profileIds.length ? admin.from("profile_skills").select(`profile_id,proficiency,item:skills(${TAXONOMY_COLUMNS})`).in("profile_id", profileIds) : Promise.resolve({ data: [], error: null }),
    profileIds.length ? admin.from("profile_tools").select(`profile_id,proficiency,item:tools(${TAXONOMY_COLUMNS})`).in("profile_id", profileIds) : Promise.resolve({ data: [], error: null }),
    profileIds.length ? admin.from("profile_interests").select(`profile_id,item:interests(${TAXONOMY_COLUMNS})`).in("profile_id", profileIds) : Promise.resolve({ data: [], error: null }),
    profileIds.length ? admin.from("profile_languages").select("profile_id,language_code,proficiency").in("profile_id", profileIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (profiles.error || skillRows.error || toolRows.error || interestRows.error || languageRows.error) fail(null);
  const disciplineIds = [...new Set([...(profiles.data as Array<{ primary_discipline_id: string | null }>).flatMap((row) => row.primary_discipline_id ? [row.primary_discipline_id] : []), ...extraDisciplineIds])];
  const taxonomyIds = [...new Set([...disciplineIds, ...extraSkillIds])];
  if (taxonomyIds.length) {
    const [disciplineResult, skillResult] = await Promise.all([
      disciplineIds.length ? admin.from("engineering_disciplines").select(TAXONOMY_COLUMNS).in("id", disciplineIds) : Promise.resolve({ data: [], error: null }),
      extraSkillIds.length ? admin.from("skills").select(TAXONOMY_COLUMNS).in("id", extraSkillIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (disciplineResult.error || skillResult.error) fail(null);
    for (const item of disciplineResult.data as TaxonomyItem[]) disciplines.set(item.id, item);
    for (const item of skillResult.data as TaxonomyItem[]) taxonomies.set(item.id, item);
  }
  for (const row of skillRows.data as unknown as Array<{ profile_id: string; proficiency: number | null; item: TaxonomyItem | TaxonomyItem[] | null }>) { const item = one(row.item); if (item) append(skills, row.profile_id, { ...item, proficiency: row.proficiency }); }
  for (const row of toolRows.data as unknown as Array<{ profile_id: string; proficiency: number | null; item: TaxonomyItem | TaxonomyItem[] | null }>) { const item = one(row.item); if (item) append(tools, row.profile_id, { ...item, proficiency: row.proficiency }); }
  for (const row of interestRows.data as unknown as Array<{ profile_id: string; item: TaxonomyItem | TaxonomyItem[] | null }>) { const item = one(row.item); if (item) append(interests, row.profile_id, item); }
  for (const row of languageRows.data as ProfileLanguageItem[] & Array<{ profile_id: string }>) append(languages, row.profile_id, { language_code: row.language_code, proficiency: row.proficiency });
  return { skills, tools, interests, languages, disciplines, taxonomies };
}

function publicProfile(row: ProfileRow, bundle: RelationBundle): PublicProfile {
  return { id: row.id, username: row.username, display_name: row.display_name, avatar_url: row.avatar_url, university_name: row.university_name, primary_discipline: row.primary_discipline_id ? bundle.disciplines.get(row.primary_discipline_id) ?? null : null, bio: row.bio, portfolio_url: row.portfolio_visibility === "private" ? null : row.portfolio_url, available_for_projects: row.available_for_projects, skills: bundle.skills.get(row.id) ?? [], tools: bundle.tools.get(row.id) ?? [], interests: bundle.interests.get(row.id) ?? [], languages: bundle.languages.get(row.id) ?? [] };
}

function score(profile: ProfileRow, role: RoleRow, roleSkills: RoleSkillRow[], teamId: string, bundle: RelationBundle) {
  const required = roleSkills.filter((row) => row.requirement === "required").flatMap((row) => { const item = bundle.taxonomies.get(row.skill_id); return item ? [item] : []; });
  const optional = roleSkills.filter((row) => row.requirement === "optional").flatMap((row) => { const item = bundle.taxonomies.get(row.skill_id); return item ? [item] : []; });
  return scoreEngiMatch({ profileSkills: matchSkills(bundle.skills.get(profile.id) ?? []), requiredSkills: matchSkills(required), optionalSkills: matchSkills(optional), profileDisciplineId: profile.primary_discipline_id, roleDisciplineId: role.discipline_id, profileTools: matchSkills(bundle.tools.get(profile.id) ?? []), teamTools: matchSkills(bundle.tools.get(teamId) ?? []), profileInterests: matchSkills(bundle.interests.get(profile.id) ?? []), teamInterests: matchSkills(bundle.interests.get(teamId) ?? []), profileLanguages: (bundle.languages.get(profile.id) ?? []).map((row) => row.language_code), teamLanguages: (bundle.languages.get(teamId) ?? []).map((row) => row.language_code) });
}

function teammateResult(profile: PublicProfile, scored: ReturnType<typeof score>) { return { profile, ...scored, explanation: scored.reasons.join(" "), stable_id: profile.id }; }
function projectResult(project: ProjectRow, role: RoleRow, owner: ProfileRow | undefined, bundle: RelationBundle, scored: ReturnType<typeof score>) {
  return { project: { id: project.id, title: project.title, description: project.description, status: project.status, primary_discipline: project.primary_discipline_id ? bundle.disciplines.get(project.primary_discipline_id) ?? null : null, owner: owner && owner.profile_visibility !== "private" ? { id: owner.id, username: owner.username, display_name: owner.display_name, avatar_url: owner.avatar_url } : null, created_at: project.created_at, updated_at: project.updated_at }, role: { id: role.id, project_id: role.project_id, title: role.title, description: role.description, discipline_id: role.discipline_id, discipline: role.discipline_id ? bundle.disciplines.get(role.discipline_id) ?? null : null, positions_total: role.positions_total, status: role.status, skills: [] as Array<{ skill: TaxonomyItem; requirement: string }>, created_at: role.created_at }, ...scored, explanation: scored.reasons.join(" "), stable_id: `${project.id}:${role.id}` };
}

export function createEngiMatchRepository(env: ServerEnv) {
  const admin = () => createSupabaseAdminClient(env);
  const user = (token: string) => createSupabaseUserClient(env, token);
  return {
    async findTeammates(userId: string, accessToken: string, roleId: string, query: EngiMatchQuery) {
      const db = user(accessToken), privileged = admin();
      const roleResult = await db.from("project_roles").select("id,project_id,title,description,discipline_id,positions_total,status,created_at,updated_at").eq("id", roleId).maybeSingle();
      if (roleResult.error) fail(roleResult.error); if (!roleResult.data) throw new PersistenceError(404, "project_role_not_found", "Project role not found.");
      const role = roleResult.data as RoleRow;
      const [projectResultRow, memberRows, inviteRows, skillRows] = await Promise.all([
        db.from("projects").select("id,owner_id,title,description,primary_discipline_id,status,visibility,created_at,updated_at").eq("id", role.project_id).single(),
        db.from("project_members").select("user_id").eq("project_id", role.project_id),
        db.from("project_invitations").select("invitee_id").eq("role_id", roleId).eq("status", "pending").gt("expires_at", new Date().toISOString()),
        db.from("project_role_skills").select("role_id,skill_id,requirement").eq("role_id", roleId),
      ]);
      if (projectResultRow.error || memberRows.error || inviteRows.error || skillRows.error) fail(null);
      const project = projectResultRow.data as ProjectRow;
      if (project.owner_id !== userId) throw new PersistenceError(403, "engimatch_forbidden", "Only the project owner can match candidates for this role.");
      if (project.status !== "open" || role.status !== "open" || (memberRows.data?.length ?? 0) >= role.positions_total) throw new PersistenceError(409, "project_role_not_recruiting", "This role is not accepting candidates.");
      const excluded = new Set([userId, project.owner_id, ...(memberRows.data ?? []).map((row) => row.user_id), ...(inviteRows.data ?? []).map((row) => row.invitee_id)]);
      const candidatesResult = await privileged.from("profiles").select(PROFILE_COLUMNS).in("profile_visibility", ["public", "authenticated"]).eq("available_for_projects", true).order("created_at").order("id").limit(MAX_POOL);
      if (candidatesResult.error) fail(candidatesResult.error);
      const candidates = candidatesResult.data as unknown as ProfileRow[];
      const settings = candidates.length ? await privileged.from("profile_private_settings").select("profile_id,allow_project_invitations").in("profile_id", candidates.map(({ id }) => id)).eq("allow_project_invitations", true) : { data: [], error: null };
      if (settings.error) fail(settings.error); const allowed = new Set((settings.data ?? []).map((row) => row.profile_id));
      const eligible = candidates.filter((row) => isEligibleTeammateProfile(row, excluded, allowed));
      const roleSkills = skillRows.data as RoleSkillRow[]; const effectiveRole = { ...role, discipline_id: role.discipline_id ?? project.primary_discipline_id }; const bundle = await relations(privileged, [...eligible.map(({ id }) => id), project.owner_id], roleSkills.map(({ skill_id }) => skill_id), [effectiveRole.discipline_id, project.primary_discipline_id].filter((id): id is string => Boolean(id)));
      return { matches: stableMatchSort(eligible.map((row) => teammateResult(publicProfile(row, bundle), score(row, effectiveRole, roleSkills, project.owner_id, bundle))).filter(({ score }) => score >= query.minScore)).slice(0, query.limit).map(({ stable_id: _stableId, ...match }) => match), scoring_version: "engi-match-v1", candidate_pool_limited_to: MAX_POOL };
    },

    async findProjects(userId: string, accessToken: string, query: EngiMatchQuery) {
      const db = user(accessToken), privileged = admin();
      const profileResult = await privileged.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).single();
      if (profileResult.error) fail(profileResult.error); const profile = profileResult.data as unknown as ProfileRow;
      if (!profile.available_for_projects) return { matches: [], scoring_version: "engi-match-v1", ineligible_reason: "profile_not_available", candidate_pool_limited_to: MAX_POOL };
      const rolesResult = await db.from("project_roles").select("id,project_id,title,description,discipline_id,positions_total,status,created_at,updated_at").eq("status", "open").order("created_at").order("id").limit(MAX_POOL);
      if (rolesResult.error) fail(rolesResult.error);
      const roles = rolesResult.data as RoleRow[]; const roleIds = roles.map(({ id }) => id), projectIds = [...new Set(roles.map(({ project_id }) => project_id))];
      if (!roles.length) return { matches: [], scoring_version: "engi-match-v1", candidate_pool_limited_to: MAX_POOL };
      const [projectsResult, membersResult, applicationsResult, skillsResult] = await Promise.all([
        db.from("projects").select("id,owner_id,title,description,primary_discipline_id,status,visibility,created_at,updated_at").in("id", projectIds).eq("status", "open").in("visibility", ["public", "authenticated"]),
        db.from("project_members").select("project_id,user_id,role_id").in("project_id", projectIds),
        db.from("project_applications").select("role_id,applicant_id,status").in("role_id", roleIds).eq("applicant_id", userId).eq("status", "pending"),
        db.from("project_role_skills").select("role_id,skill_id,requirement").in("role_id", roleIds),
      ]);
      if (projectsResult.error || membersResult.error || applicationsResult.error || skillsResult.error) fail(null);
      const projects = new Map((projectsResult.data as ProjectRow[]).map((row) => [row.id, row])); const members = membersResult.data ?? []; const pending = new Set((applicationsResult.data ?? []).map((row) => row.role_id));
      const eligibleRoles = roles.filter((role) => { const project = projects.get(role.project_id); if (!project) return false; return isEligibleProjectRole({ requesterId: userId, ownerId: project.owner_id, projectStatus: project.status, projectVisibility: project.visibility, roleStatus: role.status, positionsTotal: role.positions_total, positionsFilled: members.filter((member) => member.role_id === role.id).length, requesterIsMember: members.some((member) => member.project_id === role.project_id && member.user_id === userId), hasPendingApplication: pending.has(role.id) }); });
      const ownerIds = [...new Set(eligibleRoles.flatMap((role) => { const project = projects.get(role.project_id); return project ? [project.owner_id] : []; }))];
      const ownersResult = ownerIds.length ? await privileged.from("profiles").select(PROFILE_COLUMNS).in("id", ownerIds) : { data: [], error: null }; if (ownersResult.error) fail(ownersResult.error);
      const owners = new Map((ownersResult.data as unknown as ProfileRow[]).map((row) => [row.id, row])); const roleSkills = skillsResult.data as RoleSkillRow[];
      const disciplineIds = [...new Set(eligibleRoles.flatMap((role) => { const project = projects.get(role.project_id); return [role.discipline_id, project?.primary_discipline_id].filter((id): id is string => Boolean(id)); }))];
      const bundle = await relations(privileged, [userId, ...ownerIds], roleSkills.map(({ skill_id }) => skill_id), disciplineIds);
      return { matches: stableMatchSort(eligibleRoles.map((role) => { const project = projects.get(role.project_id)!; const owner = owners.get(project.owner_id); const effectiveRole = { ...role, discipline_id: role.discipline_id ?? project.primary_discipline_id }; const roleSkillRows = roleSkills.filter((row) => row.role_id === role.id); const visibleTeamId = owner?.profile_visibility === "private" ? "" : project.owner_id; const result = projectResult(project, effectiveRole, owner, bundle, score(profile, effectiveRole, roleSkillRows, visibleTeamId, bundle)); result.role.skills = roleSkillRows.flatMap((row) => { const skill = bundle.taxonomies.get(row.skill_id); return skill ? [{ skill, requirement: row.requirement }] : []; }); return result; }).filter(({ score }) => score >= query.minScore)).slice(0, query.limit).map(({ stable_id: _stableId, ...match }) => match), scoring_version: "engi-match-v1", candidate_pool_limited_to: MAX_POOL };
    },
  };
}

export type EngiMatchRepository = ReturnType<typeof createEngiMatchRepository>;
