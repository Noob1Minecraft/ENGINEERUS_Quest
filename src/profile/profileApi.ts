import type {
  CanonicalUser,
  Language,
  ProfileSearchResponse,
  ProfileTaxonomies,
  PublicProfile,
} from '../types';
import { apiFetch } from '../utils/api';

export type ProfileFetcher = <T>(endpoint: string, options?: RequestInit) => Promise<T>;

export type ProfileUpdateInput = {
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  university_name?: string | null;
  primary_discipline_id?: string | null;
  bio?: string | null;
  portfolio_url?: string | null;
  profile_visibility?: 'public' | 'authenticated' | 'private';
  portfolio_visibility?: 'public' | 'authenticated' | 'private';
  available_for_projects?: boolean;
  skills?: Array<{ id: string; proficiency?: number | null }>;
  tools?: Array<{ id: string; proficiency?: number | null }>;
  interests?: string[];
  languages?: Array<{ language_code: string; proficiency?: number | null }>;
};

export type SettingsUpdateInput = {
  preferred_lang?: Language;
  allow_project_invitations?: boolean;
  allow_direct_messages?: boolean;
};

export type ProfileSearchInput = {
  query?: string;
  discipline?: string;
  skill?: string;
  available?: boolean;
  cursor?: string;
  limit?: number;
};

export async function loadProfileWorkspace(fetcher: ProfileFetcher = apiFetch): Promise<{
  account: CanonicalUser;
  taxonomies: ProfileTaxonomies;
}> {
  const [account, taxonomies] = await Promise.all([
    fetcher<CanonicalUser>('/api/me'),
    fetcher<ProfileTaxonomies>('/api/profile-taxonomies'),
  ]);
  return { account, taxonomies };
}

export async function saveOwnerProfile(
  update: ProfileUpdateInput,
  fetcher: ProfileFetcher = apiFetch,
): Promise<CanonicalUser> {
  await fetcher('/api/me/profile', { method: 'PATCH', body: JSON.stringify(update) });
  return fetcher<CanonicalUser>('/api/me');
}

export async function saveOwnerSettings(
  update: SettingsUpdateInput,
  fetcher: ProfileFetcher = apiFetch,
): Promise<CanonicalUser> {
  await fetcher('/api/me/profile-settings', { method: 'PATCH', body: JSON.stringify(update) });
  return fetcher<CanonicalUser>('/api/me');
}

export async function searchProfiles(
  input: ProfileSearchInput,
  fetcher: ProfileFetcher = apiFetch,
): Promise<ProfileSearchResponse> {
  const params = new URLSearchParams();
  if (input.query) params.set('query', input.query);
  if (input.discipline) params.set('discipline', input.discipline);
  if (input.skill) params.set('skill', input.skill);
  if (input.available !== undefined) params.set('available', String(input.available));
  if (input.cursor) params.set('cursor', input.cursor);
  params.set('limit', String(Math.min(25, Math.max(1, input.limit ?? 12))));
  return fetcher<ProfileSearchResponse>(`/api/profiles?${params.toString()}`);
}

export async function loadPublicProfile(
  profileId: string,
  fetcher: ProfileFetcher = apiFetch,
): Promise<PublicProfile> {
  const result = await fetcher<{ profile: PublicProfile }>(`/api/profiles/${profileId}`);
  return result.profile;
}
