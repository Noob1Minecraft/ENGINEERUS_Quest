import type { EngiMatchProject, EngiMatchResponse, EngiMatchTeammate } from '../types';
import { apiFetch } from '../utils/api';
import type { ProjectFetcher } from '../projects/projectApi';

function suffix(limit = 12, minScore = 0): string {
  const params = new URLSearchParams({ limit: String(Math.min(25, Math.max(1, limit))), min_score: String(Math.min(100, Math.max(0, minScore))) });
  return params.toString();
}
export function findTeammates(roleId: string, limit = 12, minScore = 0, fetcher: ProjectFetcher = apiFetch) {
  return fetcher<EngiMatchResponse<EngiMatchTeammate>>(`/api/project-roles/${roleId}/matches?${suffix(limit, minScore)}`);
}
export function findProjectMatches(limit = 12, minScore = 0, fetcher: ProjectFetcher = apiFetch) {
  return fetcher<EngiMatchResponse<EngiMatchProject>>(`/api/engimatch/projects?${suffix(limit, minScore)}`);
}
