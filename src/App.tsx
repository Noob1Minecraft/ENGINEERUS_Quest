import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Language, Quest, CanonicalUser } from './types';
import { TRANSLATIONS, QUESTS } from './data';
import { verifySystemIntegrity } from './utils/integrity';
import { Header } from './components/Header';
import { AppSidebar } from './components/AppSidebar';
import { ProfileStats } from './components/ProfileStats';
import { QuestsTab } from './components/QuestsTab';
import { LeaderboardTab } from './components/LeaderboardTab';
import { AIAssistantTab } from './components/AIAssistantTab';
import { RoadmapBooksTab } from './components/RoadmapBooksTab';
import { BottomNav } from './components/BottomNav';
import { AuthModal } from './components/AuthModal';
import { ProfileTab } from './components/ProfileTab';
import { ProjectsTab } from './components/ProjectsTab';
import { EngiMatchTab } from './components/EngiMatchTab';
import { DirectChatTab } from './components/DirectChatTab';
import { DocumentsTab } from './components/DocumentsTab';
import type { AiDocument } from './documents/documentApi';
import type { AiImage } from './images/imageApi';
import { DraftingCompass, Zap, ArrowRight, ShieldCheck, Cpu } from 'lucide-react';
import mascotImg from './assets/images/eq_robot_mascot_1784719916472.jpg';
import { useAuth } from './auth/AuthContext';
import { apiFetch } from './utils/api';
import { BetaOnboardingCard } from './components/BetaOnboardingCard';
import { BetaFeedbackModal } from './components/BetaFeedbackModal';
import { GamificationPanel } from './components/GamificationPanel';
import { loadGamification, type GamificationState } from './gamification/gamificationApi';
import { ErrorState, LoadingState } from './components/ui';
import {
  completeBetaOnboarding,
  loadBetaState,
  recordBetaView,
  startBetaOnboarding,
  type BetaFeedbackInput,
  type BetaParticipant,
} from './beta/betaApi';

const GUEST_USER: UserProfile = {
  id: 'guest',
  username: 'Студент_Инженер',
  xp: 0,
  level: 1,
  streak: 0,
  completed_quests: [],
  achievements: [],
  requests_count: 0,
  material_count: 0,
  patent_count: 0,
  modules_used: [],
  preferred_lang: 'ru',
};

type QuestStateResponse = {
  quests: Array<{
    id: string;
    name: Partial<Record<Language, string>>;
    description: Partial<Record<Language, string>>;
    reward_label: Partial<Record<Language, string>>;
    xp_reward: number;
  }>;
  completed_quests: string[];
};

function mapQuestDefinitions(definitions: QuestStateResponse['quests']): Record<string, Quest> {
  return Object.fromEntries(definitions.map((definition) => [definition.id, {
    id: definition.id,
    name: definition.name.ru || definition.id,
    name_kk: definition.name.kk || definition.name.ru || definition.id,
    name_en: definition.name.en || definition.name.ru || definition.id,
    desc: definition.description.ru || '',
    desc_kk: definition.description.kk || definition.description.ru || '',
    desc_en: definition.description.en || definition.description.ru || '',
    xp: definition.xp_reward,
    reward: definition.reward_label.ru || '',
    reward_kk: definition.reward_label.kk || definition.reward_label.ru || '',
    reward_en: definition.reward_label.en || definition.reward_label.ru || '',
  }]));
}

