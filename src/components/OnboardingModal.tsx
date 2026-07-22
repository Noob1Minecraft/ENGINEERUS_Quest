import React, { useState } from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../data';
import { Sparkles, Trophy, Layers, BookOpen, CheckCircle2, ArrowRight, X } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  if (!isOpen) return null;

  const [step, setStep] = useState<number>(0);

  const steps = [
    {
      title: lang === 'kk' 
        ? 'Engineerus Quest-ке қош келдіңіз! 🚀' 
        : lang === 'en' 
        ? 'Welcome to Engineerus Quest! 🚀' 
        : 'Добро пожаловать в Engineerus Quest! 🚀',
      icon: <Sparkles className="w-8 h-8 text-blue-600" />,
      desc: lang === 'kk'
        ? 'Қазақстанның жоғары оқу орындарының студенттеріне арналған геймификацияланған ЖИ платформасы. Квесттерді орындаңыз, XP жинаңыз және үздік инженер болыңыз.'
        : lang === 'en'
        ? 'Gamified AI platform for university students in Kazakhstan. Complete quests, earn XP, and become a top-tier engineer.'
        : 'Геймифицированная ИИ-платформа для студентов вузов Казахстана. Выполняй квесты, зарабатывай XP и становись топовым инженером.',
    },
    {
      title: lang === 'kk'
        ? 'Инженерлік ЖИ-Көмекші 🤖'
        : lang === 'en'
        ? 'Engineering AI Assistant 🤖'
        : 'Инженерный ИИ-Помощник 🤖',
      icon: <Layers className="w-8 h-8 text-emerald-600" />,
      desc: lang === 'kk'
        ? 'TUTOR AI сопромат пен термех есептерін шығарады, MaterialSwap ҚР МЕМСТ бойынша материалдарды таңдайды, PatentCraft патент формулаларын ресімдейді.'
        : lang === 'en'
        ? 'TUTOR AI solves Strength of Materials and Mechanics problems, MaterialSwap selects materials per GOST KZ, PatentCraft drafts patent formulas.'
        : 'TUTOR AI решит задачи по Сопромату и Термеху, MaterialSwap подберет материалы по ГОСТ РК, PatentCraft оформит патентную формулу.',
    },
    {
      title: lang === 'kk'
        ? 'Квесттер мен Марапаттар 🏆'
        : lang === 'en'
        ? 'Quests & Rewards 🏆'
        : 'Квесты & Награды 🏆',
      icon: <Trophy className="w-8 h-8 text-amber-500" />,
      desc: lang === 'kk'
        ? 'Тапсырмаларды орындаңыз, стрик жоғалтпау үшін күнделікті кіріп тұрыңыз, бірегей бейдждер мен көшбасшылар тізімінен орын алыңыз!'
        : lang === 'en'
        ? 'Complete assignments, visit daily to preserve your streak, and earn unique badges and leaderboard spots!'
        : 'Выполняй задания, заходи каждый день для сохранения стрика и получай уникальные бейджи и позиции в таблице лидеров!',
    },
    {
      title: lang === 'kk'
        ? 'Telegram-мен синхрондау 📱'
        : lang === 'en'
        ? 'Sync with Telegram 📱'
        : 'Синхронизация с Telegram 📱',
      icon: <BookOpen className="w-8 h-8 text-indigo-600" />,
      desc: lang === 'kk'
        ? 'Прогресіңіз веб-сайтта да, Telegram-да да сақталуы үшін ботта /bind email пароль командасымен өз аккаунтыңызды байланыстырыңыз!'
        : lang === 'en'
        ? 'Link your account using /bind email password command in the bot, so your progress is saved on both website and Telegram!'
        : 'Привяжи свой аккаунт командой /bind email пароль в боте, чтобы твой прогресс сохранялся и на сайте, и в Telegram!',
    },
  ];

  const currentStep = steps[step];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full border border-slate-200 shadow-2xl relative text-center space-y-6">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto">
          {currentStep.icon}
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            {currentStep.title}
          </h2>
          <p className="text-xs text-slate-600 font-medium leading-relaxed max-w-md mx-auto">
            {currentStep.desc}
          </p>
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all ${
                idx === step ? 'w-6 bg-blue-600' : 'w-2 bg-slate-200'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {lang === 'kk' ? 'Артқа' : lang === 'en' ? 'Back' : 'Назад'}
            </button>
          ) : (
            <div />
          )}

          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
            >
              <span>{lang === 'kk' ? 'Келесі' : lang === 'en' ? 'Next' : 'Далее'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{lang === 'kk' ? 'Оқуды бастау!' : lang === 'en' ? 'Start Learning!' : 'Начать обучение!'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
