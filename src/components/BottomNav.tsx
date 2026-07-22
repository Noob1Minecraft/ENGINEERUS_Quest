import React from 'react';
import { Home, Flag, BarChart3, Sparkles, User } from 'lucide-react';
import { Language } from '../types';

interface BottomNavProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  lang: Language;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  lang,
}) => {
  const getNavLabel = (tab: string) => {
    if (tab === 'home') {
      return lang === 'kk' ? 'Басты бет' : lang === 'en' ? 'Home' : 'Главная';
    }
    if (tab === 'quests') {
      return lang === 'kk' ? 'Квесттер' : lang === 'en' ? 'Quests' : 'Квесты';
    }
    if (tab === 'leaderboard') {
      return lang === 'kk' ? 'Көшбасшылар' : lang === 'en' ? 'Leaderboard' : 'Лидерборд';
    }
    if (tab === 'ai') {
      return lang === 'kk' ? 'ИИ-Тьютор' : lang === 'en' ? 'AI Tutor' : 'ИИ-Тьютор';
    }
    if (tab === 'sync') {
      return lang === 'kk' ? 'Профиль' : lang === 'en' ? 'Profile' : 'Профиль';
    }
    return '';
  };

  const navItems = [
    { id: 'home', icon: Home },
    { id: 'quests', icon: Flag },
    { id: 'leaderboard', icon: BarChart3 },
    { id: 'ai', icon: Sparkles },
    { id: 'sync', icon: User },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 pt-2 pb-2 shadow-lg">
      <div className="max-w-md mx-auto flex items-center justify-between gap-1 px-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          const label = getNavLabel(item.id);

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center gap-1 transition-all px-2.5 py-1.5 rounded-2xl flex-1 ${
                isActive
                  ? 'bg-blue-50/90 text-blue-600 font-extrabold'
                  : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              <Icon
                className={`w-5 h-5 ${
                  isActive ? 'text-blue-600 stroke-[2.2]' : 'text-slate-500 stroke-[1.8]'
                }`}
              />
              <span className="text-[11px] leading-tight text-center truncate max-w-[64px]">
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {/* iOS / Mobile Home Indicator line */}
      <div className="w-32 h-1 bg-slate-700/80 rounded-full mx-auto mt-2 mb-0.5" />
    </div>
  );
};


