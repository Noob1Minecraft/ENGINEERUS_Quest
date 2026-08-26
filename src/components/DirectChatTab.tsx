import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, MessageCircle, Send } from 'lucide-react';
import type { Language } from '../types';
import { ApiError } from '../utils/api';
import {
  listDirectConversations, listDirectMessages, markDirectConversationRead, sendDirectMessage,
  type DirectConversation, type DirectMessage,
} from '../directChat/directChatApi';
import { directChatPollDelay } from '../directChat/pollingPolicy';

const TEXT = {
  ru: { title: 'Сообщения', empty: 'Пока нет личных диалогов.', choose: 'Выберите диалог.', placeholder: 'Написать сообщение…', send: 'Отправить', signIn: 'Войдите, чтобы открыть сообщения.' },
  kk: { title: 'Хабарламалар', empty: 'Әзірге жеке диалогтар жоқ.', choose: 'Диалогты таңдаңыз.', placeholder: 'Хабарлама жазыңыз…', send: 'Жіберу', signIn: 'Хабарламаларды ашу үшін кіріңіз.' },
  en: { title: 'Messages', empty: 'No direct conversations yet.', choose: 'Choose a conversation.', placeholder: 'Write a message…', send: 'Send', signIn: 'Sign in to open messages.' },
} satisfies Record<Language, Record<string, string>>;

function name(conversation: DirectConversation) {
  return conversation.other_user?.display_name || conversation.other_user?.username || 'Engineer';
}
function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : 'Messaging is temporarily unavailable.';
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
    refreshConversations().catch((requestError) => { if (active) setError(errorText(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authenticated, refreshConversations]);

  useEffect(() => {
    if (!selectedId || !authenticated) { setMessages([]); return; }
    setMessages([]); void refreshMessages(selectedId, true).catch((requestError) => setError(errorText(requestError)));
  }, [authenticated, selectedId, refreshMessages]);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    let timer: number | undefined;
    let failures = 0;
    let inFlight = false;
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
      } catch {
        failures += 1;
      } finally {
        inFlight = false;
        schedule();
      }
    };
    const pollNow = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer !== undefined) window.clearTimeout(timer);
      void poll();
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') pollNow(); };
    schedule();
    window.addEventListener('focus', pollNow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('focus', pollNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [authenticated, refreshConversations, refreshMessages]);

  const selected = useMemo(() => conversations.find(({ id }) => id === selectedId) ?? null, [conversations, selectedId]);
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

  if (!authenticated) return <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center"><p className="text-sm text-slate-600">{copy.signIn}</p><button onClick={onRequireAuth} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white">Sign in</button></section>;
  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
    <header className="border-b border-slate-200 p-4"><h1 className="flex items-center gap-2 text-lg font-black"><MessageCircle className="h-5 w-5 text-blue-600" />{copy.title}</h1></header>
    {error && <div role="alert" className="m-3 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
    <div className="grid min-h-[32rem] md:grid-cols-[18rem_1fr]">
      <aside className="border-b border-slate-200 md:border-b-0 md:border-r">
        {loading ? <LoaderCircle className="m-6 h-5 w-5 animate-spin text-blue-600" /> : conversations.length === 0 ? <p className="p-5 text-xs text-slate-500">{copy.empty}</p> : conversations.map((conversation) => <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`w-full border-b border-slate-100 p-4 text-left ${selectedId === conversation.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
          <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{name(conversation)}</span>{conversation.unread_count > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">{conversation.unread_count}</span>}</div>
          <p className="mt-1 truncate text-xs text-slate-500">{conversation.last_message?.content || '—'}</p>
        </button>)}
      </aside>
      <div className="flex min-w-0 flex-col">
        {!selected ? <div className="grid flex-1 place-items-center p-6 text-sm text-slate-500">{copy.choose}</div> : <>
          <div className="border-b border-slate-200 p-4 text-sm font-black">{name(selected)}</div>
          <div className="flex-1 space-y-2 overflow-y-auto p-4" aria-label="Direct messages">{messages.map((message) => <div key={message.id} className={`flex ${message.sender_id === currentUserId ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${message.sender_id === currentUserId ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}><p className="whitespace-pre-wrap break-words">{message.content}</p><time className="mt-1 block text-[9px] opacity-70">{new Date(message.created_at).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</time></div></div>)}</div>
          <form onSubmit={submit} className="flex gap-2 border-t border-slate-200 p-3"><input aria-label={copy.placeholder} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder={copy.placeholder} /><button disabled={sending || !draft.trim()} className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{copy.send}</button></form>
        </>}
      </div>
    </div>
  </section>;
}
