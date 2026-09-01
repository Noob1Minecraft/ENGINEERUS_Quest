import React from 'react';
import { ArrowRight, Bot, CheckCircle2, ListChecks, UsersRound } from 'lucide-react';
import type { Language } from '../types';

type Props = {
  lang: Language;
  completing: boolean;
  onNavigate: (tab: string) => void;
  onComplete: () => void;
};

export const BetaOnboardingCard: React.FC<Props> = ({ lang, completing, onNavigate, onComplete }) => {
  const copy = lang === 'kk' ? {
    title: 'Бета-тестілеуді осы жерден бастаңыз',
    description: 'Engineerus Quest инженерлік оқуды, квесттерді және нақты командалық жобаларды бір жерде біріктіреді.',
    profile: 'Профильді толтырыңыз', ai: 'ИИ-Тьюторға бірінші сұрақ қойыңыз',
    progress: 'Квесттер XP мен прогресті арттырады', match: 'Projects және EngiMatch арқылы команда табыңыз',
    done: 'Бастау тізімін аяқтау', saving: 'Сақталуда…',
  } : lang === 'en' ? {
    title: 'Start your beta journey here',
    description: 'Engineerus Quest combines engineering learning, quests, and real team projects in one workspace.',
    profile: 'Complete your profile', ai: 'Ask your first AI Tutor question',
    progress: 'Quests build XP and progress', match: 'Use Projects and EngiMatch to find a team',
    done: 'Complete getting started', saving: 'Saving…',
  } : {
    title: 'Начните бета-тестирование здесь',
    description: 'Engineerus Quest объединяет инженерное обучение, квесты и реальные командные проекты в одном пространстве.',
    profile: 'Заполните профиль', ai: 'Задайте первый вопрос ИИ-Тьютору',
    progress: 'Квесты развивают XP и прогресс', match: 'Ищите команду через Projects и EngiMatch',
    done: 'Завершить знакомство', saving: 'Сохраняем…',
  };

  const actions = [
    { label: copy.profile, tab: 'profile', icon: ListChecks },
    { label: copy.ai, tab: 'ai', icon: Bot },
    { label: copy.progress, tab: 'quests', icon: CheckCircle2 },
    { label: copy.match, tab: 'projects', icon: UsersRound },
  ];

  return <section aria-label="Controlled beta onboarding" className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 shadow-xs">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-1">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Controlled Beta</p>
        <h2 className="text-base font-black text-slate-950">{copy.title}</h2>
        <p className="max-w-2xl text-xs font-medium leading-relaxed text-slate-600">{copy.description}</p>
      </div>
      <button type="button" disabled={completing} onClick={onComplete}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60">
        <CheckCircle2 className="h-4 w-4" />{completing ? copy.saving : copy.done}
      </button>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {actions.map(({ label, tab, icon: Icon }) => <button key={tab} type="button" onClick={() => onNavigate(tab)}
        className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-left text-xs font-bold text-slate-700 hover:border-blue-300">
        <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-blue-600" />{label}</span><ArrowRight className="h-3.5 w-3.5" />
      </button>)}
    </div>
  </section>;
};
