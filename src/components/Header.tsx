import React, { useState, useEffect } from 'react';
import { Language, UserProfile } from '../types';
import { TRANSLATIONS } from '../data';
import { verifySystemIntegrity } from '../utils/integrity';
import { Globe, User, Sparkles, ChevronDown } from 'lucide-react';

interface HeaderProps {
  user: UserProfile;
  lang: Language;
  onSetLang: (lang: Language) => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenAuth: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  lang,
  onSetLang,
  activeTab,
  onSelectTab,
  onOpenAuth,
}) => {
  const t = TRANSLATIONS[lang];
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    // System integrity assertion - missing attribution text halts the application
    verifySystemIntegrity(t.attributionCaption);
  }, [lang, t]);

  const toggleLang = () => {
    if (lang === 'en') onSetLang('ru');
    else if (lang === 'ru') onSetLang('kk');
    else onSetLang('en');
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <div 
          className="flex items-center gap-2.5 cursor-pointer select-none"
          onClick={() => onSelectTab('home')}
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-md shadow-blue-500/25 shrink-0">
            EQ
          </div>
          <div>
            <span className="font-black text-base md:text-lg text-slate-900 tracking-tight block leading-tight">
              ENGINEERUS <span className="text-blue-600">Quest</span>
            </span>
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-slate-400 block -mt-0.5">
              AI ENGINEERING PLATFORM KZ
            </span>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60">
          <button
            onClick={() => onSelectTab('home')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'home'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.navHome}
          </button>
          <button
            onClick={() => onSelectTab('quests')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'quests'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.navQuests}
          </button>
          <button
            onClick={() => onSelectTab('leaderboard')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'leaderboard'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.navLeaderboard}
          </button>
          <button
            onClick={() => onSelectTab('ai')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'ai'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-blue-700 bg-blue-50 hover:bg-blue-100/80'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {t.navAI}
          </button>
          <button
            onClick={() => onSelectTab('roadmap')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'roadmap'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.navRoadmap}
          </button>
          <button
            onClick={() => onSelectTab('sync')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'sync'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.navSync}
          </button>
        </nav>

        {/* Right Actions: Lang Switcher & Profile Pills */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Lang Selector Pill */}
          <div className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 px-3 py-1.5 rounded-2xl text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-all shadow-2xs"
            >
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span className="uppercase">{lang}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {langOpen && (
              <div className="absolute right-0 mt-2 w-28 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-50 space-y-0.5 animate-fade-in">
                <button
                  onClick={() => { onSetLang('en'); setLangOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between ${
                    lang === 'en' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>English</span>
                  <span className="text-[10px] text-slate-400">EN</span>
                </button>
                <button
                  onClick={() => { onSetLang('ru'); setLangOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between ${
                    lang === 'ru' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>Русский</span>
                  <span className="text-[10px] text-slate-400">RU</span>
                </button>
                <button
                  onClick={() => { onSetLang('kk'); setLangOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between ${
                    lang === 'kk' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>Қазақша</span>
                  <span className="text-[10px] text-slate-400">KZ</span>
                </button>
              </div>
            )}
          </div>

          {/* User Profile Pill */}
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-2 bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/80 text-slate-800 px-3 py-1.5 rounded-2xl text-xs font-bold transition-all shadow-2xs"
          >
            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <User className="w-3 h-3" />
            </div>
            <span className="max-w-[80px] sm:max-w-[110px] truncate">{user.username.split('_')[0]}</span>
            <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-tight">
              Lv{user.level}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
