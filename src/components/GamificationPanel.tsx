import React from "react";
import {
  ArrowRight,
  Award,
  CalendarCheck2,
  Check,
  Circle,
  Flame,
  LockKeyhole,
  Route,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { Language } from "../types";
import type { GamificationQuest, GamificationState, LocalizedText } from "../gamification/gamificationApi";
import { Badge, Button, EmptyState, ProgressBar, Surface } from "./ui";

function localized(value: LocalizedText, language: Language): string {
  return value[language] || value.ru || value.en || "";
}

function questProgress(quest: GamificationQuest): number {
  return Math.round((Math.min(quest.progress.current, quest.progress.target) / Math.max(quest.progress.target, 1)) * 100);
}

function destinationForFact(fact: string): string | null {
  if (fact === "profile_complete") return "profile";
  if (fact === "ai_questions") return "ai";
  if (fact === "learning_quests") return "quests";
  if (fact === "engimatch") return "engimatch";
  if (fact === "projects") return "projects";
  return null;
}

export function GamificationPanel({
  state,
  language,
  onNavigate,
}: {
  state: GamificationState;
  language: Language;
  onNavigate?: (destination: string) => void;
}) {
  const copy = language === "kk" ? {
    title: "Инженерлік прогресс",
    level: "Деңгей",
    totalXp: "Жалпы XP",
    toNext: "келесі деңгейге дейін",
    streak: "Күндер сериясы",
    currentStreak: "Қазіргі",
    longestStreak: "Ең ұзақ",
    dailyComplete: "Бүгінгі белсенділік орындалды",
    dailyAction: "Бүгін Engineerus-қа кіргеніңді белгіле",
    nextAction: "Келесі қадам",
    open: "Ашу",
    chainComplete: "Бастапқы тізбек аяқталды",
    weekly: "Осы апта",
    weeklyEmpty: "Апталық мақсаттар әлі жоқ",
    weeklyEmptyDescription: "Жаңа мақсат пайда болғанда, ол осында көрсетіледі.",
    achievements: "Жетістіктер",
    earned: "Ашылды",
    locked: "Әлі ашылмаған",
    achievementsEmpty: "Жетістіктер әлі жоқ",
    achievementsEmptyDescription: "Оқу әрекеттері жетістіктерді біртіндеп ашады.",
    starter: "Инженерлік бастау",
    completed: "Орындалды",
    current: "Қазіргі қадам",
    future: "Кейін",
    skills: "Дағдыларды үйрену",
    skillXp: "дағды XP",
    skillsEmpty: "Дағды прогресі әлі жоқ",
    skillsEmptyDescription: "Оқу әрекетінен кейін дағды XP осы жерде көрінеді.",
    learningNote: "Бұл оқу прогресі, кәсіби сертификаттау емес.",
  } : language === "en" ? {
    title: "Engineering progress",
    level: "Level",
    totalXp: "Total XP",
    toNext: "to the next level",
    streak: "Daily streak",
    currentStreak: "Current",
    longestStreak: "Longest",
    dailyComplete: "Today's activity is complete",
    dailyAction: "Check in with Engineerus today",
    nextAction: "Next action",
    open: "Open",
    chainComplete: "Starter path completed",
    weekly: "This week",
    weeklyEmpty: "No weekly goals yet",
    weeklyEmptyDescription: "A new goal will appear here when it becomes available.",
    achievements: "Achievements",
    earned: "Unlocked",
    locked: "Not unlocked yet",
    achievementsEmpty: "No achievements yet",
    achievementsEmptyDescription: "Learning activity will unlock achievements over time.",
    starter: "Engineering Starter",
    completed: "Completed",
    current: "Current step",
    future: "Later",
    skills: "Skill learning",
    skillXp: "skill XP",
    skillsEmpty: "No skill progress yet",
    skillsEmptyDescription: "Skill XP will appear here after relevant learning activity.",
    learningNote: "This is learning progress, not professional certification.",
  } : {
    title: "Инженерный прогресс",
    level: "Уровень",
    totalXp: "Всего XP",
    toNext: "до следующего уровня",
    streak: "Серия активности",
    currentStreak: "Текущая",
    longestStreak: "Лучшая",
    dailyComplete: "Активность на сегодня выполнена",
    dailyAction: "Отметь активность в Engineerus сегодня",
    nextAction: "Следующий шаг",
    open: "Открыть",
    chainComplete: "Стартовая цепочка завершена",
    weekly: "На этой неделе",
    weeklyEmpty: "Недельных целей пока нет",
    weeklyEmptyDescription: "Новая цель появится здесь, когда станет доступна.",
    achievements: "Достижения",
    earned: "Получено",
    locked: "Пока не открыто",
    achievementsEmpty: "Достижений пока нет",
    achievementsEmptyDescription: "Учебная активность постепенно откроет достижения.",
    starter: "Инженерный старт",
    completed: "Выполнено",
    current: "Текущий шаг",
    future: "Позже",
    skills: "Развитие навыков",
    skillXp: "XP навыка",
    skillsEmpty: "Прогресса навыков пока нет",
    skillsEmptyDescription: "XP навыков появится здесь после подходящей учебной активности.",
    learningNote: "Это учебный прогресс, а не профессиональная сертификация.",
  };

  const chain = state.quest_chains.find((item) => item.slug === "engineering-starter") ?? state.quest_chains[0];
  const nextStep = chain?.next_step ?? null;
  const nextDestination = nextStep ? destinationForFact(nextStep.fact) : null;
  const dailyQuest = state.daily_quests.find((quest) => quest.status !== "completed") ?? state.daily_quests[0];
  const dailyComplete = state.daily_quests.length > 0 && state.daily_quests.every((quest) => quest.status === "completed");
  const earnedAchievements = state.achievements
    .filter((achievement) => achievement.earned_at)
    .sort((left, right) => Date.parse(right.earned_at ?? "") - Date.parse(left.earned_at ?? ""));
  const lockedAchievements = state.achievements.filter((achievement) => !achievement.earned_at);
  const achievementPreview = [...earnedAchievements.slice(0, 2), ...lockedAchievements.slice(0, 2)].slice(0, 4);
  const levelRange = state.progression.xp_into_level + state.progression.xp_needed_for_next_level;

  return (
    <section aria-labelledby="gamification-dashboard-title" className="eq-dashboard">
      <header className="eq-dashboard__heading">
        <div>
          <p className="eq-dashboard__eyebrow"><Sparkles aria-hidden="true" /> Engineerus Quest</p>
          <h1 id="gamification-dashboard-title">{copy.title}</h1>
        </div>
        <Badge tone="neutral">{copy.totalXp}: {state.progression.total_xp}</Badge>
      </header>

      <div className="eq-dashboard__summary">
        <Surface className="eq-dashboard__level">
          <div className="eq-dashboard__section-title">
            <span><Trophy aria-hidden="true" /> {copy.level} {state.progression.level}</span>
            <strong>{state.progression.progress_percent}%</strong>
          </div>
          <ProgressBar value={state.progression.progress_percent} label={`${copy.level} ${state.progression.level}: ${state.progression.progress_percent}%`} />
          <div className="eq-dashboard__level-meta">
            <span>{state.progression.xp_into_level} / {levelRange} XP</span>
            <span>{state.progression.xp_needed_for_next_level} XP {copy.toNext}</span>
          </div>
        </Surface>

        <Surface className="eq-dashboard__streak">
          <div className="eq-dashboard__section-title"><span><Flame aria-hidden="true" /> {copy.streak}</span></div>
          <div className="eq-dashboard__streak-values">
            <span><strong>{state.streak.current}</strong>{copy.currentStreak}</span>
            <span><strong>{state.streak.longest}</strong>{copy.longestStreak}</span>
          </div>
          <div className={`eq-dashboard__daily ${dailyComplete ? "is-complete" : ""}`}>
            {dailyComplete ? <Check aria-hidden="true" /> : <CalendarCheck2 aria-hidden="true" />}
            <span>{dailyComplete ? copy.dailyComplete : dailyQuest ? localized(dailyQuest.name, language) : copy.dailyAction}</span>
          </div>
        </Surface>
      </div>

      <Surface className="eq-dashboard__next">
        <div className="eq-dashboard__next-copy">
          <span className="eq-dashboard__eyebrow"><Route aria-hidden="true" /> {copy.nextAction}</span>
          <h2>{nextStep ? localized(nextStep.name, language) : copy.chainComplete}</h2>
          {nextStep && chain && <p>{localized(chain.description, language)}</p>}
        </div>
        {nextStep && nextDestination && onNavigate && (
          <Button onClick={() => onNavigate(nextDestination)}>
            {copy.open}<ArrowRight aria-hidden="true" />
          </Button>
        )}
        {!nextStep && <Badge tone="success"><Check aria-hidden="true" /> {copy.completed}</Badge>}
      </Surface>

      <div className="eq-dashboard__content-grid">
        <Surface className="eq-dashboard__weekly">
          <div className="eq-dashboard__section-title"><span><CalendarCheck2 aria-hidden="true" /> {copy.weekly}</span></div>
          {state.weekly_quests.length > 0 ? (
            <div className="eq-dashboard__quest-list">
              {state.weekly_quests.map((quest) => {
                const current = Math.min(quest.progress.current, quest.progress.target);
                return (
                  <div className="eq-dashboard__quest" key={`${quest.id}:${quest.cycle_key}`}>
                    <div className="eq-dashboard__quest-heading">
                      <div><strong>{localized(quest.name, language)}</strong><p>{localized(quest.description, language)}</p></div>
                      <Badge tone={quest.status === "completed" ? "success" : "reward"}>
                        {quest.status === "completed" ? copy.completed : `+${quest.xp_reward} XP`}
                      </Badge>
                    </div>
                    <ProgressBar value={questProgress(quest)} label={`${localized(quest.name, language)}: ${current} / ${quest.progress.target}`} />
                    <span className="eq-dashboard__quest-count">{current} / {quest.progress.target}</span>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState title={copy.weeklyEmpty} description={copy.weeklyEmptyDescription} />}
        </Surface>

        <Surface className="eq-dashboard__achievements">
          <div className="eq-dashboard__section-title"><span><Award aria-hidden="true" /> {copy.achievements}</span></div>
          {achievementPreview.length > 0 ? (
            <ul className="eq-dashboard__achievement-list">
              {achievementPreview.map((achievement, index) => {
                const isEarned = Boolean(achievement.earned_at);
                return (
                  <li className={isEarned ? "is-earned" : "is-locked"} key={achievement.slug}>
                    <span className="eq-dashboard__achievement-icon">
                      {isEarned ? <Trophy aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
                    </span>
                    <span><strong>{localized(achievement.name, language)}</strong><small>{isEarned ? copy.earned : copy.locked}</small></span>
                    <Badge tone={isEarned && index === 0 ? "reward" : isEarned ? "success" : "neutral"}>+{achievement.xp_reward} XP</Badge>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState title={copy.achievementsEmpty} description={copy.achievementsEmptyDescription} />}
        </Surface>
      </div>

      <Surface className="eq-dashboard__starter">
        <div className="eq-dashboard__section-title">
          <span><Route aria-hidden="true" /> {chain ? localized(chain.name, language) : copy.starter}</span>
          {chain && <Badge tone={chain.completed_at ? "success" : "primary"}>{chain.completed_steps} / {chain.steps.length}</Badge>}
        </div>
        {chain ? (
          <ol className="eq-dashboard__steps">
            {chain.steps.map((step, index) => {
              const isComplete = index < chain.completed_steps;
              const isCurrent = nextStep?.id === step.id;
              return (
                <li className={isComplete ? "is-complete" : isCurrent ? "is-current" : "is-future"} key={step.id}>
                  <span className="eq-dashboard__step-icon">{isComplete ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}</span>
                  <span><strong>{localized(step.name, language)}</strong><small>{isComplete ? copy.completed : isCurrent ? copy.current : copy.future}</small></span>
                </li>
              );
            })}
          </ol>
        ) : <EmptyState title={copy.weeklyEmpty} description={copy.weeklyEmptyDescription} />}
      </Surface>

      <Surface className="eq-dashboard__skills">
        <div className="eq-dashboard__section-title"><span><Sparkles aria-hidden="true" /> {copy.skills}</span></div>
        {state.skills.length > 0 ? (
          <div className="eq-dashboard__skill-list">
            {state.skills.map((skill) => (
              <div className="eq-dashboard__skill" key={skill.skill_id}>
                <strong>{localized(skill.name, language)}</strong>
                <span>{skill.skill_xp} {copy.skillXp}</span>
              </div>
            ))}
          </div>
        ) : <EmptyState title={copy.skillsEmpty} description={copy.skillsEmptyDescription} />}
        <p className="eq-dashboard__learning-note">{copy.learningNote}</p>
      </Surface>
    </section>
  );
}
