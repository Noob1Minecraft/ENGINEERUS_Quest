import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, MessageSquareText, Search, ShieldCheck, Star, UserCog } from 'lucide-react';
import type { Language } from '../types';
import {
  grantAdmin,
  loadAdminFeedback,
  loadAdmins,
  revokeAdmin,
  searchAdminUsers,
  updateAdminFeedbackStatus,
  type AdminFeedback,
  type AdminFeedbackStatus,
  type AdminSummary,
  type AdminUserSearchResult,
} from '../admin/adminApi';
import { Button, EmptyState, ErrorState, LoadingState } from './ui';

const copy = {
  ru: {
    eyebrow: 'Операционная панель', title: 'Администрирование', description: 'Отзывы бета-участников и доступ администраторов — без доступа к приватному контенту продукта.',
    feedback: 'Отзывы', admins: 'Администраторы', loading: 'Загружаем административные данные…', error: 'Не удалось загрузить данные', retry: 'Повторить',
    emptyFeedback: 'Новых отзывов пока нет', emptyFeedbackHint: 'Здесь появятся сообщения, отправленные через форму обратной связи.',
    searchLabel: 'Найти пользователя', searchPlaceholder: 'Имя или username', searchAction: 'Найти', noUsers: 'Совпадений не найдено',
    makeAdmin: 'Назначить администратором', removeAdmin: 'Отозвать доступ', current: 'Текущий аккаунт', confirmRevoke: 'Отозвать административный доступ у этого пользователя?',
    new: 'Новый', reviewed: 'Рассмотрен', resolved: 'Решён', statusLabel: 'Статус', rating: 'Оценка', area: 'Раздел', category: 'Категория', submitted: 'Отправлено',
    saving: 'Сохраняем…', roleUpdated: 'Доступ обновлён.', actionError: 'Действие не выполнено. Попробуйте ещё раз.', selectFeedback: 'Выберите отзыв, чтобы прочитать его полностью.',
  },
  kk: {
    eyebrow: 'Операциялық панель', title: 'Әкімшілендіру', description: 'Бета-қатысушылар пікірі мен әкімші рөлдері — өнімнің жеке мазмұнына қолжетімсіз.',
    feedback: 'Пікірлер', admins: 'Әкімшілер', loading: 'Әкімшілік деректер жүктелуде…', error: 'Деректер жүктелмеді', retry: 'Қайталау',
    emptyFeedback: 'Әзірге жаңа пікір жоқ', emptyFeedbackHint: 'Кері байланыс нысаны арқылы жіберілген хабарламалар осында шығады.',
    searchLabel: 'Пайдаланушыны табу', searchPlaceholder: 'Аты немесе username', searchAction: 'Табу', noUsers: 'Сәйкестік табылмады',
    makeAdmin: 'Әкімші ету', removeAdmin: 'Қолжетімділікті қайтару', current: 'Ағымдағы аккаунт', confirmRevoke: 'Бұл пайдаланушының әкімші қолжетімділігін қайтару керек пе?',
    new: 'Жаңа', reviewed: 'Қаралды', resolved: 'Шешілді', statusLabel: 'Күйі', rating: 'Баға', area: 'Бөлім', category: 'Санат', submitted: 'Жіберілді',
    saving: 'Сақталуда…', roleUpdated: 'Қолжетімділік жаңартылды.', actionError: 'Әрекет орындалмады. Қайталап көріңіз.', selectFeedback: 'Толық оқу үшін пікірді таңдаңыз.',
  },
  en: {
    eyebrow: 'Operations console', title: 'Administration', description: 'Beta feedback and administrator access, without exposing private product content.',
    feedback: 'Feedback', admins: 'Administrators', loading: 'Loading administrative data…', error: 'Could not load admin data', retry: 'Try again',
    emptyFeedback: 'No feedback yet', emptyFeedbackHint: 'Messages submitted through the feedback form will appear here.',
    searchLabel: 'Find a user', searchPlaceholder: 'Name or username', searchAction: 'Search', noUsers: 'No matching users',
    makeAdmin: 'Make administrator', removeAdmin: 'Remove access', current: 'Current account', confirmRevoke: 'Remove administrator access from this user?',
    new: 'New', reviewed: 'Reviewed', resolved: 'Resolved', statusLabel: 'Status', rating: 'Rating', area: 'Area', category: 'Category', submitted: 'Submitted',
    saving: 'Saving…', roleUpdated: 'Access updated.', actionError: 'The action could not be completed. Try again.', selectFeedback: 'Select feedback to read the full message.',
  },
} as const;

