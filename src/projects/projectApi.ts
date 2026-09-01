import type {
  MyProject,
  ProjectApplication,
  ProjectDetail,
  ProjectInvitation,
  ProjectListResponse,
  ProjectRole,
  RoleSkillRequirement,
  ProjectStatus,
  ProjectVisibility,
} from '../types';
import { apiFetch } from '../utils/api';

export type ProjectFetcher = <T>(endpoint: string, options?: RequestInit) => Promise<T>;

export type CreateProjectInput = {
  title: string;
  description?: string;
  primary_discipline_id?: string | null;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
};

export type UpdateProjectInput = Partial<CreateProjectInput>;

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
  status?: 'open' | 'closed';
};

export type ProjectSearchInput = {
  query?: string;
  discipline?: string;
  status?: 'open' | 'in_progress' | 'completed';
  cursor?: string;
  limit?: number;
};

function listUrl(endpoint: string, input: ProjectSearchInput): string {
  const params = new URLSearchParams();
  if (input.query) params.set('query', input.query);
  if (input.discipline) params.set('discipline', input.discipline);
  if (input.status) params.set('status', input.status);
  if (input.cursor) params.set('cursor', input.cursor);
  params.set('limit', String(Math.min(25, Math.max(1, input.limit ?? 12))));
  return `${endpoint}?${params.toString()}`;
}

export function listMyProjects(
  input: Pick<ProjectSearchInput, 'cursor' | 'limit'> = {},
  fetcher: ProjectFetcher = apiFetch,
): Promise<ProjectListResponse<MyProject>> {
  return fetcher<ProjectListResponse<MyProject>>(listUrl('/api/me/projects', input));
}

export function discoverProjects(
  input: ProjectSearchInput = {},
  fetcher: ProjectFetcher = apiFetch,
): Promise<ProjectListResponse> {
  return fetcher<ProjectListResponse>(listUrl('/api/projects', input));
}

export async function createProject(
  input: CreateProjectInput,
  fetcher: ProjectFetcher = apiFetch,
): Promise<MyProject> {
  const result = await fetcher<{ project: MyProject }>('/api/projects', {
    method: 'POST', body: JSON.stringify(input),
  });
  return result.project;
}

export async function loadProject(
  projectId: string,
  fetcher: ProjectFetcher = apiFetch,
): Promise<{ project: ProjectDetail | MyProject; is_owner: boolean }> {
  return fetcher(`/api/projects/${projectId}`);
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
  fetcher: ProjectFetcher = apiFetch,
): Promise<MyProject> {
  const result = await fetcher<{ project: MyProject }>(`/api/projects/${projectId}`, {
    method: 'PATCH', body: JSON.stringify(input),
  });
  return result.project;
}

export async function archiveProject(
  projectId: string,
  fetcher: ProjectFetcher = apiFetch,
): Promise<MyProject> {
  const result = await fetcher<{ project: MyProject; archived: true }>(`/api/projects/${projectId}`, {
    method: 'DELETE',
  });
  return result.project;
}

export async function listProjectRoles(
  projectId: string,
  fetcher: ProjectFetcher = apiFetch,
): Promise<ProjectRole[]> {
  return (await fetcher<{ roles: ProjectRole[] }>(`/api/projects/${projectId}/roles`)).roles;
}

export async function createProjectRole(
  projectId: string,
  input: CreateProjectRoleInput,
  fetcher: ProjectFetcher = apiFetch,
): Promise<ProjectRole> {
  return (await fetcher<{ role: ProjectRole }>(`/api/projects/${projectId}/roles`, {
    method: 'POST', body: JSON.stringify(input),
  })).role;
}

export async function updateProjectRole(
  roleId: string,
  input: UpdateProjectRoleInput,
  fetcher: ProjectFetcher = apiFetch,
): Promise<ProjectRole> {
  return (await fetcher<{ role: ProjectRole }>(`/api/project-roles/${roleId}`, {
    method: 'PATCH', body: JSON.stringify(input),
  })).role;
}

