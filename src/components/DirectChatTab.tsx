import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, Plus, Send, UsersRound, X } from 'lucide-react';
import type { Language, ProjectApplication, ProjectInvitation } from '../types';
import { ApiError } from '../utils/api';
import {
  createDirectConversation,
  listDirectConversations,
  listDirectMessages,
  markDirectConversationRead,
  sendDirectMessage,
  type DirectConversation,
  type DirectMessage,
} from '../directChat/directChatApi';
import { directChatPollDelay } from '../directChat/pollingPolicy';
import { listMyProjectApplications, listMyProjectInvitations } from '../projects/projectApi';
import { Button, EmptyState, LoadingState } from './ui';

const TEXT = {
  ru: {
    title: 'Сообщения', subtitle: 'Рабочие диалоги с участниками совместных проектов.', empty: 'Личных диалогов пока нет.',
    emptyHint: 'Начать разговор можно с участником, доступным по принятой заявке или приглашению.', choose: 'Выберите диалог, чтобы продолжить обсуждение.',
    placeholder: 'Написать участнику…', send: 'Отправить', signIn: 'Войдите, чтобы открыть сообщения.', start: 'Начать разговор',
    startTitle: 'Новый разговор', startHint: 'Показаны только участники, доступные по действующим проектным связям.',
    noEligible: 'Сейчас нет участников, с которыми можно начать новый разговор.', close: 'Закрыть', back: 'К диалогам',
    owner: 'Владелец проекта', collaborator: 'Участник проекта', loading: 'Загружаем диалоги…', starting: 'Открываем разговор…', unread: 'непрочитанных',
  },
  kk: {
    title: 'Хабарламалар', subtitle: 'Ортақ жобалар қатысушыларымен жұмыс диалогтары.', empty: 'Жеке диалогтар әзірге жоқ.',
    emptyHint: 'Қабылданған өтінім немесе шақыру арқылы қолжетімді қатысушымен сөйлесуге болады.', choose: 'Талқылауды жалғастыру үшін диалогты таңдаңыз.',
    placeholder: 'Қатысушыға жазыңыз…', send: 'Жіберу', signIn: 'Хабарламаларды ашу үшін кіріңіз.', start: 'Сөйлесуді бастау',
    startTitle: 'Жаңа сөйлесу', startHint: 'Тек қолданыстағы жоба байланысы бойынша қолжетімді қатысушылар көрсетіледі.',
    noEligible: 'Қазір жаңа сөйлесуді бастауға болатын қатысушылар жоқ.', close: 'Жабу', back: 'Диалогтарға',
    owner: 'Жоба иесі', collaborator: 'Жоба қатысушысы', loading: 'Диалогтар жүктелуде…', starting: 'Сөйлесу ашылуда…', unread: 'оқылмаған',
  },
  en: {
    title: 'Messages', subtitle: 'Working conversations with people from shared projects.', empty: 'No direct conversations yet.',
    emptyHint: 'You can start with someone made eligible by an accepted application or invitation.', choose: 'Choose a conversation to continue the discussion.',
    placeholder: 'Message a collaborator…', send: 'Send', signIn: 'Sign in to open messages.', start: 'Start conversation',
    startTitle: 'New conversation', startHint: 'Only people eligible through an existing project relationship are shown.',
    noEligible: 'There are no eligible collaborators for a new conversation right now.', close: 'Close', back: 'Back to conversations',
    owner: 'Project owner', collaborator: 'Project collaborator', loading: 'Loading conversations…', starting: 'Opening conversation…', unread: 'unread',
  },
} satisfies Record<Language, Record<string, string>>;

type ConversationCandidate = { key: string; profileId: string; projectId: string; name: string; project: string; context: string };

function name(conversation: DirectConversation) {
  return conversation.other_user?.display_name || conversation.other_user?.username || 'Engineer';
}

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : 'Messaging is temporarily unavailable.';
}

function acceptedCandidates(applications: ProjectApplication[], invitations: ProjectInvitation[], lang: Language): ConversationCandidate[] {
  const copy = TEXT[lang];
  const rows: ConversationCandidate[] = [];
  for (const application of applications) {
    const project = application.role?.project;
    if (application.status !== 'accepted' || !project) continue;
    rows.push({ key: `application-${application.id}`, profileId: project.owner_id, projectId: application.project_id, name: copy.owner, project: project.title, context: application.role?.title ?? copy.collaborator });
  }
  for (const invitation of invitations) {
    const project = invitation.role?.project;
    if (invitation.status !== 'accepted' || !project || !invitation.inviter) continue;
    rows.push({ key: `invitation-${invitation.id}`, profileId: invitation.inviter.id, projectId: invitation.project_id, name: invitation.inviter.display_name || invitation.inviter.username || copy.collaborator, project: project.title, context: invitation.role?.title ?? copy.collaborator });
  }
  return [...new Map(rows.map((row) => [`${row.profileId}:${row.projectId}`, row])).values()];
}

