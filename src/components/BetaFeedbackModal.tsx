import React, { useState } from 'react';
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

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4">
    <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="flex items-center gap-2 text-lg font-black"><MessageSquareText className="h-5 w-5 text-blue-600" />{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{warning}</p></div>
        <button type="button" onClick={close} aria-label="Close feedback" className="rounded-full bg-slate-100 p-2"><X className="h-4 w-4" /></button>
      </div>
      {state === 'success' ? <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
        {isKk ? 'Рақмет! Пікір бета-командаға жіберілді.' : isEn ? 'Thank you. Your feedback was sent to the beta team.' : 'Спасибо! Отзыв отправлен бета-команде.'}
      </div> : <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">{isKk ? 'Санат' : isEn ? 'Category' : 'Категория'}
            <select value={category} onChange={(e) => setCategory(e.target.value as BetaFeedbackInput['category'])} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5">
              <option value="bug">Bug</option><option value="confusing_ux">Confusing UX</option><option value="feature_request">Feature request</option>
              <option value="ai_answer_quality">AI answer quality</option><option value="project_engimatch">Projects / EngiMatch</option><option value="other">Other</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">{isKk ? 'Баға' : isEn ? 'Rating' : 'Оценка'}
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5">
              {[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}
            </select>
          </label>
        </div>
        <label className="block text-xs font-bold text-slate-700">{isKk ? 'Қысқа хабарлама' : isEn ? 'Short message' : 'Короткое сообщение'}
          <textarea required minLength={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)}
            className="mt-1 min-h-32 w-full rounded-xl border border-slate-200 p-3 text-sm" />
          <span className="block text-right text-[10px] text-slate-400">{message.length}/2000</span>
        </label>
        {state === 'error' && <p className="text-xs font-bold text-red-600">{isKk ? 'Жіберу мүмкін болмады.' : isEn ? 'Feedback could not be sent.' : 'Не удалось отправить отзыв.'}</p>}
        <button disabled={state === 'saving'} className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white disabled:opacity-60">
          {state === 'saving' ? (isEn ? 'Sending…' : isKk ? 'Жіберілуде…' : 'Отправляем…') : title}
        </button>
      </form>}
      <p className="mt-4 text-[11px] text-slate-500">{isKk ? 'Қолжетімділік мәселелері мен чаттағы теріс қылықтарды осы форма арқылы бета-үйлестірушіге жіберіңіз. Чатта алдымен бұғаттауды пайдаланыңыз.' : isEn ? 'Use this form to escalate access issues or abusive chat behavior to the beta coordinator. Block the user in chat first.' : 'Проблемы доступа и нарушения в чате отправляйте бета-координатору через эту форму. Сначала заблокируйте пользователя в чате.'}</p>
    </div>
  </div>;
};
