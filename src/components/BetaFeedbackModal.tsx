import React, { useRef, useState } from 'react';
import { MessageSquareText, X } from 'lucide-react';
import type { BetaFeedbackInput } from '../beta/betaApi';
import { submitBetaFeedback } from '../beta/betaApi';
import type { Language } from '../types';
import { useDialogFocus } from '../hooks/useDialogFocus';

type Props = { open: boolean; lang: Language; productArea: BetaFeedbackInput['product_area']; onClose: () => void };

export const BetaFeedbackModal: React.FC<Props> = ({ open, lang, productArea, onClose }) => {
  const [category, setCategory] = useState<BetaFeedbackInput['category']>('bug');
  const [rating, setRating] = useState(4);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const dialogRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  useDialogFocus({ open, onClose, dialogRef, initialFocusRef: categoryRef });
  if (!open) return null;

  const isEn = lang === 'en';
  const isKk = lang === 'kk';
  const title = isKk ? 'Бета-пікір жіберу' : isEn ? 'Send beta feedback' : 'Отправить бета-отзыв';
  const closeLabel = isKk ? 'Пікір терезесін жабу' : isEn ? 'Close feedback' : 'Закрыть форму отзыва';
  const warning = isKk ? 'Құпия сөздерді, токендерді немесе жеке хаттарды жібермеңіз.' : isEn
    ? 'Do not include passwords, tokens, or private messages.'
    : 'Не добавляйте пароли, токены или личные сообщения.';
  const categoryLabels: Record<BetaFeedbackInput['category'], string> = isKk ? {
    bug: 'Қате', confusing_ux: 'Түсініксіз интерфейс', feature_request: 'Функция туралы ұсыныс',
    ai_answer_quality: 'ЖИ жауабының сапасы', project_engimatch: 'Projects / EngiMatch', other: 'Басқа',
  } : isEn ? {
    bug: 'Bug', confusing_ux: 'Confusing UX', feature_request: 'Feature request',
    ai_answer_quality: 'AI answer quality', project_engimatch: 'Projects / EngiMatch', other: 'Other',
  } : {
    bug: 'Ошибка', confusing_ux: 'Непонятный интерфейс', feature_request: 'Предложение функции',
    ai_answer_quality: 'Качество ответа ИИ', project_engimatch: 'Projects / EngiMatch', other: 'Другое',
  };
  const productAreaLabels: Record<BetaFeedbackInput['product_area'], string> = isKk ? {
    onboarding: 'Танысу', dashboard: 'Басты бет', profile: 'Профиль', ai_tutor: 'ЖИ-Тьютор', quests: 'Квесттер',
    projects: 'Жобалар', engimatch: 'EngiMatch', messages: 'Хабарламалар', authentication: 'Кіру және тіркелу', other: 'Басқа бөлім',
  } : isEn ? {
    onboarding: 'Onboarding', dashboard: 'Dashboard', profile: 'Profile', ai_tutor: 'AI Tutor', quests: 'Quests',
    projects: 'Projects', engimatch: 'EngiMatch', messages: 'Messages', authentication: 'Authentication', other: 'Other area',
  } : {
    onboarding: 'Знакомство', dashboard: 'Главная', profile: 'Профиль', ai_tutor: 'ИИ-Тьютор', quests: 'Квесты',
    projects: 'Проекты', engimatch: 'EngiMatch', messages: 'Сообщения', authentication: 'Вход и регистрация', other: 'Другой раздел',
  };

  const close = () => {
    setMessage('');
    setState('idle');
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('saving');
    try {
      await submitBetaFeedback({ category, rating, product_area: productArea, message });
      setMessage('');
      setState('success');
    } catch { setState('error'); }
  };

  return <div className="eq-dialog-backdrop">
    <div ref={dialogRef} tabIndex={-1} className="eq-dialog" role="dialog" aria-modal="true" aria-labelledby="beta-feedback-title">
      <div className="eq-dialog__header">
        <div><h2 id="beta-feedback-title"><MessageSquareText aria-hidden="true" />{title}</h2>
          <p>{warning}</p></div>
        <button type="button" onClick={close} aria-label={closeLabel} className="eq-dialog__close"><X aria-hidden="true" /></button>
      </div>
      {state === 'success' ? <div className="eq-alert eq-alert--success" role="status">
        {isKk ? 'Рақмет! Пікір бета-командаға жіберілді.' : isEn ? 'Thank you. Your feedback was sent to the beta team.' : 'Спасибо! Отзыв отправлен бета-команде.'}
      </div> : <form onSubmit={submit} className="eq-dialog__form">
        <div className="eq-dialog__form-grid">
          <label className="eq-form-field">{isKk ? 'Санат' : isEn ? 'Category' : 'Категория'}
            <select ref={categoryRef} value={category} onChange={(e) => setCategory(e.target.value as BetaFeedbackInput['category'])}>
              {(Object.keys(categoryLabels) as Array<BetaFeedbackInput['category']>).map((value) => <option value={value} key={value}>{categoryLabels[value]}</option>)}
            </select>
          </label>
          <label className="eq-form-field">{isKk ? 'Баға' : isEn ? 'Rating' : 'Оценка'}
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}
            </select>
          </label>
        </div>
        <p className="eq-dialog__context"><span>{isKk ? 'Бөлім' : isEn ? 'Product area' : 'Раздел'}</span><strong>{productAreaLabels[productArea]}</strong></p>
        <label className="eq-form-field">{isKk ? 'Қысқа хабарлама' : isEn ? 'Short message' : 'Короткое сообщение'}
          <textarea required minLength={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)}
            className="eq-form-field__textarea" />
          <span className="eq-form-field__count">{message.length}/2000</span>
        </label>
        {state === 'error' && <p className="eq-alert eq-alert--error" role="alert">{isKk ? 'Жіберу мүмкін болмады.' : isEn ? 'Feedback could not be sent.' : 'Не удалось отправить отзыв.'}</p>}
        <button disabled={state === 'saving'} className="eq-button eq-button--primary eq-dialog__submit">
          {state === 'saving' ? (isEn ? 'Sending…' : isKk ? 'Жіберілуде…' : 'Отправляем…') : title}
        </button>
      </form>}
      <p className="eq-dialog__note">{isKk ? 'Қолжетімділік мәселелері мен чаттағы теріс қылықтарды осы форма арқылы бета-үйлестірушіге жіберіңіз. Чатта алдымен бұғаттауды пайдаланыңыз.' : isEn ? 'Use this form to escalate access issues or abusive chat behavior to the beta coordinator. Block the user in chat first.' : 'Проблемы доступа и нарушения в чате отправляйте бета-координатору через эту форму. Сначала заблокируйте пользователя в чате.'}</p>
    </div>
  </div>;
};