export function DirectChatTab({ authenticated, currentUserId, lang, initialConversationId, onRequireAuth }: {
  authenticated: boolean; currentUserId: string | null; lang: Language; initialConversationId?: string | null; onRequireAuth: () => void;
}) {
  const copy = TEXT[lang];
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [candidates, setCandidates] = useState<ConversationCandidate[]>([]);
  const startTriggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;

  const refreshConversations = useCallback(async () => {
    const result = await listDirectConversations();
    setConversations(result.conversations);
    setSelectedId((current) => current ?? initialConversationId ?? result.conversations[0]?.id ?? null);
    return result.conversations;
  }, [initialConversationId]);

  const refreshMessages = useCallback(async (conversationId: string, markRead: boolean) => {
    const result = await listDirectMessages(conversationId);
    setMessages((current) => {
      const merged = new Map([...current, ...result.messages].map((message) => [message.id, message]));
      return [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    });
    if (markRead) await markDirectConversationRead(conversationId);
  }, []);

  useEffect(() => {
    if (!authenticated) { setConversations([]); setMessages([]); return; }
    let active = true; setLoading(true); setError('');
    refreshConversations().catch((requestError) => { if (active) setError(errorText(requestError)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authenticated, refreshConversations]);

  useEffect(() => {
    if (!selectedId || !authenticated) { setMessages([]); return; }
    setMessages([]); void refreshMessages(selectedId, true).catch((requestError) => setError(errorText(requestError)));
  }, [authenticated, selectedId, refreshMessages]);

  useEffect(() => {
    if (!authenticated) return;
    let active = true; let timer: number | undefined; let failures = 0; let inFlight = false;
    const schedule = () => {
      if (!active || document.visibilityState !== 'visible') return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => { void poll(); }, directChatPollDelay(failures));
    };
    const poll = async () => {
      if (!active || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const latestConversations = await refreshConversations();
        const conversationId = selectedRef.current;
        if (conversationId) {
          const hasUnread = (latestConversations.find(({ id }) => id === conversationId)?.unread_count ?? 0) > 0;
          await refreshMessages(conversationId, hasUnread);
        }
        failures = 0;
      } catch { failures += 1; }
      finally { inFlight = false; schedule(); }
    };
    const pollNow = () => { if (document.visibilityState !== 'visible') return; if (timer !== undefined) window.clearTimeout(timer); void poll(); };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') pollNow(); };
    schedule(); window.addEventListener('focus', pollNow); document.addEventListener('visibilitychange', onVisibilityChange);
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); window.removeEventListener('focus', pollNow); document.removeEventListener('visibilitychange', onVisibilityChange); };
  }, [authenticated, refreshConversations, refreshMessages]);

  useEffect(() => {
    if (!startOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setStartOpen(false); };
    document.addEventListener('keydown', onKeyDown); closeRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKeyDown); startTriggerRef.current?.focus(); };
  }, [startOpen]);

  const selected = useMemo(() => conversations.find(({ id }) => id === selectedId) ?? null, [conversations, selectedId]);

  async function openStartConversation(): Promise<void> {
    setStartOpen(true); setStartLoading(true); setError('');
    try {
      const [applications, invitations] = await Promise.all([listMyProjectApplications(), listMyProjectInvitations()]);
      setCandidates(acceptedCandidates(applications, invitations, lang));
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setStartLoading(false); }
  }

  async function startConversation(candidate: ConversationCandidate): Promise<void> {
    setStartLoading(true); setError('');
    try {
      const { conversation_id } = await createDirectConversation(candidate.profileId, candidate.projectId);
      await refreshConversations(); setSelectedId(conversation_id); setStartOpen(false);
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setStartLoading(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); const content = draft.trim(); if (!selectedId || !content || sending) return;
    setSending(true); setError('');
    try {
      const { message } = await sendDirectMessage(selectedId, content);
      setMessages((current) => current.some(({ id }) => id === message.id) ? current : [...current, message]);
      setDraft(''); await refreshConversations();
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setSending(false); }
  }

  if (!authenticated) return <section className="eq-collab-guest"><MessageCircle aria-hidden="true" /><p>{copy.signIn}</p><Button onClick={onRequireAuth}>Sign in</Button></section>;

  return <section className="eq-direct-chat" aria-labelledby="direct-chat-title">
    <header className="eq-direct-chat__header"><div><h1 id="direct-chat-title"><MessageCircle aria-hidden="true" />{copy.title}</h1><p>{copy.subtitle}</p></div><button ref={startTriggerRef} type="button" className="eq-button eq-button--secondary" onClick={() => void openStartConversation()}><Plus aria-hidden="true" />{copy.start}</button></header>
    {error && <div role="alert" className="eq-inline-alert eq-inline-alert--error">{error}</div>}
    <div className="eq-direct-chat__layout">
      <aside className={selected ? 'eq-direct-chat__list eq-direct-chat__list--mobile-hidden' : 'eq-direct-chat__list'} aria-label={copy.title}>
        {loading ? <LoadingState label={copy.loading} /> : conversations.length === 0 ? <EmptyState title={copy.empty} description={copy.emptyHint} action={<Button variant="secondary" onClick={() => void openStartConversation()}>{copy.start}</Button>} /> : conversations.map((conversation) => <button type="button" key={conversation.id} onClick={() => setSelectedId(conversation.id)} aria-pressed={selectedId === conversation.id} className="eq-conversation-row">
          <span className="eq-conversation-row__avatar" aria-hidden="true">{name(conversation).slice(0, 1).toLocaleUpperCase(lang)}</span>
          <span className="eq-conversation-row__body"><strong>{name(conversation)}</strong><span>{conversation.last_message?.content || copy.choose}</span></span>
          <span className="eq-conversation-row__meta">{conversation.last_message && <time dateTime={conversation.last_message.created_at}>{new Date(conversation.last_message.created_at).toLocaleDateString(lang, { day: '2-digit', month: 'short' })}</time>}{conversation.unread_count > 0 && <span className="eq-unread" aria-label={`${conversation.unread_count} ${copy.unread}`}>{conversation.unread_count}</span>}</span>
        </button>)}
      </aside>
      <div className={selected ? 'eq-direct-chat__conversation' : 'eq-direct-chat__conversation eq-direct-chat__conversation--mobile-hidden'}>
        {!selected ? <EmptyState title={copy.choose} description={copy.emptyHint} /> : <>
          <div className="eq-direct-chat__person"><button type="button" className="eq-chat-back" onClick={() => setSelectedId(null)} aria-label={copy.back}><ArrowLeft aria-hidden="true" /></button><span className="eq-conversation-row__avatar" aria-hidden="true">{name(selected).slice(0, 1).toLocaleUpperCase(lang)}</span><div><strong>{name(selected)}</strong><span>{copy.collaborator}</span></div></div>
          <div className="eq-direct-chat__messages" aria-label="Direct messages">{messages.length === 0 ? <EmptyState title={copy.choose} /> : messages.map((message) => <div key={message.id} className={message.sender_id === currentUserId ? 'eq-human-message eq-human-message--mine' : 'eq-human-message'}><div><p>{message.content}</p><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</time></div></div>)}</div>
          <form onSubmit={submit} className="eq-direct-chat__composer"><label className="sr-only" htmlFor="direct-message-input">{copy.placeholder}</label><input id="direct-message-input" maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={copy.placeholder} /><Button type="submit" disabled={sending || !draft.trim()} aria-label={copy.send}><Send aria-hidden="true" /><span>{copy.send}</span></Button></form>
        </>}
      </div>
    </div>
    {startOpen && <div className="eq-dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setStartOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="start-conversation-title" className="eq-start-conversation"><header><div><h2 id="start-conversation-title">{copy.startTitle}</h2><p>{copy.startHint}</p></div><button ref={closeRef} type="button" onClick={() => setStartOpen(false)} aria-label={copy.close}><X aria-hidden="true" /></button></header>{startLoading ? <LoadingState label={copy.starting} /> : candidates.length === 0 ? <EmptyState title={copy.noEligible} description={copy.startHint} /> : <div className="eq-start-conversation__list">{candidates.map((candidate) => <button type="button" key={candidate.key} onClick={() => void startConversation(candidate)}><UsersRound aria-hidden="true" /><span><strong>{candidate.name}</strong><span>{candidate.project} · {candidate.context}</span></span></button>)}</div>}</section></div>}
  </section>;
}
