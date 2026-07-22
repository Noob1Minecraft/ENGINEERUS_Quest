import React, { useState } from 'react';
import { UserProfile, Language } from '../types';
import { TRANSLATIONS } from '../data';
import { Zap, Flame, CheckCircle2, Trophy, Award, Lock, Star, Sparkles, Layers, ArrowRight, X, ShieldCheck } from 'lucide-react';

interface ProfileStatsProps {
  user: UserProfile;
  lang: Language;
  onNavigateToQuest?: (tab: string, module?: string) => void;
}

interface BadgeItem {
  id: string;
  name: { ru: string; kk: string; en: string };
  desc: { ru: string; kk: string; en: string };
  reqText: { ru: string; kk: string; en: string };
  isUnlocked: boolean;
  progress: number;
  total: number;
  icon: React.ReactNode;
  activeColor: string;
  activeBg: string;
  activeBorder: string;
  activeIconBg: string;
  tabTarget?: string;
  moduleTarget?: string;
}

export const ProfileStats: React.FC<ProfileStatsProps> = ({ user, lang, onNavigateToQuest }) => {
  const t = TRANSLATIONS[lang];
  const currentXpProgress = user.xp % 100;
  const progressPercent = Math.min(100, Math.max(0, currentXpProgress));
  const [selectedBadge, setSelectedBadge] = useState<BadgeItem | null>(null);

  const isFirstContactUnlocked = user.completed_quests.includes('first_contact') || user.achievements.includes('Бейдж Новичок') || (user.requests_count || 0) >= 1;
  const isMaterialScoutUnlocked = user.completed_quests.includes('material_scout') || user.achievements.includes('Бейдж Исследователь') || (user.material_count || 0) >= 1;
  const isStreakMasterUnlocked = user.completed_quests.includes('streak_master') || user.achievements.includes('Бейдж Постоянец') || user.streak >= 3;
  const isXpHunterUnlocked = user.completed_quests.includes('xp_hunter') || user.achievements.includes('Бейдж Опытный') || user.xp >= 100;
  const isModuleExplorerUnlocked = user.completed_quests.includes('module_explorer') || user.achievements.includes('Бейдж Универсал') || (user.modules_used || []).length >= 5;

  const badges: BadgeItem[] = [
    {
      id: 'first_contact',
      name: { ru: 'Бейдж Новичок', kk: 'Жаңадан бастаушы', en: 'Novice Badge' },
      desc: {
        ru: 'Задай свой 1-й вопрос ИИ-репетитору для получения бейджа Новичок.',
        kk: 'Новичок бейджін алу үшін ЖИ-репетиторға 1-ші сұрағыңды қой.',
        en: 'Ask your 1st question to the AI tutor to earn the Novice Badge.',
      },
      reqText: { ru: '1-й вопрос ИИ', kk: 'ЖИ-ге 1-ші сұрақ', en: '1st AI Question' },
      isUnlocked: isFirstContactUnlocked,
      progress: isFirstContactUnlocked ? 1 : Math.min(1, user.requests_count || 0),
      total: 1,
      icon: <Star className="w-4 h-4 fill-amber-950 text-amber-950" />,
      activeColor: 'text-amber-900',
      activeBg: 'bg-amber-50/80 hover:bg-amber-100/80',
      activeBorder: 'border-amber-200/90',
      activeIconBg: 'bg-amber-400 text-amber-950',
      tabTarget: 'ai',
      moduleTarget: 'tutor',
    },
    {
      id: 'material_scout',
      name: { ru: 'Бейдж Исследователь', kk: 'Зерттеуші бейджі', en: 'Explorer Badge' },
      desc: {
        ru: 'Воспользуйся модулем MaterialSwap для подбора инженерных сплавов.',
        kk: 'Инженерлік қорытпаларды таңдау үшін MaterialSwap модулін қолдан.',
        en: 'Use the MaterialSwap module to earn the Explorer Badge.',
      },
      reqText: { ru: 'MaterialSwap', kk: 'MaterialSwap', en: 'MaterialSwap' },
      isUnlocked: isMaterialScoutUnlocked,
      progress: isMaterialScoutUnlocked ? 1 : Math.min(1, user.material_count || 0),
      total: 1,
      icon: <Award className="w-4 h-4" />,
      activeColor: 'text-emerald-900',
      activeBg: 'bg-emerald-50/80 hover:bg-emerald-100/80',
      activeBorder: 'border-emerald-200/90',
      activeIconBg: 'bg-emerald-500 text-white',
      tabTarget: 'ai',
      moduleTarget: 'material',
    },
    {
      id: 'streak_master',
      name: { ru: 'Бейдж Постоянец', kk: 'Тұрақты қатысушы', en: 'Regular Badge' },
      desc: {
        ru: 'Поддерживай активную серию посещений и занятий 3 дня подряд.',
        kk: 'Қатарынан 3 күн белсенді сабақ сериясын сақтаңыз.',
        en: 'Maintain an active practice streak for 3 consecutive days.',
      },
      reqText: { ru: '3 дня подряд', kk: '3 күн қатарынан', en: '3-day streak' },
      isUnlocked: isStreakMasterUnlocked,
      progress: Math.min(3, user.streak),
      total: 3,
      icon: <Flame className="w-4 h-4 fill-white" />,
      activeColor: 'text-orange-900',
      activeBg: 'bg-orange-50/80 hover:bg-orange-100/80',
      activeBorder: 'border-orange-200/90',
      activeIconBg: 'bg-orange-500 text-white',
      tabTarget: 'quests',
    },
    {
      id: 'xp_hunter',
      name: { ru: 'Бейдж Опытный', kk: 'Тәжірибелі бейджі', en: 'Experienced Badge' },
      desc: {
        ru: 'Набери 100 XP за выполнение инженерных модулей и заданий.',
        kk: 'Инженерлік модульдерді орындап, 100 XP жинаңыз.',
        en: 'Earn 100 XP to get the Experienced Badge.',
      },
      reqText: { ru: 'Набери 100 XP', kk: '100 XP жина', en: 'Earn 100 XP' },
      isUnlocked: isXpHunterUnlocked,
      progress: Math.min(100, user.xp),
      total: 100,
      icon: <Trophy className="w-4 h-4 text-white" />,
      activeColor: 'text-blue-900',
      activeBg: 'bg-blue-50/80 hover:bg-blue-100/80',
      activeBorder: 'border-blue-200/90',
      activeIconBg: 'bg-blue-600 text-white',
      tabTarget: 'ai',
      moduleTarget: 'tutor',
    },
    {
      id: 'module_explorer',
      name: { ru: 'Бейдж Универсал', kk: 'Универсал бейджі', en: 'Universal Badge' },
      desc: {
        ru: 'Задай вопросы во всех 5 инженерных модулях (Тьютор, MaterialSwap, PatentCraft, EngiLegal, EngiMatch).',
        kk: 'Барлық 5 инженерлік модульде де сұрақ қойып көріңіз.',
        en: 'Try out questions across all 5 engineering modules.',
      },
      reqText: { ru: 'Все 5 модулей', kk: 'Барлық 5 модуль', en: 'All 5 modules' },
      isUnlocked: isModuleExplorerUnlocked,
      progress: Math.min(5, (user.modules_used || []).length),
      total: 5,
      icon: <Layers className="w-4 h-4 text-white" />,
      activeColor: 'text-purple-900',
      activeBg: 'bg-purple-50/80 hover:bg-purple-100/80',
      activeBorder: 'border-purple-200/90',
      activeIconBg: 'bg-purple-600 text-white',
      tabTarget: 'ai',
      moduleTarget: 'tutor',
    },
  ];

  return (
    <div className="space-y-4">
      {/* 4 Stats Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* XP Card */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/60 shadow-xs relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-bl-full pointer-events-none transition-transform group-hover:scale-102" />
          <div className="flex items-center gap-3 mb-2.5 relative z-10">
            <div className="w-8.5 h-8.5 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t.xpLabel}
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight relative z-10 flex items-baseline gap-1">
            {user.xp} <span className="text-xs font-bold text-indigo-500">XP</span>
          </div>
        </div>

        {/* Level Card */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/60 shadow-xs relative overflow-hidden group">
          <div className="absolute bottom-0 right-0 w-24 h-24 bg-blue-50/50 rounded-tl-full pointer-events-none transition-transform group-hover:scale-102" />
          <div className="flex items-center gap-3 mb-2.5 relative z-10">
            <div className="w-8.5 h-8.5 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t.levelLabel}
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight relative z-10 flex items-baseline gap-1">
            {user.level} <span className="text-xs font-bold text-blue-500">LVL</span>
          </div>
        </div>

        {/* Day Streak Card */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/60 shadow-xs relative overflow-hidden group">
          <div className="absolute -bottom-2 -right-2 w-20 h-20 bg-orange-50/50 rounded-full blur-xs pointer-events-none transition-transform group-hover:scale-102" />
          <div className="flex items-center gap-3 mb-2.5 relative z-10">
            <div className="w-8.5 h-8.5 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t.streakLabel}
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight relative z-10 flex items-baseline gap-1">
            {user.streak} <span className="text-xs font-bold text-orange-500">{t.daysUnit}</span>
          </div>
        </div>

        {/* Quests Completed Card */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/60 shadow-xs relative overflow-hidden group">
          <div className="absolute top-1/2 -right-4 -translate-y-1/2 w-20 h-20 bg-emerald-50/50 rounded-full blur-xs pointer-events-none" />
          <div className="flex items-center gap-3 mb-2.5 relative z-10">
            <div className="w-8.5 h-8.5 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t.questsDoneLabel}
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight relative z-10 flex items-baseline gap-1">
            {user.completed_quests.length} <span className="text-xs font-bold text-emerald-500">/ 5</span>
          </div>
        </div>
      </div>

      {/* Progress Bar Card */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/60 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-700">
            {t.nextLevelLabel}: <span className="text-blue-600 font-extrabold">{t.levelLabel} {user.level + 1}</span>
          </span>
          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
            {currentXpProgress} / 100 XP ({progressPercent}%)
          </span>
        </div>
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200/40 p-0.5">
          <div
            className="bg-blue-600 h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Badges and Achievements */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/60 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              {t.badgesTitle}
            </h3>
          </div>
          <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {badges.filter((b) => b.isUnlocked).length} / {badges.length} {t.unlockedCount}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {badges.map((b) => {
            const nameStr = b.name[lang] || b.name.ru;
            const reqStr = b.reqText[lang] || b.reqText.ru;

            return (
              <button
                key={b.id}
                onClick={() => setSelectedBadge(b)}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all duration-200 flex items-center gap-2.5 active:scale-98 ${
                  b.isUnlocked
                    ? `${b.activeBg} ${b.activeBorder} shadow-2xs`
                    : 'border-slate-200/70 bg-slate-50/70 hover:bg-slate-100/60 text-slate-400'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 transition-all ${
                    b.isUnlocked ? b.activeIconBg : 'bg-slate-200/70 text-slate-400'
                  }`}
                >
                  {b.isUnlocked ? b.icon : <Lock className="w-3.5 h-3.5 text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-[11px] font-bold truncate ${
                      b.isUnlocked ? 'text-slate-850' : 'text-slate-500'
                    }`}
                  >
                    {nameStr}
                  </div>
                  <div className="text-[9px] text-slate-400 font-medium truncate mt-0.5">
                    {reqStr}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Badge Detail Modal */}
      {selectedBadge && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in duration-200 text-center">
            <button
              onClick={() => setSelectedBadge(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div
              className={`w-16 h-16 rounded-3xl mx-auto flex items-center justify-center text-2xl shadow-lg mb-4 ${
                selectedBadge.isUnlocked
                  ? `${selectedBadge.activeIconBg}`
                  : 'bg-slate-100 border border-slate-200 text-slate-400'
              }`}
            >
              {selectedBadge.isUnlocked ? (
                selectedBadge.icon
              ) : (
                <Lock className="w-8 h-8 text-slate-400" />
              )}
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider mb-2">
              {selectedBadge.isUnlocked ? (
                <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {t.unlockedStatus}
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> {t.lockedStatus}
                </span>
              )}
            </div>

            <h3 className="text-lg font-black text-slate-900 mt-1">
              {selectedBadge.name[lang] || selectedBadge.name.ru}
            </h3>

            <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed px-2">
              {selectedBadge.desc[lang] || selectedBadge.desc.ru}
            </p>

            <div className="my-4 p-3 bg-slate-50 rounded-2xl border border-slate-100 text-left">
              <div className="flex items-center justify-between text-xs font-extrabold text-slate-700 mb-1.5">
                <span>{t.achievementProgress}</span>
                <span>
                  {selectedBadge.progress} / {selectedBadge.total}
                </span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    selectedBadge.isUnlocked ? 'bg-emerald-500' : 'bg-blue-600'
                  }`}
                  style={{
                    width: `${Math.min(100, (selectedBadge.progress / selectedBadge.total) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {!selectedBadge.isUnlocked && selectedBadge.tabTarget && onNavigateToQuest && (
              <button
                onClick={() => {
                  const targetTab = selectedBadge.tabTarget!;
                  const targetModule = selectedBadge.moduleTarget;
                  setSelectedBadge(null);
                  onNavigateToQuest(targetTab, targetModule);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white py-3 rounded-2xl font-extrabold text-xs transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{t.goToComplete}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {selectedBadge.isUnlocked && (
              <button
                onClick={() => setSelectedBadge(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-2xl font-extrabold text-xs transition-all cursor-pointer"
              >
                {lang === 'kk' ? 'Жабу' : lang === 'en' ? 'Close' : 'Закрыть'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

