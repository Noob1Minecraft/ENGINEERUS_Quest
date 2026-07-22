import React, { useState, useEffect } from 'react';
import { UserProfile, Language } from './types';
import { TRANSLATIONS, QUESTS } from './data';
import { verifySystemIntegrity } from './utils/integrity';
import { Header } from './components/Header';
import { ProfileStats } from './components/ProfileStats';
import { QuestsTab } from './components/QuestsTab';
import { LeaderboardTab } from './components/LeaderboardTab';
import { AIAssistantTab } from './components/AIAssistantTab';
import { RoadmapBooksTab } from './components/RoadmapBooksTab';
import { TelegramSyncTab } from './components/TelegramSyncTab';
import { BottomNav } from './components/BottomNav';
import { AuthModal } from './components/AuthModal';
import { OnboardingModal } from './components/OnboardingModal';
import { Sparkles, Zap, ArrowRight, ShieldCheck, Cpu } from 'lucide-react';
import mascotImg from './assets/images/eq_robot_mascot_1784719916472.jpg';

export default function App() {
  const [lang, setLang] = useState<Language>(
    (localStorage.getItem('lang') as Language) || 'ru'
  );

  const [activeTab, setActiveTab] = useState<string>('home');
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);

  const [user, setUser] = useState<UserProfile>({
    id: 10001,
    telegram_id: 777001,
    username: 'Студент_Инженер',
    email: 'student@engineerus.kz',
    xp: 70,
    level: 1,
    streak: 3,
    completed_quests: ['first_contact'],
    achievements: ['Бейдж Новичок'],
    requests_count: 2,
    material_count: 1,
    patent_count: 0,
    modules_used: ['tutor', 'material'],
    preferred_lang: 'ru',
  });

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    // Mandatory attribution token verification check
    verifySystemIntegrity(t.attributionCaption);
  }, [lang, t]);

  useEffect(() => {
    // Fetch initial user data from server
    fetch(`/api/user/${user.email}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.email) {
          setUser(data);
        }
      })
      .catch(() => {});

    // Check onboarding preference
    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeenOnboarding) {
      setIsOnboardingOpen(true);
      localStorage.setItem('hasSeenOnboarding', 'true');
    }
  }, []);

  const [selectedAiModule, setSelectedAiModule] = useState<string>('tutor');

  const handleNavigateToQuest = (tab: string, module?: string) => {
    setActiveTab(tab);
    if (module) {
      setSelectedAiModule(module);
    }
  };

  const handleUpdateUser = (updated: Partial<UserProfile>) => {
    setUser((prev) => ({ ...prev, ...updated }));
  };

  const handleCompleteQuest = async (questId: string) => {
    try {
      const res = await fetch('/api/quests/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quest_id: questId,
          email: user.email,
        }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setUser((prev) => {
          const quest = QUESTS[questId];
          const newBadge = quest ? quest.reward : null;
          const updatedAchievements = data.achievements || (
            newBadge && !prev.achievements.includes(newBadge)
              ? [...prev.achievements, newBadge]
              : prev.achievements
          );

          return {
            ...prev,
            xp: data.new_xp,
            level: data.new_level,
            completed_quests: Array.from(new Set([...prev.completed_quests, questId])),
            achievements: updatedAchievements,
          };
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-900 font-sans flex flex-col selection:bg-blue-500 selection:text-white">
      {/* Top Header */}
      <Header
        user={user}
        lang={lang}
        onSetLang={setLang}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAuth={() => setIsAuthOpen(true)}
      />

      {/* Main Container - Optimized with 390px base width responsiveness (360px min, 430px max, desktop responsive) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-5 md:py-8 space-y-5 md:space-y-8 pb-28 md:pb-8">
        {/* User Profile Stats Header Bar (Incorporating exact design from screenshot) */}
        <ProfileStats user={user} lang={lang} onNavigateToQuest={handleNavigateToQuest} />

        {/* Tab Content Routing */}
        {activeTab === 'home' && (
          <div className="space-y-4 sm:space-y-6 animate-fade-in">
            {/* Hero Section Banner (Soft, minimalist and elegant) */}
            <div className="bg-gradient-to-br from-slate-50 via-slate-100/40 to-blue-50/30 text-slate-800 rounded-2xl p-6 sm:p-8 md:p-10 shadow-xs relative overflow-hidden border border-slate-200/60">
              {/* Background ambient glow effects */}
              <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10">
                <div className="lg:col-span-7 space-y-3.5 md:space-y-4">
                  {/* Top Badge Tag */}
                  <div className="inline-flex items-center gap-1.5 bg-blue-50/80 border border-blue-100/80 text-blue-700 px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{t.heroTag}</span>
                  </div>

                  {/* Main Display Headline */}
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-slate-950 leading-tight">
                    Engineerus Quest
                  </h1>

                  {/* Description */}
                  <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed max-w-xl">
                    {t.heroDesc}
                  </p>

                  {/* Action CTA Buttons */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-2">
                    <button
                      onClick={() => setActiveTab('ai')}
                      className="bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-bold px-5 sm:px-6 py-2.5 rounded-xl text-xs shadow-sm hover:shadow-md transition-all flex items-center gap-2"
                    >
                      <span>{t.startLearning}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setActiveTab('quests')}
                      className="bg-white hover:bg-slate-50 active:scale-98 border border-slate-200 text-slate-700 font-bold px-5 sm:px-6 py-2.5 rounded-xl text-xs transition-all shadow-xs"
                    >
                      {t.engineeringQuests}
                    </button>
                  </div>
                </div>

                {/* Robot Mascot Image Display */}
                <div className="lg:col-span-5 flex justify-center lg:justify-end relative mt-2 lg:mt-0">
                  <div className="relative group">
                    <div className="absolute inset-0 bg-blue-500/5 rounded-full blur-2xl group-hover:scale-102 transition-transform" />
                    <img
                      src={mascotImg}
                      alt="EQ Robot Mascot"
                      className="w-44 sm:w-52 md:w-56 lg:w-64 h-auto object-contain relative z-10 drop-shadow-md rounded-2xl border border-slate-200/40"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Access Feature Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              <div
                onClick={() => setActiveTab('ai')}
                className="bg-white p-5 rounded-2xl border border-slate-200/60 hover:border-blue-200 hover:shadow-xs cursor-pointer transition-all duration-300 group"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center font-bold mb-3 group-hover:translate-y-[-2px] transition-transform duration-300">
                  <Cpu className="w-4.5 h-4.5" />
                </div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-blue-600 transition-colors">
                  {t.tutorModuleTitle}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-1 leading-relaxed">
                  {t.tutorModuleDesc}
                </p>
              </div>

              <div
                onClick={() => setActiveTab('quests')}
                className="bg-white p-5 rounded-2xl border border-slate-200/60 hover:border-blue-200 hover:shadow-xs cursor-pointer transition-all duration-300 group"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center font-bold mb-3 group-hover:translate-y-[-2px] transition-transform duration-300">
                  <Zap className="w-4.5 h-4.5" />
                </div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-blue-600 transition-colors">
                  {t.questsModuleTitle}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-1 leading-relaxed">
                  {t.questsModuleDesc}
                </p>
              </div>

              <div
                onClick={() => setActiveTab('sync')}
                className="bg-white p-5 rounded-2xl border border-slate-200/60 hover:border-blue-200 hover:shadow-xs cursor-pointer transition-all duration-300 sm:col-span-2 lg:col-span-1 group"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center font-bold mb-3 group-hover:translate-y-[-2px] transition-transform duration-300">
                  <ShieldCheck className="w-4.5 h-4.5" />
                </div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-blue-600 transition-colors">
                  {t.tgModuleTitle}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-1 leading-relaxed">
                  {t.tgModuleDesc}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'quests' && (
          <QuestsTab
            user={user}
            lang={lang}
            onCompleteQuest={handleCompleteQuest}
            onNavigateToQuest={handleNavigateToQuest}
          />
        )}

        {activeTab === 'leaderboard' && (
          <LeaderboardTab user={user} lang={lang} />
        )}

        {activeTab === 'ai' && (
          <AIAssistantTab
            user={user}
            lang={lang}
            onUpdateUser={handleUpdateUser}
            onCompleteQuest={handleCompleteQuest}
            initialModule={selectedAiModule}
          />
        )}

        {activeTab === 'roadmap' && (
          <RoadmapBooksTab lang={lang} />
        )}

        {activeTab === 'sync' && (
          <TelegramSyncTab lang={lang} />
        )}
      </main>

      {/* Bottom Navigation for Mobile Devices */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        lang={lang}
      />

      {/* Desktop & Mobile Global Footer with Mandatory Caption */}
      <footer className="border-t border-slate-200/80 bg-white py-6 mt-12 pb-36 md:pb-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs font-semibold text-slate-600 space-y-2">
          <p>© 2026 Engineerus Quest • AI Learning Platform for Kazakhstan Engineering Students</p>
          <p className="text-[11px] text-slate-500 font-medium">
            Satbayev University • Nazarbayev University • AUES • KazNU • ENU • KBTU
          </p>
          <div className="pt-2 space-y-1">
            <p className="text-xs sm:text-sm text-slate-800 font-bold">
              {t.foundedBy}
            </p>
            <p className="text-[11px] text-slate-500 font-normal">
              {t.attributionCaption}
            </p>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        lang={lang}
        onLoginSuccess={(loggedUser) => setUser(loggedUser)}
      />

      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        lang={lang}
      />
    </div>
  );
}
