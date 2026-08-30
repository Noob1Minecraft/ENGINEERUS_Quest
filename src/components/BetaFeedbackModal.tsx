import React, { useEffect, useRef, useState } from 'react';
import { MessageSquareText, X } from 'lucide-react';
import type { BetaFeedbackInput } from '../beta/betaApi';
import { submitBetaFeedback } from '../beta/betaApi';
import type { Language } from '../types';

type Props = { open: boolean; lang: Language; productArea: BetaFeedbackInput['product_area']; onClose: () => void };

export const BetaFeedbackModal: React.FC<Props> = ({ open, lang, productArea, onClose }) => {
  const [category, setCategory] = useState<BetaFeedbackInput['category']>('bug');
  const [rating, setRating] = useState(4);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [open]);
  if (!open) return null;

  const isEn = lang === 'en';
  const isKk = lang === 'kk';
  const title = isKk ? 'Бета-пікір жіберу' : isEn ? 'Send beta feedback' : 'Отправить бета-отзыв';
  const warning = isKk ? 'Құпия сөздерді, токендерді немесе жеке хаттарды жібермеңіз.' : isEn
    ? 'Do not include passwords, tokens, or private messages.'
    : 'Не добавляйте пароли, токены или личные сообщения.';

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
    <div className="eq-dialog" role="dialog" aria-modal="true" aria-labelledby="beta-feedback-title">
      <div className="eq-dialog__header">
        <div><h2 id="beta-feedback-title"><MessageSquareText aria-hidden="true" />{title}</h2>
          <p>{warning}</p></div>
        <button type="button" onClick={close} aria-label="Close feedback" className="eq-dialog__close"><X aria-hidden="true" /></button>
      </div>
      {state === 'success' ? <div className="eq-alert eq-alert--success" role="status">
        {isKk ? 'Рақмет! Пікір бета-командаға жіберілді.' : isEn ? 'Thank you. Your feedback was sent to the beta team.' : 'Спасибо! Отзыв отправлен бета-команде.'}
      </div> : <form onSubmit={submit} className="eq-dialog__form">
        <div className="eq-dialog__form-grid">
          <label className="eq-form-field">{isKk ? 'Санат' : isEn ? 'Category' : 'Категория'}
            <select value={category} onChange={(e) => setCategory(e.target.value as BetaFeedbackInput['category'])}>
              <option value="bug">Bug</option><option value="confusing_ux">Confusing UX</option><option value="feature_request">Feature request</option>
              <option value="ai_answer_quality">AI answer quality</option><option value="project_engimatch">Projects / EngiMatch</option><option value="other">Other</option>
            </select>
          </label>
          <label className="eq-form-field">{isKk ? 'Баға' : isEn ? 'Rating' : 'Оценка'}
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}
            </select>
          </label>
        </div>
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
