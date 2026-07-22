export type Language = 'ru' | 'kk' | 'en';

export interface UserProfile {
  id: number;
  telegram_id: number;
  username: string;
  email: string;
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
}

export interface ChatSession {
  id: string;
  title: string;
  module: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}