type Section = 'feedback' | 'admins';

function displayName(value: { display_name: string | null; username: string | null; user_id?: string; submitter_id?: string }): string {
  return value.display_name || value.username || `Engineer ${(value.user_id || value.submitter_id || '').slice(0, 8)}`;
}

export function AdminTab({ lang, currentUserId }: { lang: Language; currentUserId: string }) {
  const t = copy[lang];
  const [section, setSection] = useState<Section>('feedback');
  const [feedback, setFeedback] = useState<AdminFeedback[]>([]);
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminUserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    setActionError(null);
    try {
      const [feedbackRows, adminRows] = await Promise.all([loadAdminFeedback(), loadAdmins()]);
      setFeedback(feedbackRows);
      setAdmins(adminRows);
      setSelectedFeedbackId((current) => current && feedbackRows.some((item) => item.id === current)
        ? current : feedbackRows[0]?.id ?? null);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedFeedback = feedback.find((item) => item.id === selectedFeedbackId) ?? null;

  const changeFeedbackStatus = async (item: AdminFeedback, nextStatus: AdminFeedbackStatus) => {
    setBusyId(item.id); setActionError(null); setNotice(null);
    try {
      const updated = await updateAdminFeedbackStatus(item.id, nextStatus);
      setFeedback((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch { setActionError(t.actionError); }
    finally { setBusyId(null); }
  };

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true); setActionError(null); setNotice(null);
    try { setResults(await searchAdminUsers(query.trim())); }
    catch { setActionError(t.actionError); }
    finally { setSearching(false); }
  };

  const promote = async (userId: string) => {
    setBusyId(userId); setActionError(null); setNotice(null);
    try {
      const admin = await grantAdmin(userId);
      setAdmins((current) => current.some((item) => item.user_id === admin.user_id) ? current : [...current, admin]);
      setResults((current) => current.map((item) => item.user_id === userId ? { ...item, is_admin: true } : item));
      setNotice(t.roleUpdated);
    } catch { setActionError(t.actionError); }
    finally { setBusyId(null); }
  };

  const revoke = async (userId: string) => {
    if (!window.confirm(t.confirmRevoke)) return;
    setBusyId(userId); setActionError(null); setNotice(null);
    try {
      await revokeAdmin(userId);
      setAdmins((current) => current.filter((item) => item.user_id !== userId));
      setResults((current) => current.map((item) => item.user_id === userId ? { ...item, is_admin: false } : item));
      setNotice(t.roleUpdated);
    } catch { setActionError(t.actionError); }
    finally { setBusyId(null); }
  };

  if (status === 'loading') return <LoadingState label={t.loading} />;
  if (status === 'error') return <ErrorState title={t.error} action={<Button variant="secondary" onClick={() => void load()}>{t.retry}</Button>} />;

  return (
    <section className="eq-admin" aria-labelledby="admin-title">
      <header className="eq-admin__header">
        <div><span className="eq-admin__eyebrow"><ShieldCheck aria-hidden="true" />{t.eyebrow}</span><h1 id="admin-title">{t.title}</h1><p>{t.description}</p></div>
      </header>

      <div className="eq-admin__tabs" role="tablist" aria-label={t.title}>
        <button id="admin-feedback-tab" type="button" role="tab" aria-controls="admin-feedback-panel" aria-selected={section === 'feedback'} onClick={() => setSection('feedback')}><MessageSquareText aria-hidden="true" />{t.feedback}</button>
        <button id="admin-roles-tab" type="button" role="tab" aria-controls="admin-roles-panel" aria-selected={section === 'admins'} onClick={() => setSection('admins')}><UserCog aria-hidden="true" />{t.admins}</button>
      </div>

      {actionError && <ErrorState title={actionError} />}
      {notice && <p className="eq-admin__notice" role="status"><CheckCircle2 aria-hidden="true" />{notice}</p>}

      {section === 'feedback' && (
        feedback.length === 0 ? <EmptyState title={t.emptyFeedback} description={t.emptyFeedbackHint} /> :
        <div id="admin-feedback-panel" role="tabpanel" aria-labelledby="admin-feedback-tab" className="eq-admin-feedback">
          <div className="eq-admin-feedback__list" role="list">
            {feedback.map((item) => <button key={item.id} type="button" role="listitem" className={item.id === selectedFeedbackId ? 'is-selected' : ''} onClick={() => setSelectedFeedbackId(item.id)}>
              <span className={`eq-admin-status eq-admin-status--${item.status}`}>{t[item.status]}</span>
              <strong>{displayName({ ...item, display_name: item.submitter_display_name, username: item.submitter_username })}</strong>
              <span>{item.message}</span><small>{new Date(item.created_at).toLocaleDateString(lang)}</small>
            </button>)}
          </div>
          <article className="eq-admin-feedback__detail" aria-live="polite">
            {!selectedFeedback && <p>{t.selectFeedback}</p>}
            {selectedFeedback && <>
              <div className="eq-admin-feedback__meta"><span><b>{t.rating}</b><Star aria-hidden="true" /> {selectedFeedback.rating}/5</span><span><b>{t.area}</b>{selectedFeedback.product_area}</span><span><b>{t.category}</b>{selectedFeedback.category}</span><span><b>{t.submitted}</b>{new Date(selectedFeedback.created_at).toLocaleString(lang)}</span></div>
              <p className="eq-admin-feedback__message">{selectedFeedback.message}</p>
              <label className="eq-admin-field"><span>{t.statusLabel}</span><select value={selectedFeedback.status} disabled={busyId === selectedFeedback.id} onChange={(event) => void changeFeedbackStatus(selectedFeedback, event.target.value as AdminFeedbackStatus)}><option value="new">{t.new}</option><option value="reviewed">{t.reviewed}</option><option value="resolved">{t.resolved}</option></select></label>
              {busyId === selectedFeedback.id && <small role="status">{t.saving}</small>}
            </>}
          </article>
        </div>
      )}

      {section === 'admins' && <div id="admin-roles-panel" role="tabpanel" aria-labelledby="admin-roles-tab" className="eq-admin-roles">
        <section aria-labelledby="admin-current-title"><h2 id="admin-current-title">{t.admins}</h2><div className="eq-admin-roles__list">{admins.map((admin) => <div key={admin.user_id} className="eq-admin-user"><span className="eq-admin-user__avatar">{displayName(admin).slice(0, 1).toUpperCase()}</span><span><strong>{displayName(admin)}</strong><small>{admin.username ? `@${admin.username}` : admin.user_id.slice(0, 8)}</small></span>{admin.user_id === currentUserId ? <em>{t.current}</em> : <Button variant="danger" disabled={busyId === admin.user_id} onClick={() => void revoke(admin.user_id)}>{t.removeAdmin}</Button>}</div>)}</div></section>
        <section aria-labelledby="admin-search-title"><h2 id="admin-search-title">{t.searchLabel}</h2><form className="eq-admin-search" onSubmit={search}><label><span className="sr-only">{t.searchLabel}</span><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={80} placeholder={t.searchPlaceholder} /></label><Button type="submit" disabled={searching || query.trim().length < 2}>{searching ? t.saving : t.searchAction}</Button></form>{results.length > 0 && <div className="eq-admin-roles__list">{results.map((user) => <div key={user.user_id} className="eq-admin-user"><span className="eq-admin-user__avatar">{displayName(user).slice(0, 1).toUpperCase()}</span><span><strong>{displayName(user)}</strong><small>{user.username ? `@${user.username}` : user.user_id.slice(0, 8)}</small></span>{user.is_admin ? <em>{t.admins}</em> : <Button variant="secondary" disabled={busyId === user.user_id} onClick={() => void promote(user.user_id)}>{t.makeAdmin}</Button>}</div>)}</div>}{!searching && query.trim().length >= 2 && results.length === 0 && <p className="eq-admin-roles__empty">{t.noUsers}</p>}</section>
      </div>}
    </section>
  );
}
