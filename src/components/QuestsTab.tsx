import React, { useState } from 'react';
import { UserProfile, Language, Quest } from '../types';
import { TRANSLATIONS } from '../data';
import { CheckCircle2, Zap, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from './ui';

interface QuestsTabProps {
  user: UserProfile;
  quests: Record<string, Quest>;
  lang: Language;
  onCompleteQuest: (questId: string) => Promise<void>;
  onNavigateToQuest?: (tab: string, module?: string) => void;
}

export const QuestsTab: React.FC<QuestsTabProps> = ({
  user,
  quests,
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
    <section className="eq-legacy-page eq-quests" aria-labelledby="quests-title">
      <header className="eq-legacy-page__header">
        <div>
          <span className="eq-legacy-page__eyebrow">QUEST LOG / ACTIVE</span>
          <h2 id="quests-title" className="eq-legacy-page__title">
            {t.activeQuestsTitle}
          </h2>
          <p className="eq-legacy-page__description">
            {lang === 'kk'
              ? 'Тапсырманы тікелей ИИ-помощник бөлімінде орындап, автоматты түрде XP жинаңыз.'
              : lang === 'en'
              ? 'Perform the required action in the AI Assistant to automatically claim XP.'
              : 'Выполняйте реальные действия в ИИ-Помощнике, чтобы автоматически получать XP и награды.'}
          </p>
        </div>
        <p className="eq-legacy-page__measure" aria-label={`${t.completed || 'Выполнено'} ${user.completed_quests.length} ${t.completedOf || 'из'} ${Object.keys(quests).length}`}>
          {t.completed || 'Выполнено'}: {user.completed_quests.length} {t.completedOf || 'из'} {Object.keys(quests).length}
        </p>
      </header>

      <div className="eq-quest-list">
        {(Object.values(quests) as Quest[]).map((quest) => {
          const isCompleted = user.completed_quests.includes(quest.id);
          const name = lang === 'kk' ? quest.name_kk : lang === 'en' ? quest.name_en : quest.name;
          const desc = lang === 'kk' ? quest.desc_kk : lang === 'en' ? quest.desc_en : quest.desc;
          const isNoticeOpen = activeNoticeId === quest.id;

          return (
            <article
              key={quest.id}
              className={`eq-quest-row${isCompleted ? ' is-complete' : ''}`}
            >
              <div className="eq-quest-row__main">
                <div className="eq-quest-row__identity">
                  <span className="eq-quest-row__marker" aria-hidden="true">
                    {isCompleted ? (
                      <CheckCircle2 />
                    ) : (
                      <Zap />
                    )}
                  </span>
                  <div className="eq-quest-row__copy">
                    <div className="eq-quest-row__heading">
                      <h3>{name}</h3>
                      <span className="eq-quest-row__xp">+{quest.xp} XP</span>
                    </div>
                    <p>{desc}</p>
                    <p className="eq-quest-row__reward"><span>{t.rewardLabel}</span> {lang === 'kk' ? quest.reward_kk : lang === 'en' ? quest.reward_en : quest.reward}</p>
                  </div>
                </div>

                <div className="eq-quest-row__action">
                  {isCompleted ? (
                    <span className="eq-quest-row__complete">
                      <CheckCircle2 aria-hidden="true" />
                      {t.questCompleted}
                    </span>
                  ) : (
                    <Button
                      onClick={() => handleQuestButtonClick(quest.id)}
                      className="eq-quest-row__button"
                    >
                      <span>{getButtonText(quest.id)}</span>
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Requirement Hint Notice when user clicks an uncompleted action requiring task */}
              {!isCompleted && isNoticeOpen && (
                <div className="eq-quest-row__notice" role="status">
                  <AlertCircle aria-hidden="true" />
                  <div>
                    <strong>{t.questActionRequired}</strong>
                    <p>
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
            </article>
          );
        })}
      </div>
    </section>
  );
};
