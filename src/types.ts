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
  requests_count: number;
  material_count: number;
  patent_count: number;
  modules_used: string[];
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