export async function closeProjectRole(
  roleId: string,
  fetcher: ProjectFetcher = apiFetch,
): Promise<ProjectRole> {
  return (await fetcher<{ role: ProjectRole; closed: true }>(`/api/project-roles/${roleId}`, {
    method: 'DELETE',
  })).role;
}

export async function applyToProjectRole(
  roleId: string,
  note: string,
  fetcher: ProjectFetcher = apiFetch,
): Promise<ProjectApplication> {
  return (await fetcher<{ application: ProjectApplication }>(`/api/project-roles/${roleId}/applications`, {
    method: 'POST', body: JSON.stringify({ note }),
  })).application;
}

export async function listMyProjectApplications(
  fetcher: ProjectFetcher = apiFetch,
): Promise<ProjectApplication[]> {
  return (await fetcher<{ applications: ProjectApplication[] }>('/api/me/project-applications')).applications;
}

export async function listProjectApplications(
  projectId: string,
  fetcher: ProjectFetcher = apiFetch,
): Promise<ProjectApplication[]> {
  return (await fetcher<{ applications: ProjectApplication[] }>(`/api/projects/${projectId}/applications`)).applications;
}

async function applicationAction(
  applicationId: string,
  action: 'accept' | 'reject' | 'withdraw',
  fetcher: ProjectFetcher,
): Promise<ProjectApplication> {
  return (await fetcher<{ application: ProjectApplication }>(`/api/project-applications/${applicationId}/${action}`, {
    method: 'POST',
  })).application;
}

export const acceptProjectApplication = (id: string, fetcher: ProjectFetcher = apiFetch) =>
  applicationAction(id, 'accept', fetcher);
export const rejectProjectApplication = (id: string, fetcher: ProjectFetcher = apiFetch) =>
  applicationAction(id, 'reject', fetcher);
export const withdrawProjectApplication = (id: string, fetcher: ProjectFetcher = apiFetch) =>
  applicationAction(id, 'withdraw', fetcher);

export async function inviteToProjectRole(
  roleId: string,
  inviteeId: string,
  note: string,
  fetcher: ProjectFetcher = apiFetch,
): Promise<ProjectInvitation> {
  return (await fetcher<{ invitation: ProjectInvitation }>(`/api/project-roles/${roleId}/invitations`, {
    method: 'POST', body: JSON.stringify({ invitee_id: inviteeId, note }),
  })).invitation;
}

export async function listMyProjectInvitations(
  fetcher: ProjectFetcher = apiFetch,
): Promise<ProjectInvitation[]> {
  return (await fetcher<{ invitations: ProjectInvitation[] }>('/api/me/project-invitations')).invitations;
}

export async function listProjectInvitations(
  projectId: string,
  fetcher: ProjectFetcher = apiFetch,
): Promise<ProjectInvitation[]> {
  return (await fetcher<{ invitations: ProjectInvitation[] }>(`/api/projects/${projectId}/invitations`)).invitations;
}

async function invitationAction(
  invitationId: string,
  action: 'accept' | 'reject' | 'cancel',
  fetcher: ProjectFetcher,
): Promise<ProjectInvitation> {
  return (await fetcher<{ invitation: ProjectInvitation }>(`/api/project-invitations/${invitationId}/${action}`, {
    method: 'POST',
  })).invitation;
}

export const acceptProjectInvitation = (id: string, fetcher: ProjectFetcher = apiFetch) =>
  invitationAction(id, 'accept', fetcher);
export const rejectProjectInvitation = (id: string, fetcher: ProjectFetcher = apiFetch) =>
  invitationAction(id, 'reject', fetcher);
export const cancelProjectInvitation = (id: string, fetcher: ProjectFetcher = apiFetch) =>
  invitationAction(id, 'cancel', fetcher);
