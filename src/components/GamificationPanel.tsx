import React from "react";
import { Award, CalendarCheck, Flame, Route, Trophy } from "lucide-react";
import type { Language } from "../types";
import type { GamificationQuest, GamificationState, LocalizedText } from "../gamification/gamificationApi";

function localized(value: LocalizedText, language: Language): string {
  return value[language] || value.ru || value.en || "";
}

function QuestRows({ quests, language }: { quests: GamificationQuest[]; language: Language }) {
  return <div className="space-y-2">
    {quests.map((quest) => {
      const current = Math.min(quest.progress.current, quest.progress.target);
      const percent = Math.round((current / Math.max(quest.progress.target, 1)) * 100);
      return <div key={`${quest.id}:${quest.cycle_key}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="flex items-start justify-between gap-3 text-xs">
          <div>
            <div className="font-black text-slate-800">{localized(quest.name, language)}</div>
            <div className="mt-0.5 text-slate-500">{localized(quest.description, language)}</div>
          </div>
          <span className={quest.status === "completed" ? "font-black text-emerald-600" : "font-black text-blue-600"}>
            {quest.status === "completed" ? "✓" : `+${quest.xp_reward} XP`}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-1 text-[10px] font-bold text-slate-400">{current} / {quest.progress.target}</div>
      </div>;
    })}
  </div>;
}

export function GamificationPanel({ state, language }: { state: GamificationState; language: Language }) {
  const chain = state.quest_chains[0];
  const earned = state.achievements.filter((item) => item.earned_at).slice(0, 3);
  const copy = language === "kk" ? {
    title: "Прогресс", daily: "Күнделікті квесттер", weekly: "Апталық квесттер",
    achievements: "Соңғы жетістіктер", chain: "Келесі мақсат", skills: "Оқу дағдылары",
  } : language === "en" ? {
    title: "Progression", daily: "Daily quests", weekly: "Weekly quests",
    achievements: "Recent achievements", chain: "Next objective", skills: "Learning skills",
  } : {
    title: "Прогресс", daily: "Ежедневные квесты", weekly: "Недельные квесты",
    achievements: "Последние достижения", chain: "Следующая цель", skills: "Учебные навыки",
  };

  return <section aria-label={copy.title} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /><h2 className="font-black text-slate-900">{copy.title}</h2></div>
      <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
        <span>LVL {state.progression.level}</span>
        <span className="flex items-center gap-1"><Flame className="h-4 w-4 text-orange-500" />{state.streak.current} / {state.streak.longest}</span>
      </div>
    </div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${state.progression.progress_percent}%` }} />
    </div>
    <div className="mt-1 text-right text-[10px] font-bold text-slate-400">{state.progression.xp_needed_for_next_level} XP</div>

    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div><h3 className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500"><CalendarCheck className="h-4 w-4" />{copy.daily}</h3><QuestRows quests={state.daily_quests} language={language} /></div>
      <div><h3 className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500"><CalendarCheck className="h-4 w-4" />{copy.weekly}</h3><QuestRows quests={state.weekly_quests} language={language} /></div>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="flex items-center gap-1.5 text-xs font-black text-slate-600"><Route className="h-4 w-4 text-blue-500" />{copy.chain}</div>
        <div className="mt-1 text-xs text-slate-700">{chain?.next_step ? localized(chain.next_step.name, language) : chain ? "✓" : "—"}</div>
        {chain && <div className="mt-1 text-[10px] text-slate-400">{chain.completed_steps} / {chain.steps.length}</div>}
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="flex items-center gap-1.5 text-xs font-black text-slate-600"><Award className="h-4 w-4 text-amber-500" />{copy.achievements}</div>
        <div className="mt-1 text-xs text-slate-700">{earned.length ? earned.map((item) => localized(item.name, language)).join(" • ") : "—"}</div>
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="text-xs font-black text-slate-600">{copy.skills}</div>
        <div className="mt-1 text-xs text-slate-700">{state.skills.length ? state.skills.slice(0, 2).map((skill) => `${localized(skill.name, language)}: ${skill.skill_xp}`).join(" • ") : "—"}</div>
      </div>
    </div>
  </section>;
}
