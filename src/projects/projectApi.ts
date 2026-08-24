import type {
  MyProject,
  ProjectDetail,
  ProjectListResponse,
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
