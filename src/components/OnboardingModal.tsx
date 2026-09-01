import React, { useRef, useState } from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../data';
import { DraftingCompass, Trophy, Layers, CheckCircle2, ArrowRight, X } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';

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
  const [step, setStep] = useState<number>(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useDialogFocus({ open: isOpen, onClose, dialogRef, initialFocusRef: closeButtonRef });
  if (!isOpen) return null;

  const steps = [
    {
      title: lang === 'kk' 
        ? 'Engineerus Quest-ке қош келдіңіз!'
        : lang === 'en' 
        ? 'Welcome to Engineerus Quest!'
        : 'Добро пожаловать в Engineerus Quest!',
      icon: <DraftingCompass />,
      desc: lang === 'kk'
        ? 'Қазақстанның жоғары оқу орындарының студенттеріне арналған геймификацияланған ЖИ платформасы. Квесттерді орындаңыз, XP жинаңыз және үздік инженер болыңыз.'
        : lang === 'en'
        ? 'Gamified AI platform for university students in Kazakhstan. Complete quests, earn XP, and become a top-tier engineer.'
        : 'Геймифицированная ИИ-платформа для студентов вузов Казахстана. Выполняй квесты, зарабатывай XP и становись топовым инженером.',
    },
    {
      title: lang === 'kk'
        ? 'Инженерлік ЖИ-Көмекші'
        : lang === 'en'
        ? 'Engineering AI Assistant'
        : 'Инженерный ИИ-Помощник',
      icon: <Layers />,
      desc: lang === 'kk'
        ? 'TUTOR AI сопромат пен термех есептерін шығарады, MaterialSwap ҚР МЕМСТ бойынша материалдарды таңдайды, PatentCraft патент формулаларын ресімдейді.'
        : lang === 'en'
        ? 'TUTOR AI solves Strength of Materials and Mechanics problems, MaterialSwap selects materials per GOST KZ, PatentCraft drafts patent formulas.'
        : 'TUTOR AI решит задачи по Сопромату и Термеху, MaterialSwap подберет материалы по ГОСТ РК, PatentCraft оформит патентную формулу.',
    },
    {
      title: lang === 'kk'
        ? 'Квесттер мен Марапаттар'
        : lang === 'en'
        ? 'Quests & Rewards'
        : 'Квесты & Награды',
      icon: <Trophy />,
      desc: lang === 'kk'
        ? 'Тапсырмаларды орындаңыз, стрик жоғалтпау үшін күнделікті кіріп тұрыңыз, бірегей бейдждер мен көшбасшылар тізімінен орын алыңыз!'
        : lang === 'en'
        ? 'Complete assignments, visit daily to preserve your streak, and earn unique badges and leaderboard spots!'
        : 'Выполняй задания, заходи каждый день для сохранения стрика и получай уникальные бейджи и позиции в таблице лидеров!',
    },
  ];

  const currentStep = steps[step];

  return (
    <div className="eq-dialog-backdrop">
      <div ref={dialogRef} tabIndex={-1} className="eq-dialog eq-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close onboarding"
          className="eq-dialog__close eq-auth-dialog__close"
        >
          <X className="w-4 h-4" />
        </button>
        
        <div className="eq-onboarding-dialog__icon">
          {currentStep.icon}
        </div>

        <div className="space-y-2">
          <h2 id="onboarding-title" className="eq-auth-dialog__title">
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
              className={idx === step ? 'is-active' : ''}
            />
          ))}
        </div>

        <div className="eq-onboarding-dialog__actions">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="eq-button eq-button--secondary"
            >
              {lang === 'kk' ? 'Артқа' : lang === 'en' ? 'Back' : 'Назад'}
            </button>
          ) : (
            <div />
          )}

          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="eq-button eq-button--primary"
            >
              <span>{lang === 'kk' ? 'Келесі' : lang === 'en' ? 'Next' : 'Далее'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="eq-button eq-button--primary"
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
