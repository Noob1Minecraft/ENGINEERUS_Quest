export type Language = 'ru' | 'kk' | 'en';

export interface AuthIdentity {
  id: string;
  email: string | null;
}

export interface TaxonomyItem {
  id: string;
  slug: string;
  label_ru: string;
  label_kk: string;
  label_en: string;
}

export interface ProfileCapability extends TaxonomyItem {
  proficiency: number | null;
}

export interface ProfileLanguage {
  language_code: string;
  proficiency: number | null;
}

export interface PublicProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  university_name: string | null;
  primary_discipline: TaxonomyItem | null;
  bio: string | null;
  portfolio_url: string | null;
  available_for_projects: boolean;
  skills: ProfileCapability[];
  tools: ProfileCapability[];
  interests: TaxonomyItem[];
  languages: ProfileLanguage[];
}

export interface MyProfile extends PublicProfile {
  primary_discipline_id: string | null;
  profile_visibility: 'public' | 'authenticated' | 'private';
  portfolio_visibility: 'public' | 'authenticated' | 'private';
  created_at: string;
  updated_at: string;
}

export interface ProfilePrivateSettings {
  preferred_lang: Language;
  allow_project_invitations: boolean;
  allow_direct_messages: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProgress {
  total_xp: number;
  level: number;
  streak_days: number;
  longest_streak: number;
  requests_count: number;
  material_count: number;
  patent_count: number;
  modules_used: string[];
}

export interface CanonicalUser {
  profile: MyProfile;
  private_settings: ProfilePrivateSettings;
  progress: UserProgress;
  completed_quests: string[];
}

export interface ProfileTaxonomies {
  disciplines: TaxonomyItem[];
  skills: TaxonomyItem[];
  tools: TaxonomyItem[];
  interests: TaxonomyItem[];
}

export interface ProfileSearchResponse {
  profiles: PublicProfile[];
  next_cursor: string | null;
}

export type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled' | 'archived';
export type ProjectVisibility = 'private' | 'authenticated' | 'public';

export interface ProjectOwnerSummary {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ProjectSummary {
  id: string;
  title: string;
  description: string;
  primary_discipline: TaxonomyItem | null;
  status: ProjectStatus;
  owner: ProjectOwnerSummary | null;
  created_at: string;
  updated_at: string;
}

export type ProjectDetail = ProjectSummary;

export interface MyProject extends ProjectDetail {
  owner_id: string;
  primary_discipline_id: string | null;
  visibility: ProjectVisibility;
}

export interface ProjectListResponse<TProject extends ProjectSummary = ProjectSummary> {
  projects: TProject[];
  next_cursor: string | null;
}

export type ProjectRoleStatus = 'open' | 'filled' | 'closed';
export type RoleSkillRequirement = 'required' | 'optional';
export type ProjectRequestStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled';
export type ProjectInvitationStatus = Exclude<ProjectRequestStatus, 'withdrawn'>;

export interface ProjectRoleSkill {
  skill: TaxonomyItem;
  requirement: RoleSkillRequirement;
  weight: number;
}

export interface ProjectRole {
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
}

export interface ProjectRequestRoleSummary {
  id: string;
  project_id: string;
  title: string;
  status: ProjectRoleStatus;
  project: { id: string; title: string; status: ProjectStatus } | null;
}

export interface ProjectApplication {
  id: string;
  project_id: string;
  role_id: string;
  applicant_id: string;
  applicant: ProjectOwnerSummary | null;
  role: ProjectRequestRoleSummary | null;
  note: string;
  status: ProjectRequestStatus;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}

export interface ProjectInvitation {
  id: string;
  project_id: string;
  role_id: string;
  invitee_id: string;
  inviter_id: string;
  invitee: ProjectOwnerSummary | null;
  inviter: ProjectOwnerSummary | null;
  role: ProjectRequestRoleSummary | null;
  note: string;
  status: ProjectInvitationStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}

// Existing UI state; authentication identity and Profile v2 DTOs stay separate.
export interface UserProfile {
  id: string;
  username: string;
  xp: number;
  level: number;
  streak: number;
  completed_quests: string[];
  achievements: string[];
  requests_count: number;
  material_count: number;
  patent_count: number;
  modules_used: string[];
  preferred_lang: Language;
}

export interface Quest {
  id: string;
  name: string;
  name_kk: string;
  name_en: string;
  desc: string;
  desc_kk: string;
  desc_en: string;
  xp: number;
  reward: string;
  reward_kk: string;
  reward_en: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  xp: number;
  level: number;
  streak: number;
}

export interface Book {
  id: string;
  title: string;
  category: 'mechanical' | 'electrical' | 'robotics';
  lang: 'ru' | 'en' | 'kz';
  author: string;
  pages: number;
  description: string;
}

export interface SavedNote {
  id: string;
  module: string;
  query: string;
  response: string;
  savedAt: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  module: string;
  timestamp: string;
  xpEarned?: number;
  queryForAi?: string;
  requestId?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  module: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}