export default function App() {
  const auth = useAuth();
  const [lang, setLang] = useState<Language>(
    (localStorage.getItem('lang') as Language) || 'ru'
  );

  const [activeTab, setActiveTab] = useState<string>('home');
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [betaParticipant, setBetaParticipant] = useState<BetaParticipant | null>(null);
  const [betaCompleting, setBetaCompleting] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [aiDocument, setAiDocument] = useState<{ id: string; name: string } | null>(null);
  const [aiImages, setAiImages] = useState<Array<{ id: string; name: string }>>([]);
  const trackedBetaViews = useRef(new Set<string>());

  const [user, setUser] = useState<UserProfile>(GUEST_USER);
  const [account, setAccount] = useState<CanonicalUser | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [quests, setQuests] = useState<Record<string, Quest>>(QUESTS);
  const [gamification, setGamification] = useState<GamificationState | null>(null);
  const [gamificationStatus, setGamificationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    // Mandatory attribution token verification check
    verifySystemIntegrity(t.attributionCaption);
  }, [lang, t]);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) {
      setUser(GUEST_USER);
      setAccount(null);
      setAiDocument(null);
      setAiImages([]);
      setAccountLoading(false);
      setQuests(QUESTS);
      setGamification(null);
      setGamificationStatus('idle');
      return;
    }

    let active = true;
    setAccountLoading(true);
    setGamificationStatus('loading');
    setQuests({});
    apiFetch('/api/me/daily-activity', { method: 'POST' })
      .then(() => Promise.all([
        loadGamification()
          .then((gamificationState) => {
            if (active) {
              setGamification(gamificationState);
              setGamificationStatus('ready');
            }
          })
          .catch(() => { if (active) setGamificationStatus('error'); }),
        apiFetch<CanonicalUser>('/api/me'),
        apiFetch<QuestStateResponse>('/api/quests'),
      ]))
      .then(([, { profile, private_settings, progress, completed_quests }, questState]) => {
        if (!active) return;
        const canonical = { profile, private_settings, progress, completed_quests };
        setAccount(canonical);
        setAccountLoading(false);
        setQuests(mapQuestDefinitions(questState.quests));
        setUser({
          id: profile.id,
          username: profile.username || profile.display_name || 'Engineer',
          xp: progress.total_xp,
          level: progress.level,
          streak: progress.streak_days,
          completed_quests: completed_quests.length > 0
            ? completed_quests
            : questState.completed_quests,
          achievements: [],
          requests_count: progress.requests_count,
          material_count: progress.material_count,
          patent_count: progress.patent_count,
          modules_used: progress.modules_used,
          preferred_lang: private_settings.preferred_lang,
        });
      })
      .catch(() => {
        if (active) {
          setAccountLoading(false);
          setGamificationStatus((status) => status === 'loading' ? 'error' : status);
        }
      });

    return () => { active = false; };
  }, [auth.loading, auth.user]);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) {
      setBetaParticipant(null);
      trackedBetaViews.current.clear();
      return;
    }
    let active = true;
    loadBetaState()
      .then(async (participant) => {
        if (participant.onboarding_started_at || participant.onboarding_completed_at) return participant;
        return startBetaOnboarding();
      })
      .then((participant) => { if (active) setBetaParticipant(participant); })
      .catch(() => { if (active) setBetaParticipant(null); });
    return () => { active = false; };
  }, [auth.loading, auth.user]);

  useEffect(() => {
    if (!auth.user) return;
    const eventName = activeTab === 'engimatch' ? 'engimatch_viewed'
      : activeTab === 'messages' ? 'direct_chat_opened'
      : null;
    if (!eventName) return;
    const key = `${auth.user.id}:${eventName}`;
    if (trackedBetaViews.current.has(key)) return;
    trackedBetaViews.current.add(key);
    recordBetaView(eventName).catch(() => trackedBetaViews.current.delete(key));
  }, [activeTab, auth.user]);

  const [selectedAiModule, setSelectedAiModule] = useState<string>('tutor');
  const [selectedDirectConversation, setSelectedDirectConversation] = useState<string | null>(null);

  const handleNavigateToQuest = (tab: string, module?: string) => {
    setActiveTab(tab);
    if (module) {
      setSelectedAiModule(module);
    }
  };

  const handleUpdateUser = (updated: Partial<UserProfile>) => {
    setUser((prev) => ({ ...prev, ...updated }));
    if (auth.user && (updated.xp !== undefined || updated.level !== undefined)) {
      loadGamification().then(setGamification).catch(() => undefined);
    }
  };

  useEffect(() => {
    if (!auth.user || activeTab !== 'home' || accountLoading) return;
    const timeout = window.setTimeout(() => {
      loadGamification().then((state) => {
        setGamification(state);
        setGamificationStatus('ready');
        setUser((previous) => ({
          ...previous,
          xp: state.progression.total_xp,
          level: state.progression.level,
          streak: state.streak.current,
        }));
      }).catch(() => setGamificationStatus('error'));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [activeTab, accountLoading, auth.user]);

  const completeOnboarding = async () => {
    setBetaCompleting(true);
    try { setBetaParticipant(await completeBetaOnboarding()); }
    catch { /* keep the checklist visible so the tester can retry safely */ }
    finally { setBetaCompleting(false); }
  };

  const betaProductArea: BetaFeedbackInput['product_area'] = activeTab === 'home' ? 'dashboard'
    : activeTab === 'ai' ? 'ai_tutor'
    : activeTab === 'leaderboard' || activeTab === 'roadmap' ? 'other'
    : activeTab as BetaFeedbackInput['product_area'];

  const handleCompleteQuest = async (questId: string) => {
    try {
      const data = await apiFetch<Record<string, unknown>>('/api/quests/complete', {
        method: 'POST',
        body: JSON.stringify({ quest_id: questId }),
      });
      if (data.status === 'ok') {
        setUser((prev) => {
          const quest = quests[questId];
          const newBadge = quest ? quest.reward : null;
          const serverAchievements = Array.isArray(data.achievements)
            ? data.achievements.filter((value): value is string => typeof value === 'string')
            : null;
          const updatedAchievements = serverAchievements || (
            newBadge && !prev.achievements.includes(newBadge)
              ? [...prev.achievements, newBadge]
              : prev.achievements
          );

          return {
            ...prev,
            xp: Number(data.total_xp ?? prev.xp),
            level: Number(data.level ?? prev.level),
            completed_quests: Array.isArray(data.completed_quests)
              ? data.completed_quests.filter((value): value is string => typeof value === 'string')
              : Array.from(new Set([...prev.completed_quests, questId])),
            achievements: updatedAchievements,
          };
        });
        loadGamification().then(setGamification).catch(() => undefined);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="eq-app">
      {/* Top Header */}
      <Header
        user={user}
        lang={lang}
        onSetLang={setLang}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenProfile={() => auth.user ? setActiveTab('profile') : setIsAuthOpen(true)}
        authenticated={Boolean(auth.user)}
        onOpenFeedback={() => setFeedbackOpen(true)}
      />

      <div className="eq-app__body">
        <AppSidebar activeTab={activeTab} language={lang} onSelectTab={setActiveTab} />
        <div className="eq-app__column">
      <main className="eq-app__main space-y-5 md:space-y-8">
        {/* User Profile Stats Header Bar (Incorporating exact design from screenshot) */}
        {activeTab !== 'profile' && activeTab !== 'home' && activeTab !== 'messages' && (
          <ProfileStats user={user} lang={lang} onNavigateToQuest={handleNavigateToQuest} />
        )}

        {/* Tab Content Routing */}
        {activeTab === 'home' && (
          <div className="space-y-4 sm:space-y-6 animate-fade-in">
            {auth.user && gamification && <GamificationPanel state={gamification} language={lang} onNavigate={setActiveTab} />}
            {auth.user && !gamification && gamificationStatus === 'loading' && <LoadingState label={lang === 'ru' ? 'Загружаем инженерный прогресс…' : lang === 'kk' ? 'Инженерлік прогресс жүктелуде…' : 'Loading engineering progress…'} />}
            {auth.user && !gamification && gamificationStatus === 'error' && <ErrorState
              title={lang === 'ru' ? 'Не удалось загрузить прогресс' : lang === 'kk' ? 'Прогресті жүктеу мүмкін болмады' : 'Could not load progress'}
              description={lang === 'ru' ? 'Основные разделы доступны. Обновите страницу, чтобы повторить попытку.' : lang === 'kk' ? 'Негізгі бөлімдер қолжетімді. Қайталап көру үшін бетті жаңартыңыз.' : 'Core features remain available. Refresh the page to try again.'}
            />}
            {auth.user && <div className="eq-beta-note">
              <span><strong>Controlled Beta.</strong> {lang === 'ru' ? 'Доступ ограничен, функции могут меняться — ваши отзывы помогают улучшать продукт.' : lang === 'kk' ? 'Қолжетімділік шектеулі, функциялар өзгеруі мүмкін — пікіріңіз өнімді жақсартады.' : 'Access is limited and features may change—your feedback helps improve the product.'}</span>
              <button type="button" onClick={() => setFeedbackOpen(true)}>{lang === 'ru' ? 'Отправить отзыв' : lang === 'kk' ? 'Пікір жіберу' : 'Send feedback'}</button>
            </div>}
            {auth.user && betaParticipant && !betaParticipant.onboarding_completed_at && <BetaOnboardingCard
              lang={lang} completing={betaCompleting} onNavigate={setActiveTab} onComplete={completeOnboarding}
            />}
            {!auth.user && <section className="eq-home-hero" aria-labelledby="engineerus-intro-title">
              <div className="eq-home-hero__grid">
                <div className="eq-home-hero__copy">
                  <div className="eq-home-hero__tag">
                    <DraftingCompass aria-hidden="true" />
                    <span>{t.heroTag}</span>
                  </div>
                  <h1 id="engineerus-intro-title">
                    Engineerus Quest
                  </h1>
                  <p>{t.heroDesc}</p>
                  <div className="eq-home-hero__actions">
                    <button
                      type="button"
                      onClick={() => setActiveTab('ai')}
                      className="eq-button eq-button--primary"
                    >
                      <span>{t.startLearning}</span>
                      <ArrowRight aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('quests')}
                      className="eq-button eq-button--secondary"
                    >
                      {t.engineeringQuests}
                    </button>
                  </div>
                </div>
                <div className="eq-home-hero__figure">
                  <span aria-hidden="true">01 — STUDY / BUILD / VERIFY</span>
                  <img src={mascotImg} alt="Engineerus robot assistant" />
                </div>
              </div>
            </section>}

            <div className="eq-home-links" aria-label={lang === 'ru' ? 'Основные возможности' : lang === 'kk' ? 'Негізгі мүмкіндіктер' : 'Core areas'}>
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                className="eq-home-link"
              >
                <span className="eq-home-link__index">01</span>
                <span className="eq-home-link__icon"><Cpu aria-hidden="true" /></span>
                <span className="eq-home-link__copy"><strong>{t.tutorModuleTitle}</strong><small>{t.tutorModuleDesc}</small></span>
                <ArrowRight aria-hidden="true" className="eq-home-link__arrow" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('quests')}
                className="eq-home-link"
              >
                <span className="eq-home-link__index">02</span>
                <span className="eq-home-link__icon is-reward"><Zap aria-hidden="true" /></span>
                <span className="eq-home-link__copy"><strong>{t.questsModuleTitle}</strong><small>{t.questsModuleDesc}</small></span>
                <ArrowRight aria-hidden="true" className="eq-home-link__arrow" />
              </button>

              <div className="eq-home-link eq-home-link--static">
                <span className="eq-home-link__index">03</span>
                <span className="eq-home-link__icon is-safe"><ShieldCheck aria-hidden="true" /></span>
                <span className="eq-home-link__copy"><strong>{t.progressModuleTitle}</strong><small>{t.progressModuleDesc}</small></span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'quests' && (
          <QuestsTab
            user={user}
            quests={quests}
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
            key={auth.user?.id ?? 'signed-out-ai'}
            user={user}
            authenticatedUserId={auth.user?.id ?? null}
            lang={lang}
            onUpdateUser={handleUpdateUser}
            onCompleteQuest={handleCompleteQuest}
            initialModule={selectedAiModule}
            documentContext={aiDocument}
            onClearDocumentContext={() => setAiDocument(null)}
            onSelectDocumentContext={setAiDocument}
            imageContext={aiImages}
            onClearImageContext={() => setAiImages([])}
            onSelectImageContext={setAiImages}
          />
        )}

        {activeTab === 'roadmap' && (
          <RoadmapBooksTab lang={lang} />
        )}

        {activeTab === 'profile' && (
          <ProfileTab
            account={account}
            authenticated={Boolean(auth.user)}
            loading={accountLoading || auth.loading}
            lang={lang}
            onRequireAuth={() => setIsAuthOpen(true)}
            onSignOut={auth.signOut}
            onAccountChange={(updatedAccount) => {
              setAccount(updatedAccount);
              setUser((current) => ({
                ...current,
                username: updatedAccount.profile.username || updatedAccount.profile.display_name || 'Engineer',
                xp: updatedAccount.progress.total_xp,
                level: updatedAccount.progress.level,
                streak: updatedAccount.progress.streak_days,
                preferred_lang: updatedAccount.private_settings.preferred_lang,
              }));
            }}
          />
        )}

        {activeTab === 'projects' && (
          <ProjectsTab
            authenticated={Boolean(auth.user)}
            lang={lang}
            onRequireAuth={() => setIsAuthOpen(true)}
            onOpenConversation={(conversationId) => { setSelectedDirectConversation(conversationId); setActiveTab('messages'); }}
          />
        )}

        {activeTab === 'engimatch' && (
          <EngiMatchTab authenticated={Boolean(auth.user)} lang={lang} onRequireAuth={() => setIsAuthOpen(true)} />
        )}

        {activeTab === 'messages' && (
          <DirectChatTab authenticated={Boolean(auth.user)} currentUserId={account?.profile.id ?? null} lang={lang}
            initialConversationId={selectedDirectConversation} onRequireAuth={() => setIsAuthOpen(true)} />
        )}

        {activeTab === 'documents' && (
          <DocumentsTab authenticated={Boolean(auth.user)} lang={lang} onRequireAuth={() => setIsAuthOpen(true)}
            onUseWithTutor={(document: AiDocument) => { setAiDocument({ id: document.id, name: document.original_filename }); setSelectedAiModule('tutor'); setActiveTab('ai'); }}
            onUseImagesWithTutor={(images: AiImage[]) => { setAiImages(images.map((image) => ({ id: image.id, name: image.original_filename }))); setSelectedAiModule('tutor'); setActiveTab('ai'); }} />
        )}

      </main>

      <footer className="mt-auto border-t border-slate-200/80 bg-white px-4 py-6 pb-28 lg:pb-8">
        <div className="mx-auto max-w-7xl text-center text-xs font-semibold text-slate-600 space-y-2">
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
            {auth.user && <button type="button" onClick={() => setFeedbackOpen(true)} className="mt-2 text-[11px] font-bold text-blue-700 hover:underline">
              {lang === 'ru' ? 'Сообщить о проблеме или отправить бета-отзыв' : lang === 'kk' ? 'Мәселе туралы хабарлау немесе бета-пікір жіберу' : 'Report a problem or send beta feedback'}
            </button>}
          </div>
        </div>
      </footer>
        </div>
      </div>

      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} lang={lang} />

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        lang={lang}
      />

      <BetaFeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} lang={lang} productArea={betaProductArea} />
    </div>
  );
}
