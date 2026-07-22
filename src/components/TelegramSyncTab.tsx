import React from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../data';
import { CheckCircle2, ArrowRight, ShieldCheck, Flame, Zap } from 'lucide-react';

interface TelegramSyncTabProps {
  lang: Language;
}

export const TelegramSyncTab: React.FC<TelegramSyncTabProps> = ({ lang }) => {
  const t = TRANSLATIONS[lang];

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="bg-gradient-to-br from-slate-50 via-slate-100/40 to-blue-50/25 text-slate-800 rounded-2xl p-5 sm:p-6 md:p-8 shadow-xs relative overflow-hidden border border-slate-200/50">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-60 h-60 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-1.5">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
            {t.tgSyncTitle}
          </h2>
          <p className="text-xs text-slate-500 font-medium max-w-xl leading-relaxed">
            {t.tgSyncDesc}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Step 1 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-xs space-y-3">
          <div className="w-8.5 h-8.5 rounded-xl bg-blue-50 text-blue-500 font-bold text-sm flex items-center justify-center">
            01
          </div>
          <h3 className="font-bold text-sm text-slate-900">
            {t.tgStep1Title}
          </h3>
          <p className="text-xs text-slate-400 font-medium leading-relaxed">
            {t.tgStep1Text}
          </p>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/50 text-xs font-mono font-bold text-slate-700">
            /start
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-xs space-y-3">
          <div className="w-8.5 h-8.5 rounded-xl bg-indigo-50 text-indigo-500 font-bold text-sm flex items-center justify-center">
            02
          </div>
          <h3 className="font-bold text-sm text-slate-900">
            {t.tgStep2Title}
          </h3>
          <p className="text-xs text-slate-400 font-medium leading-relaxed">
            {t.tgStep2Text}
          </p>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/50 text-xs font-mono font-bold text-slate-700 truncate" title="/bind student@engineerus.kz password123">
            /bind student@engineerus.kz password123
          </div>
        </div>

        {/* Step 3 */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-xs space-y-3">
          <div className="w-8.5 h-8.5 rounded-xl bg-emerald-50 text-emerald-500 font-bold text-sm flex items-center justify-center">
            03
          </div>
          <h3 className="font-bold text-sm text-slate-900">
            {t.tgStep3Title}
          </h3>
          <p className="text-xs text-slate-400 font-medium leading-relaxed">
            {t.tgStep3Text}
          </p>
          <div className="bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-200/40 text-xs font-bold text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {lang === 'kk' ? 'Синхрондау белсенді!' : lang === 'en' ? 'Sync Active!' : 'Синхронизация активна!'}
          </div>
        </div>
      </div>

      {/* Sync Benefits Card */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/60 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <ShieldCheck className="w-4.5 h-4.5 text-blue-600" />
          {lang === 'kk' ? 'Сайт пен бот арасында не синхрондалады:' : lang === 'en' ? 'What syncs between website and bot:' : 'Что синхронизируется между сайтом и ботом:'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-3 rounded-xl border border-slate-200/55 bg-slate-50/35 flex items-center gap-3">
            <Zap className="w-4.5 h-4.5 text-amber-500 shrink-0" />
            <span className="text-xs font-bold text-slate-700">{lang === 'kk' ? 'XP Ұпайлары мен Деңгей' : lang === 'en' ? 'XP Points & Level' : 'XP Очки и Уровень'}</span>
          </div>
          <div className="p-3 rounded-xl border border-slate-200/55 bg-slate-50/35 flex items-center gap-3">
            <Flame className="w-4.5 h-4.5 text-orange-500 shrink-0" />
            <span className="text-xs font-bold text-slate-700">{lang === 'kk' ? 'Күнделікті Стрик' : lang === 'en' ? 'Daily Streak' : 'Ежедневный Стрик'}</span>
          </div>
          <div className="p-3 rounded-xl border border-slate-200/55 bg-slate-50/35 flex items-center gap-3">
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
            <span className="text-xs font-bold text-slate-700">{lang === 'kk' ? 'Орындалған Квесттер' : lang === 'en' ? 'Completed Quests' : 'Выполненные Квесты'}</span>
          </div>
          <div className="p-3 rounded-xl border border-slate-200/55 bg-slate-50/35 flex items-center gap-3">
            <ShieldCheck className="w-4.5 h-4.5 text-indigo-500 shrink-0" />
            <span className="text-xs font-bold text-slate-700">{lang === 'kk' ? 'ЖИ-Сұраулар Тарихы' : lang === 'en' ? 'AI Request History' : 'История ИИ-Запросов'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
