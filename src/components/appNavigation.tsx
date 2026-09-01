import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Bot,
  BriefcaseBusiness,
  Files,
  Flag,
  LayoutDashboard,
  MessageCircle,
  Trophy,
  UserRound,
  UsersRound,
} from 'lucide-react';
import type { Language } from '../types';

export type AppNavigationItem = {
  id: string;
  icon: LucideIcon;
  labels: Record<Language, string>;
};

export type AppNavigationGroup = {
  id: 'learn' | 'workspace' | 'collaborate' | 'community';
  labels: Record<Language, string>;
  items: AppNavigationItem[];
};

export const APP_NAVIGATION_GROUPS: AppNavigationGroup[] = [
  {
    id: 'learn',
    labels: { ru: 'Обучение', kk: 'Оқу', en: 'Learn' },
    items: [
      { id: 'home', icon: LayoutDashboard, labels: { ru: 'Главная', kk: 'Басты бет', en: 'Dashboard' } },
      { id: 'quests', icon: Flag, labels: { ru: 'Квесты', kk: 'Квесттер', en: 'Quests' } },
      { id: 'roadmap', icon: BookOpen, labels: { ru: 'Обучение и книги', kk: 'Оқу және кітаптар', en: 'Learning & books' } },
    ],
  },
  {
    id: 'workspace',
    labels: { ru: 'Инженерная среда', kk: 'Инженерлік орта', en: 'Engineering workspace' },
    items: [
      { id: 'ai', icon: Bot, labels: { ru: 'ИИ-Тьютор', kk: 'ЖИ-Тьютор', en: 'AI Tutor' } },
      { id: 'documents', icon: Files, labels: { ru: 'Документы и изображения', kk: 'Құжаттар мен суреттер', en: 'Documents & images' } },
    ],
  },
  {
    id: 'collaborate',
    labels: { ru: 'Совместная работа', kk: 'Бірлескен жұмыс', en: 'Collaborate' },
    items: [
      { id: 'projects', icon: BriefcaseBusiness, labels: { ru: 'Проекты', kk: 'Жобалар', en: 'Projects' } },
      { id: 'engimatch', icon: UsersRound, labels: { ru: 'EngiMatch', kk: 'EngiMatch', en: 'EngiMatch' } },
      { id: 'messages', icon: MessageCircle, labels: { ru: 'Сообщения', kk: 'Хабарламалар', en: 'Messages' } },
    ],
  },
  {
    id: 'community',
    labels: { ru: 'Аккаунт', kk: 'Аккаунт', en: 'Account' },
    items: [
      { id: 'leaderboard', icon: Trophy, labels: { ru: 'Таблица лидеров', kk: 'Көшбасшылар', en: 'Leaderboard' } },
      { id: 'profile', icon: UserRound, labels: { ru: 'Профиль', kk: 'Профиль', en: 'Profile' } },
    ],
  },
];

export const APP_NAVIGATION_ITEMS = APP_NAVIGATION_GROUPS.flatMap((group) => group.items);

export function getNavigationItem(id: string): AppNavigationItem | undefined {
  return APP_NAVIGATION_ITEMS.find((item) => item.id === id);
}
export function getNavigationLabel(id: string, language: Language): string {
  return getNavigationItem(id)?.labels[language] ?? id;
}
