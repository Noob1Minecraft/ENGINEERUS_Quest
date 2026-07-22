import React, { useState } from 'react';
import { UserProfile, Language } from '../types';
import { QUESTS, TRANSLATIONS } from '../data';
import { CheckCircle2, Zap, Award, ArrowRight, MessageSquare, AlertCircle, Sparkles, Layers, Cpu } from 'lucide-react';

interface QuestsTabProps {
  user: UserProfile;
  lang: Language;
  onCompleteQuest: (questId: string) => void;
  onNavigateToQuest?: (tab: string, module?: string) => void;
}

export const QuestsTab: React.FC<QuestsTabProps> = ({
  user,
  lang,
  onCompleteQuest,
  onNavigateToQuest,
}) => {
  const t = TRANSLATIONS[lang];
  const [activeNoticeId, setActiveNoticeId] = useState<string | null>(null);

  const handleQuestButtonClick = (questId: string) => {
    if (user.completed_quests.includes(questId)) return;

    if (questId === 'first_contact') {
      if (onNavigateToQuest) {
        onNavigateToQuest('ai', 'tutor');
      } else {
        setActiveNoticeId(questId);
      }
    } else if (questId === 'material_scout') {
      if (onNavigateToQuest) {
        onNavigateToQuest('ai', 'material');
      } else {
        setActiveNoticeId(questId);
      }
    } else if (questId === 'module_explorer') {
      if (onNavigateToQuest) {
        onNavigateToQuest('ai', 'tutor');
      } else {
        setActiveNoticeId(questId);
      }
    } else if (questId === 'xp_hunter') {
      if (user.xp >= 100) {
        onCompleteQuest('xp_hunter');
      } else {
        if (onNavigateToQuest) {
          onNavigateToQuest('ai', 'tutor');
        } else {
          setActiveNoticeId(questId);
        }
      }
    } else if (questId === 'streak_master') {
      if (user.streak >= 3) {
        onCompleteQuest('streak_master');
      } else {
        setActiveNoticeId(questId);
      }
    } else {
      onCompleteQuest(questId);
    }
  };

  const getButtonText = (questId: string) => {
    if (questId === 'first_contact') {
      return lang === 'kk'
        ? 'ЖИ-Репетиторға сұрақ қою'
        : lang === 'en'
        ? 'Ask AI Tutor'
        : 'Задать вопрос ИИ-Тьютору';
    }
    if (questId === 'material_scout') {
      return lang === 'kk'
        ? 'MaterialSwap ашу'
        : lang === 'en'
        ? 'Open MaterialSwap'
        : 'Открыть MaterialSwap';
    }
    if (questId === 'module_explorer') {
      return lang === 'kk'
        ? 'Модульдерді көру'
        : lang === 'en'
        ? 'Explore Modules'
        : 'Попробовать модули';
    }
    if (questId === 'xp_hunter') {
      if (user.xp >= 100) {
        return lang === 'kk'
          ? 'Сыйлықты алу (+40 XP)'
          : lang === 'en'
          ? 'Claim Reward (+40 XP)'
          : 'Забрать награду (+40 XP)';
      }
      return lang === 'kk'
        ? `XP жинау (${user.xp}/100)`
        : lang === 'en'
        ? `Earn XP (${user.xp}/100)`
        : `Заработать XP (${user.xp}/100)`;
    }
    if (questId === 'streak_master') {
      if (user.streak >= 3) {
        return lang === 'kk'
          ? 'Сыйлықты алу (+50 XP)'
          : lang === 'en'
          ? 'Claim Reward (+50 XP)'
          : 'Забрать награду (+50 XP)';
      }
      return lang === 'kk'
        ? `Стрик: ${user.streak}/3 күн`
        : lang === 'en'
        ? `Streak: ${user.streak}/3 days`
        : `Стрик: ${user.streak}/3 дн.`;
    }
    return t.claimReward;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
            {t.activeQuestsTitle}
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {lang === 'kk'
              ? 'Тапсырманы тікелей ИИ-помощник бөлімінде орындап, автоматты түрде XP жинаңыз.'
              : lang === 'en'
              ? 'Perform the required action in the AI Assistant to automatically claim XP.'
              : 'Выполняйте реальные действия в ИИ-Помощнике, чтобы автоматически получать XP и награды.'}
          </p>
        </div>
        <div className="self-start sm:self-auto text-xs font-extrabold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
          {t.completed || 'Выполнено'}: {user.completed_quests.length} {t.completedOf || 'из'} {Object.keys(QUESTS).length}
        </div>
      </div>

      <div className="space-y-3 sm:space-y-4">
        {Object.values(QUESTS).map((quest) => {
          const isCompleted = user.completed_quests.includes(quest.id);
          const name = lang === 'kk' ? quest.name_kk : lang === 'en' ? quest.name_en : quest.name;
          const desc = lang === 'kk' ? quest.desc_kk : lang === 'en' ? quest.desc_en : quest.desc;
          const isNoticeOpen = activeNoticeId === quest.id;

          return (
            <div
              key={quest.id}
              className={`bg-white rounded-2xl p-4 sm:p-5 border transition-all ${
                isCompleted
                  ? 'border-emerald-200 bg-emerald-50/10'
                  : 'border-slate-200/60 hover:border-slate-300 shadow-xs'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-9.5 h-9.5 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
                      isCompleted
                        ? 'bg-emerald-500 text-white'
                        : 'bg-blue-50 text-blue-500'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Zap className="w-4.5 h-4.5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                        {name}
                      </h3>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                        +{quest.xp} XP
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-1 leading-relaxed">
                      {desc}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                        <Award className="w-3 h-3 text-amber-500" /> {t.rewardLabel}: {lang === 'kk' ? quest.reward_kk : lang === 'en' ? quest.reward_en : quest.reward}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 pt-2 sm:pt-0">
                  {isCompleted ? (
                    <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/50 px-4 py-2 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      {t.questCompleted}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleQuestButtonClick(quest.id)}
                      className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 active:scale-98 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>{getButtonText(quest.id)}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Requirement Hint Notice when user clicks an uncompleted action requiring task */}
              {!isCompleted && isNoticeOpen && (
                <div className="mt-3.5 p-3 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs text-amber-900 font-medium flex items-start gap-2 animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">{t.questActionRequired}</span>
                    <p className="mt-0.5 text-slate-700">
                      {quest.id === 'first_contact' &&
                        (lang === 'kk'
                          ? '«ЖИ-Көмекші» қойындысына өтіп, ЖИ-Репетиторға 1-ші сұрағыңызды қойыңыз. Сұрақ жіберілгенде квест автоматты түрде орындалады!'
                          : lang === 'en'
                          ? 'Go to the "AI Tutor" tab and ask your 1st question to the AI Tutor. The quest will complete automatically when you send the question!'
                          : 'Перейдите во вкладку «ИИ-Помощник» и задайте свой 1-й вопрос ИИ-Тьютору. Квест зачтется автоматически при отправке вопроса!')}
                      {quest.id === 'material_scout' &&
                        (lang === 'kk'
                          ? 'ЖИ-Көмекшідегі MaterialSwap модуліне өтіп, материалды таңдауға сұрау жасаңыз.'
                          : lang === 'en'
                          ? 'Go to MaterialSwap in the AI Tutor tab and make a material query.'
                          : 'Перейдите в модуль MaterialSwap в ИИ-Помощнике и сделайте запрос на выбор материала.')}
                      {quest.id === 'module_explorer' &&
                        (lang === 'kk'
                          ? 'ЖИ-Көмекшідегі 5 инженерлік модульдің әрқайсысында кемінде 1 сұрақ қойыңыз.'
                          : lang === 'en'
                          ? 'Ask at least 1 question in all 5 engineering modules in the AI Tutor.'
                          : 'Задайте хотя бы по 1 вопросу в каждом из 5 инженерных модулей в ИИ-Помощнике.')}
                      {quest.id === 'xp_hunter' &&
                        (lang === 'kk'
                          ? `Қазіргі балансыңыз: ${user.xp} XP / 100 XP. XP жинау үшін ЖИ-ге сұрақтар қойыңыз.`
                          : lang === 'en'
                          ? `Current balance: ${user.xp} XP of 100 XP. Ask AI questions to earn XP.`
                          : `Ваш текущий баланс: ${user.xp} XP из 100 XP. Задавайте вопросы ИИ для накопления XP.`)}
                      {quest.id === 'streak_master' &&
                        (lang === 'kk'
                          ? `Қазіргі стригіңіз: ${user.streak} / 3 күн. 3 күндік серия жинау үшін күнделікті кіріңіз.`
                          : lang === 'en'
                          ? `Current streak: ${user.streak} of 3 days. Visit daily to achieve a 3-day streak.`
                          : `Ваш текущий стрик: ${user.streak} из 3 дней. Заходите на платформу ежедневно, чтобы набрать 3 дня серии.`)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
