import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { UserProfile, Language, SavedNote, ChatMessage, ChatSession } from '../types';
import { TRANSLATIONS } from '../data';
import { verifySystemIntegrity } from '../utils/integrity';
import { apiFetch } from '../utils/api';
import { loadSavedAiNotes, storeSavedAiNotes } from '../utils/savedAiNotes';
import { activeChatStorageKey, buildConversationTitle, clearChatDraft, isUntitledConversation, loadChatDraft, storeChatDraft } from '../ai/chatWorkspace';
import { AiAttachmentPicker } from './AiAttachmentPicker';
import { Button } from './ui';
import {
  DraftingCompass,
  GraduationCap,
  Send,
  Layers,
  Cpu,
  ShieldCheck,
  Users,
  HelpCircle,
  CheckCircle2,
  Bookmark,
  BookmarkCheck,
  Copy,
  Check,
  Trash2,
  Download,
  Search,
  MessageSquare,
  Bot,
  User,
  ArrowRight,
  Filter,
  Plus,
  Maximize2,
  Minimize2,
  Edit2,
  MoreHorizontal,
  X,
  History,
  FolderKanban
} from 'lucide-react';

interface AIAssistantTabProps {
  user: UserProfile;
  authenticatedUserId: string | null;
  lang: Language;
  onUpdateUser: (updated: Partial<UserProfile>) => void;
  onCompleteQuest?: (questId: string) => Promise<void>;
  initialModule?: string;
  documentContext?: { id: string; name: string } | null;
  onClearDocumentContext?: () => void;
  onSelectDocumentContext?: (document: { id: string; name: string } | null) => void;
  imageContext?: Array<{ id: string; name: string }>;
  onClearImageContext?: () => void;
  onSelectImageContext?: (images: Array<{ id: string; name: string }>) => void;
}

const PRESET_QUESTIONS: Record<string, Record<Language, string[]>> = {
  tutor: {
    ru: [
      "Как рассчитать эпюру изгибающих моментов для двухопорной балки?",
      "Объясни теорему Карно и цикл Стирлинга простыми словами",
      "В чем разница между кинематикой и динамикой механизмов?",
    ],
    kk: [
      "Екі тіректі арқалықтың иілу моменттері эпюрасын қалай есептейді?",
      "Карно теоремасы мен Стирлинг циклін қарапайым сөзбен түсіндір",
      "Механизмдер кинематикасы мен динамикасының айырмашылығы неде?",
    ],
    en: [
      "How to calculate bending moment diagrams for a simply supported beam?",
      "Explain Carnot's theorem and the Stirling cycle in simple terms",
      "What is the difference between kinematics and dynamics of mechanisms?",
    ],
  },
  material: {
    ru: [
      "Сравни конструкционную сталь 09Г2С и Сталь 45 для северного Казахстана",
      "Подбери легкий и прочный алюминиевый сплав для корпуса БПЛА",
      "Какие композиты применяются в ветроэнергетике в Акмолинской области?",
    ],
    kk: [
      "Солтүстік Қазақстан үшін 09Г2С және Болат 45 конструкциялық болаттарын салыстыр",
      "ҰҰА корпусы үшін жеңіл әрі берік алюминий қорытпасын таңда",
      "Ақмола облысындағы жел энергетикасында қандай композиттер қолданылады?",
    ],
    en: [
      "Compare 09G2S and Steel 45 structural steels for Northern Kazakhstan",
      "Select a lightweight and strong aluminum alloy for a UAV frame",
      "Which composites are used in wind energy projects in Akmola region?",
    ],
  },
  patent: {
    ru: [
      "Составь формулу изобретения для устройства мониторинга мостов",
      "Как проверить патентную чистоту инженерной разработки в Казпатент?",
      "Подготовь описание полезной модели для системы очистки воды",
    ],
    kk: [
      "Көпірлерді мониторингтеу құрылғысы үшін өнертабыс формуласын жаса",
      "Қазпатентте инженерлік әзірлеменің патенттік тазалығын қалай тексереді?",
      "Су тазарту жүйесі үшін пайдалы модель сипаттамасын дайында",
    ],
    en: [
      "Draft a patent claim for a bridge structural monitoring device",
      "How to verify patent clearance of an engineering design at Kazpatent?",
      "Prepare a utility model description for a water filtration system",
    ],
  },
  engi_legal: {
    ru: [
      "Какие нормы СНиП РК регламентируют сейсмостойкость зданий в Алматы?",
      "Проверь типовой договор подрядных инженерных работ на риски",
      "Какие сертификаты ТР ТС необходимы для ввоза промышленного насоса?",
    ],
    kk: [
      "Алматыдағы ғимараттардың сейсмотөзімділігін ҚР ҚНжЕ-нің қандай нормалары реттейді?",
      "Мердігерлік инженерлік жұмыстар шартын тәуекелдерге тексер",
      "Өнеркәсіптік сорғыны импорттау үшін ҚР КО ТР қандай сертификаттары қажет?",
    ],
    en: [
      "Which SNiP KZ standards regulate earthquake resistance of buildings in Almaty?",
      "Review a standard engineering contract for compliance and legal risks",
      "Which CU TR certificates are required to import an industrial pump?",
    ],
  },
  engi_match: {
    ru: [
      "Какие ключевые роли нужны для стартапа в области агро-робототехники?",
      "Как правильно распределить доли (Equity) между 3 инженерами-сооснователями?",
      "Где найти специалиста по Embedded C/C++ и ROS2 в Алматы?",
    ],
    kk: [
      "Агро-робототехника саласындағы стартап үшін қандай негізгі рөлдер қажет?",
      "3 инженер-негізін қалаушы арасында үлесті (Equity) қалай дұрыс бөледі?",
      "Алматыда Embedded C/C++ және ROS2 маманын қайдан табуға болады?",
    ],
    en: [
      "What key roles are needed for an agritech robotics startup?",
      "How to split founder equity fairly between 3 co-founding engineers?",
      "Where to recruit Embedded C/C++ and ROS2 specialists in Almaty?",
    ],
  },
};

const MODULE_CONFIG: Record<string, { label: string; icon: React.FC<{ className?: string }>; color: string; badgeBg: string }> = {
  tutor: { label: 'TUTOR AI', icon: GraduationCap, color: 'text-blue-600', badgeBg: 'bg-blue-600' },
  material: { label: 'MaterialSwap', icon: Layers, color: 'text-emerald-600', badgeBg: 'bg-emerald-600' },
  patent: { label: 'PatentCraft', icon: Cpu, color: 'text-purple-600', badgeBg: 'bg-purple-600' },
  engi_legal: { label: 'EngiLegal', icon: ShieldCheck, color: 'text-amber-600', badgeBg: 'bg-amber-600' },
  engi_match: { label: 'EngiMatch', icon: Users, color: 'text-indigo-600', badgeBg: 'bg-indigo-600' },
};

type PageResponse<T> = { items: T[]; next_cursor: string | null };

function mergeMessages(...groups: ChatMessage[][]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  groups.flat().forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id));
}

export const AIAssistantTab: React.FC<AIAssistantTabProps> = ({
  user,
  authenticatedUserId,
  lang,
  onUpdateUser,
  onCompleteQuest,
  initialModule,
  documentContext,
  onClearDocumentContext,
  onSelectDocumentContext,
  imageContext = [],
  onClearImageContext,
  onSelectImageContext,
}) => {
  const t = TRANSLATIONS[lang];
  const [activeSubView, setActiveSubView] = useState<'chat' | 'saved'>('chat');
  const [selectedModule, setSelectedModule] = useState<string>(initialModule || 'tutor');

  useEffect(() => {
    if (initialModule) {
      setSelectedModule(initialModule);
    }
  }, [initialModule]);
  const [promptText, setPromptText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showSessionsDrawer, setShowSessionsDrawer] = useState<boolean>(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);

  // User Multi-Chat Sessions
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [sessionCursor, setSessionCursor] = useState<string | null>(null);
  const [messageCursors, setMessageCursors] = useState<Record<string, string | null>>({});
  const [loadingOlderSessions, setLoadingOlderSessions] = useState(false);
  const [loadingMessageSessions, setLoadingMessageSessions] = useState<Set<string>>(new Set());
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [newTitleInput, setNewTitleInput] = useState<string>('');
  const [sessionMutationPending, setSessionMutationPending] = useState(false);
  const loadedMessageSessionsRef = useRef<Set<string>>(new Set());
  const sessionPageInFlightRef = useRef(false);
  const messagePagesInFlightRef = useRef<Set<string>>(new Set());
  const sessionMenuTriggersRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const dialogReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const newChatButtonRef = useRef<HTMLButtonElement | null>(null);

  // Saved Notes Library
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>(() =>
    loadSavedAiNotes(localStorage, authenticatedUserId));

  // UI Toast & Search States
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [savedFilterModule, setSavedFilterModule] = useState<string>('all');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const promptHydrationRef = useRef<string>('');
  const skipDraftPersistRef = useRef(false);

  useEffect(() => {
    // Assert system integrity across modules
    verifySystemIntegrity(t.attributionCaption);
  }, [lang, t]);

  useEffect(() => {
    setSavedNotes(loadSavedAiNotes(localStorage, authenticatedUserId));
  }, [authenticatedUserId]);

  // Load chats for user from server
  useEffect(() => {
    loadedMessageSessionsRef.current = new Set();
    messagePagesInFlightRef.current = new Set();
    sessionPageInFlightRef.current = false;
    setMessageCursors({});
    setSessionCursor(null);
    setLoadingMessageSessions(new Set());

    if (!authenticatedUserId) {
      setSessions([]);
      setActiveSessionId('');
      setPersistenceError(null);
      return;
    }

    let active = true;
    const loadPersistentChats = async () => {
      try {
        setPersistenceError(null);
        const data = await apiFetch<PageResponse<Omit<ChatSession, 'messages'>>>('/api/chats?limit=20');
        let persistentSessions = data.items;
        let nextCursor = data.next_cursor;
        if (persistentSessions.length === 0) {
          const created = await apiFetch<{ session: Omit<ChatSession, 'messages'> }>('/api/chats', {
            method: 'POST',
            body: JSON.stringify({
              module: 'tutor',
              title: 'New conversation',
            }),
          });
          persistentSessions = [created.session];
          nextCursor = null;
          loadedMessageSessionsRef.current.add(created.session.id);
        }

        if (active) {
          setSessions(persistentSessions.map((session) => ({ ...session, messages: [] })));
          setSessionCursor(nextCursor);
          const restoredId = sessionStorage.getItem(activeChatStorageKey(authenticatedUserId));
          const selectedId = persistentSessions.some((session) => session.id === restoredId)
            ? restoredId!
            : persistentSessions[0]?.id || '';
          setActiveSessionId(selectedId);
          setSelectedModule(persistentSessions.find((session) => session.id === selectedId)?.module ?? 'tutor');
        }
      } catch {
        if (active) {
          setSessions([]);
          setActiveSessionId('');
          setPersistenceError(lang === 'kk'
            ? 'Чаттарды тұрақты сақтау орнына қосылу мүмкін болмады.'
            : lang === 'en'
              ? 'Persistent chat storage is unavailable.'
              : 'Постоянное хранилище чатов временно недоступно.');
        }
      }
    };

    void loadPersistentChats();
    return () => { active = false; };
  }, [authenticatedUserId]);

  useEffect(() => {
    if (!authenticatedUserId || !activeSessionId) return;
    sessionStorage.setItem(activeChatStorageKey(authenticatedUserId), activeSessionId);
    const key = `${authenticatedUserId}:${activeSessionId}`;
    promptHydrationRef.current = key;
    skipDraftPersistRef.current = true;
    setPromptText(loadChatDraft(authenticatedUserId, activeSessionId));
  }, [activeSessionId, authenticatedUserId]);

  useEffect(() => {
    if (!authenticatedUserId || !activeSessionId) return;
    const key = `${authenticatedUserId}:${activeSessionId}`;
    if (promptHydrationRef.current !== key) return;
    if (skipDraftPersistRef.current) {
      skipDraftPersistRef.current = false;
      return;
    }
    storeChatDraft(authenticatedUserId, activeSessionId, promptText);
  }, [activeSessionId, authenticatedUserId, promptText]);

  useEffect(() => {
    if (!sessionMenuId && !renameTarget && !deleteTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (renameTarget) {
        setRenameTarget(null);
        queueMicrotask(() => dialogReturnFocusRef.current?.focus());
      } else if (deleteTarget) {
        setDeleteTarget(null);
        queueMicrotask(() => dialogReturnFocusRef.current?.focus());
      }
      else if (sessionMenuId) {
        const trigger = sessionMenuTriggersRef.current.get(sessionMenuId);
        setSessionMenuId(null);
        queueMicrotask(() => trigger?.focus());
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [deleteTarget, renameTarget, sessionMenuId]);

  // Hydrate only the selected chat. Other sessions remain lightweight until opened.
  useEffect(() => {
    if (!authenticatedUserId || !activeSessionId
      || loadedMessageSessionsRef.current.has(activeSessionId)
      || messagePagesInFlightRef.current.has(activeSessionId)) return;

    let active = true;
    loadedMessageSessionsRef.current.add(activeSessionId);
    messagePagesInFlightRef.current.add(activeSessionId);
    setLoadingMessageSessions((current) => new Set(current).add(activeSessionId));

    void apiFetch<PageResponse<ChatMessage>>(
      `/api/chats/${encodeURIComponent(activeSessionId)}/messages?limit=50`,
    ).then((result) => {
      if (!active) return;
      setSessions((current) => current.map((session) => session.id === activeSessionId
        ? { ...session, messages: result.items }
        : session));
      setMessageCursors((current) => ({ ...current, [activeSessionId]: result.next_cursor }));
    }).catch(() => {
      loadedMessageSessionsRef.current.delete(activeSessionId);
      if (active) {
        setPersistenceError(lang === 'kk'
          ? 'Чат хабарларын жүктеу мүмкін болмады.'
          : lang === 'en'
            ? 'Chat messages could not be loaded.'
            : 'Не удалось загрузить сообщения чата.');
      }
    }).finally(() => {
      messagePagesInFlightRef.current.delete(activeSessionId);
      setLoadingMessageSessions((current) => {
        const next = new Set(current);
        next.delete(activeSessionId);
        return next;
      });
    });

    return () => { active = false; };
  }, [activeSessionId, authenticatedUserId, lang]);

  // Active Chat Session
  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const messages = activeSession ? activeSession.messages : [];

  const selectSession = (session: ChatSession) => {
    setActiveSessionId(session.id);
    setSelectedModule(session.module);
    setShowSessionsDrawer(false);
  };

  const translateMsgText = (text: string, id: string) => {
    if (id === 'welcome-msg') {
      return lang === 'kk'
        ? 'Сәлеметсіз бе! Мен сіздің **Engineerus** инженерлік ЖИ-репетиторыңызбын. Сопромат, ҚР МЕМСТ, материалдар немесе патенттер бойынша сұрақ қойыңыз.'
        : lang === 'en'
        ? 'Hello! I am your engineering AI tutor **Engineerus**. Ask a question about structural mechanics, GOST KZ, materials, or patents.'
        : 'Здравствуйте! Я ваш инженерный ИИ-тьютор **Engineerus**. Задайте вопрос по сопромату, ГОСТ РК, материалам или патентам.';
    }
    if (text === 'Создан новый диалог! Чем я могу помочь?') {
      return lang === 'kk'
        ? 'Жаңа диалог құрылды! Қалай көмектесе аламын?'
        : lang === 'en'
        ? 'New conversation created! How can I help you?'
        : 'Создан новый диалог! Чем я могу помочь?';
    }
    return text;
  };

  const translateSessionTitle = (title: string) => {
    if (title === 'New conversation') {
      return lang === 'kk' ? 'Жаңа чат' : lang === 'en' ? 'New chat' : 'Новый чат';
    }
    if (title === 'Инженерный консилиум (Главный)') {
      return lang === 'kk'
        ? 'Инженерлік консилиум (Басты)'
        : lang === 'en'
        ? 'Engineering Consultation (Main)'
        : 'Инженерный консилиум (Главный)';
    }
    if (title.startsWith('Чат #')) {
      return lang === 'kk'
        ? title.replace('Чат #', 'Чат #')
        : lang === 'en'
        ? title.replace('Чат #', 'Chat #')
        : title;
    }
    if (title.startsWith('Квест ')) {
      return lang === 'kk'
        ? title.replace('Квест ', 'Квест ')
        : lang === 'en'
        ? title.replace('Квест ', 'Quest ')
        : title;
    }
    return title;
  };

  // Auto scroll bottom when new message arrives
  useEffect(() => {
    if (activeSubView === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, activeSubView]);

  const loadOlderSessions = async () => {
    if (!sessionCursor || sessionPageInFlightRef.current) return;
    sessionPageInFlightRef.current = true;
    setLoadingOlderSessions(true);
    try {
      const result = await apiFetch<PageResponse<Omit<ChatSession, 'messages'>>>(
        `/api/chats?limit=20&cursor=${encodeURIComponent(sessionCursor)}`,
      );
      setSessions((current) => {
        const byId = new Map(current.map((session) => [session.id, session]));
        result.items.forEach((session) => {
          if (!byId.has(session.id)) byId.set(session.id, { ...session, messages: [] });
        });
        return [...byId.values()];
      });
      setSessionCursor(result.next_cursor);
    } catch {
      setPersistenceError(lang === 'kk'
        ? 'Ескі чаттарды жүктеу мүмкін болмады.'
        : lang === 'en'
          ? 'Older chats could not be loaded.'
          : 'Не удалось загрузить старые чаты.');
    } finally {
      sessionPageInFlightRef.current = false;
      setLoadingOlderSessions(false);
    }
  };

  const loadOlderMessages = async () => {
    const cursor = activeSessionId ? messageCursors[activeSessionId] : null;
    if (!activeSessionId || !cursor || messagePagesInFlightRef.current.has(activeSessionId)) return;
    const sessionId = activeSessionId;
    messagePagesInFlightRef.current.add(sessionId);
    setLoadingMessageSessions((current) => new Set(current).add(sessionId));
    try {
      const result = await apiFetch<PageResponse<ChatMessage>>(
        `/api/chats/${encodeURIComponent(sessionId)}/messages?limit=50&cursor=${encodeURIComponent(cursor)}`,
      );
      setSessions((current) => current.map((session) => session.id === sessionId
        ? { ...session, messages: mergeMessages(result.items, session.messages) }
        : session));
      setMessageCursors((current) => ({ ...current, [sessionId]: result.next_cursor }));
    } catch {
      setPersistenceError(lang === 'kk'
        ? 'Ескі хабарларды жүктеу мүмкін болмады.'
        : lang === 'en'
          ? 'Older messages could not be loaded.'
          : 'Не удалось загрузить старые сообщения.');
    } finally {
      messagePagesInFlightRef.current.delete(sessionId);
      setLoadingMessageSessions((current) => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
    }
  };

  const handleCreateNewChat = async () => {
    try {
      setPersistenceError(null);
      const data = await apiFetch<{ session: Omit<ChatSession, 'messages'> }>('/api/chats', {
        method: 'POST',
        body: JSON.stringify({
          module: selectedModule,
          title: 'New conversation',
        }),
      });
      const newSession: ChatSession = { ...data.session, messages: [] };
      loadedMessageSessionsRef.current.add(newSession.id);
      setMessageCursors((current) => ({ ...current, [newSession.id]: null }));
      setSessions((current) => [newSession, ...current]);
      setActiveSessionId(newSession.id);
      setShowSessionsDrawer(false);
    } catch {
      setPersistenceError(lang === 'kk' ? 'Чат жасалмады.' : lang === 'en' ? 'Chat could not be created.' : 'Не удалось создать чат.');
    }
  };

  const handleDeleteChat = async (sessionId: string) => {
    if (sessionMutationPending) return;
    setSessionMutationPending(true);
    try {
      await apiFetch<void>(`/api/chats/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      const remaining = sessions.filter((session) => session.id !== sessionId);
      const next = activeSessionId === sessionId ? remaining[0] : undefined;
      setSessions(remaining);
      loadedMessageSessionsRef.current.delete(sessionId);
      setMessageCursors((current) => {
        const nextCursors = { ...current };
        delete nextCursors[sessionId];
        return nextCursors;
      });
      if (authenticatedUserId) {
        clearChatDraft(authenticatedUserId, sessionId);
        if (sessionStorage.getItem(activeChatStorageKey(authenticatedUserId)) === sessionId) {
          if (next) sessionStorage.setItem(activeChatStorageKey(authenticatedUserId), next.id);
          else sessionStorage.removeItem(activeChatStorageKey(authenticatedUserId));
        }
      }
      if (activeSessionId === sessionId) {
        setActiveSessionId(next?.id ?? '');
        setSelectedModule(next?.module ?? 'tutor');
      }
      setDeleteTarget(null);
      queueMicrotask(() => (next ? sessionMenuTriggersRef.current.get(next.id) : newChatButtonRef.current)?.focus());
    } catch {
      setPersistenceError(lang === 'kk' ? 'Чат жойылмады.' : lang === 'en' ? 'Chat could not be deleted.' : 'Не удалось удалить чат.');
    } finally {
      setSessionMutationPending(false);
    }
  };

  const handleRenameChat = async (sessionId: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle.length > 200) {
      setPersistenceError(lang === 'kk' ? 'Чат атауы 1–200 таңбадан тұруы керек.' : lang === 'en' ? 'Chat title must contain 1–200 characters.' : 'Название чата должно содержать от 1 до 200 символов.');
      return;
    }
    if (sessionMutationPending) return;
    setSessionMutationPending(true);
    try {
      const data = await apiFetch<{ session: Omit<ChatSession, 'messages'> }>(`/api/chats/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: trimmedTitle }),
      });
      setSessions((current) =>
        current.map((session) => session.id === sessionId
          ? { ...data.session, messages: session.messages }
          : session)
      );
      setRenameTarget(null);
      queueMicrotask(() => dialogReturnFocusRef.current?.focus());
    } catch {
      setPersistenceError(lang === 'kk' ? 'Чат атауы өзгертілмеді.' : lang === 'en' ? 'Chat could not be renamed.' : 'Не удалось переименовать чат.');
    } finally {
      setSessionMutationPending(false);
    }
  };

  const handleSendPrompt = async (textToSend?: string) => {
    const query = textToSend || promptText;
    if (!query.trim() || loading) return;
    const requestId = crypto.randomUUID();
    let targetSessionId = activeSession?.id;
    setPromptText('');
    setLoading(true);
    setPersistenceError(null);

    try {
      if (!targetSessionId) {
        const created = await apiFetch<{ session: Omit<ChatSession, 'messages'> }>('/api/chats', {
          method: 'POST',
          body: JSON.stringify({
            module: selectedModule,
            title: 'New conversation',
          }),
        });
        const newSession: ChatSession = { ...created.session, messages: [] };
        loadedMessageSessionsRef.current.add(newSession.id);
        setMessageCursors((current) => ({ ...current, [newSession.id]: null }));
        targetSessionId = newSession.id;
        setSessions((current) => [newSession, ...current]);
        setActiveSessionId(newSession.id);
      }

      if (isUntitledConversation(activeSession?.id === targetSessionId ? activeSession.title : sessions.find((session) => session.id === targetSessionId)?.title ?? 'New conversation')) {
        const title = buildConversationTitle(query);
        const renamed = await apiFetch<{ session: Omit<ChatSession, 'messages'> }>(`/api/chats/${encodeURIComponent(targetSessionId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ title }),
        });
        setSessions((current) => current.map((session) => session.id === targetSessionId
          ? { ...renamed.session, messages: session.messages }
          : session));
      }

      const data = await apiFetch<{
        status: string;
        response: string;
        user_message: ChatMessage;
        assistant_message: ChatMessage | null;
        xp: number;
        level: number;
        streak: number;
        requests_count: number;
        material_count: number;
        patent_count: number;
        modules_used: string[];
      }>('/api/module', {
        method: 'POST',
        headers: { 'Idempotency-Key': requestId },
        body: JSON.stringify({
          session_id: targetSessionId,
          module: selectedModule,
          text: query,
          lang,
          ...(documentContext ? { document_id: documentContext.id } : {}),
          ...(imageContext.length > 0 ? { image_ids: imageContext.map(({ id }) => id) } : {}),
        }),
      });
      if (data.status !== 'ok' || !data.assistant_message) {
        throw new Error('Canonical AI response was not persisted.');
      }

      setSessions((current) => current.map((session) => {
        if (session.id !== targetSessionId) return session;
        const byId = new Map(session.messages.map((message) => [message.id, message]));
        byId.set(data.user_message.id, data.user_message);
        byId.set(data.assistant_message!.id, {
          ...data.assistant_message!,
          queryForAi: query,
        });
        return { ...session, messages: Array.from(byId.values()) };
      }));

      clearChatDraft(authenticatedUserId, targetSessionId);
      onSelectDocumentContext?.(null);
      onSelectImageContext?.([]);

      onUpdateUser({
        xp: data.xp,
        level: data.level,
        streak: data.streak,
        requests_count: data.requests_count,
        material_count: data.material_count,
        patent_count: data.patent_count,
        modules_used: data.modules_used,
      });

      if (onCompleteQuest) {
        await onCompleteQuest('first_contact');
        if (selectedModule === 'material') await onCompleteQuest('material_scout');
        if (data.modules_used.length >= 4) await onCompleteQuest('module_explorer');
        if (data.xp >= 100) await onCompleteQuest('xp_hunter');
        if (data.streak >= 3) await onCompleteQuest('streak_master');
      }
    } catch {
      setPersistenceError(lang === 'kk'
        ? 'Хабарлама сақталмады немесе ЖИ жауабы аяқталмады.'
        : lang === 'en'
          ? 'The message could not be persisted or the AI response did not complete.'
          : 'Сообщение не сохранено или ответ ИИ не был завершён.');

      // Reload canonical rows. A user message may have committed before an AI
      // provider failure; no client-only error message is treated as canonical.
      try {
        if (!targetSessionId) return;
        const result = await apiFetch<PageResponse<ChatMessage>>(
          `/api/chats/${encodeURIComponent(targetSessionId)}/messages?limit=50`,
        );
        setSessions((current) => current.map((session) => session.id === targetSessionId
          ? { ...session, messages: mergeMessages(session.messages, result.items) }
          : session));
        setMessageCursors((current) => ({ ...current, [targetSessionId]: result.next_cursor }));
      } catch {
        // The visible persistence error remains the single source of truth.
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveResponse = (query: string, response: string, moduleName: string) => {
    const isAlreadySaved = savedNotes.some(
      (note) => note.query === query && note.response === response
    );

    if (isAlreadySaved) {
      setSavedNotes((previous) => {
        const next = previous.filter((note) => !(note.query === query && note.response === response));
        storeSavedAiNotes(localStorage, authenticatedUserId, next);
        return next;
      });
      return;
    }

    const newNote: SavedNote = {
      id: 'saved_' + Date.now(),
      module: moduleName,
      query,
      response,
      savedAt: new Date().toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setSavedNotes((previous) => {
      const next = [newNote, ...previous];
      storeSavedAiNotes(localStorage, authenticatedUserId, next);
      return next;
    });
  };

  const handleDeleteSavedNote = (noteId: string) => {
    setSavedNotes((previous) => {
      const next = previous.filter((note) => note.id !== noteId);
      storeSavedAiNotes(localStorage, authenticatedUserId, next);
      return next;
    });
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadNote = (note: SavedNote) => {
    const element = document.createElement('a');
    const moduleLabel = MODULE_CONFIG[note.module]?.label || note.module;
    const fileContent = `==============================================\nENGINEERUS QUEST - СОХРАНЕННОЕ РЕШЕНИЕ ИИ\nМодуль: ${moduleLabel}\nДата сохранения: ${note.savedAt}\n==============================================\n\nВОПРОС:\n${note.query}\n\nОТВЕТ ИИ / РЕШЕНИЕ:\n${note.response}\n\n==============================================\nGenerated by Engineerus Quest (https://engineerus.kz)\n`;

    const file = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `Engineerus_${moduleLabel}_${Date.now()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const filteredSavedNotes = savedNotes.filter((note) => {
    const matchesModule = savedFilterModule === 'all' || note.module === savedFilterModule;
    const matchesSearch =
      note.query.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.response.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesModule && matchesSearch;
  });

  const managementCopy = lang === 'kk'
    ? { manage: 'Чатты басқару', rename: 'Атын өзгерту', delete: 'Чатты жою', renameTitle: 'Чат атауын өзгерту', deleteTitle: 'Чатты жою керек пе?', deleteBody: 'Чат және оның хабарлары біржола жойылады. Тіркелген құжаттар мен суреттер кітапханада қалады.', titleLabel: 'Чат атауы', confirmDelete: 'Жою', cancel: 'Бас тарту' }
    : lang === 'en'
      ? { manage: 'Manage chat', rename: 'Rename', delete: 'Delete chat', renameTitle: 'Rename chat', deleteTitle: 'Delete this chat?', deleteBody: 'The chat and its messages will be permanently removed. Attached documents and images will remain in your library.', titleLabel: 'Chat title', confirmDelete: 'Delete', cancel: 'Cancel' }
      : { manage: 'Управление чатом', rename: 'Переименовать', delete: 'Удалить чат', renameTitle: 'Переименовать чат', deleteTitle: 'Удалить этот чат?', deleteBody: 'Чат и его сообщения будут удалены безвозвратно. Прикреплённые документы и изображения останутся в библиотеке.', titleLabel: 'Название чата', confirmDelete: 'Удалить', cancel: 'Отмена' };

  const openRenameDialog = (session: ChatSession) => {
    dialogReturnFocusRef.current = sessionMenuTriggersRef.current.get(session.id) ?? null;
    setSessionMenuId(null);
    setNewTitleInput(session.title);
    setRenameTarget(session);
  };

  const openDeleteDialog = (session: ChatSession) => {
    dialogReturnFocusRef.current = sessionMenuTriggersRef.current.get(session.id) ?? null;
    setSessionMenuId(null);
    setDeleteTarget(session);
  };

  const closeManagementDialog = () => {
    setRenameTarget(null);
    setDeleteTarget(null);
    queueMicrotask(() => dialogReturnFocusRef.current?.focus());
  };

  const sessionActions = (session: ChatSession, selected: boolean, inverted = false) => (
    <div className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        ref={(node) => { if (node) sessionMenuTriggersRef.current.set(session.id, node); else sessionMenuTriggersRef.current.delete(session.id); }}
        aria-label={`${managementCopy.manage}: ${translateSessionTitle(session.title)}`}
        aria-haspopup="menu"
        aria-expanded={sessionMenuId === session.id}
        onClick={() => setSessionMenuId((current) => current === session.id ? null : session.id)}
        className={`rounded-lg p-1.5 transition ${inverted ? 'text-white hover:bg-blue-500' : selected ? 'text-blue-700 hover:bg-blue-100' : 'text-slate-500 hover:bg-slate-200'}`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {sessionMenuId === session.id && (
        <div role="menu" aria-label={managementCopy.manage} className="absolute right-0 top-full z-30 mt-1 min-w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          <button type="button" role="menuitem" onClick={() => openRenameDialog(session)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-100"><Edit2 className="h-3.5 w-3.5" aria-hidden="true" />{managementCopy.rename}</button>
          <button type="button" role="menuitem" onClick={() => openDeleteDialog(session)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{managementCopy.delete}</button>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`eq-ai-workspace space-y-5 md:space-y-6 transition-all ${
        isFullscreen
          ? 'fixed inset-0 z-[100] bg-slate-950 text-slate-100 p-3 sm:p-6 overflow-hidden flex flex-col m-0 rounded-none'
          : ''
      }`}
    >
      {persistenceError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold p-3 rounded-xl">
          {persistenceError}
        </div>
      )}

      {/* Top Banner & Sub-View Switcher Bar */}
      <div className={`relative overflow-hidden shrink-0 transition-all ${
        isFullscreen
          ? 'bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl text-slate-100 shadow-lg'
          : 'eq-ai-intro text-slate-800 p-5 sm:p-6 md:p-8'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className={`flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider mb-1 ${
              isFullscreen ? 'text-blue-400' : 'text-blue-600'
            }`}>
              <DraftingCompass className="w-4 h-4" aria-hidden="true" /> {t.aiCoreTitle || 'Engineerus AI Core'}
            </div>
            <h2 className={`text-xl sm:text-2xl font-extrabold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3 ${
              isFullscreen ? 'text-white' : 'text-slate-900'
            }`}>
              <span>{t.aiAssistantTitle}</span>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                isFullscreen
                  ? 'text-emerald-400 bg-emerald-950/80 border border-emerald-500/20'
                  : 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'
              }`}>
                {t.session || 'Сессия'}: {user.username}
              </span>
            </h2>
            <p className={`text-xs font-medium mt-1 max-w-xl leading-relaxed ${
              isFullscreen ? 'text-slate-400' : 'text-slate-500'
            }`}>
              {t.aiAssistantDesc}
            </p>
          </div>

          {/* Subview Tabs: Chat vs Saved Solutions & Fullscreen Toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`flex items-center p-1 rounded-xl border ${
              isFullscreen
                ? 'bg-slate-850 border-slate-700'
                : 'bg-slate-100/80 border-slate-200/55'
            }`}>
              <button
                onClick={() => setActiveSubView('chat')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  activeSubView === 'chat'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isFullscreen
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/40'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>{t.engineeringChat}</span>
              </button>

              <button
                onClick={() => setActiveSubView('saved')}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  activeSubView === 'saved'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : isFullscreen
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/40'
                }`}
              >
                <Bookmark className="w-4 h-4" />
                <span>{t.savedSolutions}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                  isFullscreen ? 'bg-amber-500 text-slate-950' : 'bg-amber-400 text-slate-950'
                }`}>
                  {savedNotes.length}
                </span>
              </button>
            </div>

            {/* Fullscreen Toggle Button */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`p-2 rounded-xl border transition-all flex items-center justify-center ${
                isFullscreen
                  ? 'bg-slate-850 hover:bg-slate-800 text-white border-slate-700'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs'
              }`}
              title={isFullscreen ? t.exitFullscreen : t.fullscreen}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-amber-500" />
              ) : (
                <Maximize2 className="w-4 h-4 text-blue-600" />
              )}
            </button>
          </div>
        </div>
      </div>

      {activeSubView === 'chat' ? (
        <div className={`flex flex-col gap-4 ${isFullscreen ? 'flex-1 min-h-0' : ''}`}>
          {/* Module Selectors Row */}
          <div className="eq-ai-modules grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 shrink-0">
            {Object.entries(MODULE_CONFIG).map(([key, config]) => {
              const IconComp = config.icon;
              const isSelected = selectedModule === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedModule(key)}
                  className={`eq-ai-module p-3 sm:p-3.5 border text-left transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/90 shadow-md ring-2 ring-blue-500/20 text-slate-900'
                      : isFullscreen
                      ? 'border-slate-800 bg-slate-900 hover:border-slate-700 text-slate-200'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-900 shadow-2xs'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-xl ${config.badgeBg} text-white flex items-center justify-center font-bold mb-1.5 shadow-2xs`}
                  >
                    <IconComp className="w-3.5 h-3.5" />
                  </div>
                  <div className="font-extrabold text-xs truncate">
                    {config.label}
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold mt-0.5 truncate">
                    {key === 'tutor' && (lang === 'kk' ? 'Репетитор' : lang === 'en' ? 'AI Tutor' : 'Репетитор')}
                    {key === 'material' && (lang === 'kk' ? 'МЕМСТ Материалдар' : lang === 'en' ? 'GOST Materials' : 'Материалы ГОСТ')}
                    {key === 'patent' && (lang === 'kk' ? 'Патент Формуласы' : lang === 'en' ? 'Patent Draft' : 'Формула Патента')}
                    {key === 'engi_legal' && (lang === 'kk' ? 'ҚНжЕ & Нормалар' : lang === 'en' ? 'Codes & Standards' : 'СНиП & Нормы')}
                    {key === 'engi_match' && (lang === 'kk' ? 'Команда' : lang === 'en' ? 'Team' : 'Команда')}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Preset Questions Bar */}
          {!isFullscreen && (
            <div className="eq-ai-prompts p-3.5 sm:p-4 space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-blue-600" /> {lang === 'kk' ? 'Модульге арналған кеңес' : lang === 'en' ? 'Prompt suggestion for module' : 'Подсказка для модуля'}{' '}
                  <span className="text-blue-600">{MODULE_CONFIG[selectedModule]?.label}</span>:
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {(PRESET_QUESTIONS[selectedModule]?.[lang] || PRESET_QUESTIONS[selectedModule]?.ru || []).map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setPromptText(preset);
                      handleSendPrompt(preset);
                    }}
                    className="eq-ai-prompt text-xs font-bold text-slate-700 px-3 py-1 transition-all text-left flex items-center gap-1.5"
                  >
                    <span>{preset}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main Chat Interface Window with Multi-Chat Drawer */}
          <div
            className={`eq-ai-chat-frame relative bg-white border border-slate-200/80 overflow-hidden flex flex-col ${
              isFullscreen ? 'flex-1 min-h-0 bg-slate-900 border-slate-800 text-slate-100' : 'min-h-[420px] max-h-[650px]'
            }`}
          >
            <aside className={`absolute inset-y-0 left-0 z-10 hidden w-64 flex-col border-r lg:flex ${isFullscreen ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'}`} aria-label={lang === 'kk' ? 'Сақталған чаттар' : lang === 'en' ? 'Saved conversations' : 'Сохранённые чаты'}>
              <div className="flex items-center justify-between gap-2 border-b border-inherit p-3">
                <span className="flex min-w-0 items-center gap-2 text-xs font-black uppercase tracking-wide"><History className="h-4 w-4 text-blue-500" />{lang === 'kk' ? 'Чаттар' : lang === 'en' ? 'Conversations' : 'Диалоги'}</span>
                <button type="button" onClick={handleCreateNewChat} aria-label={t.newChat} className="rounded-lg bg-blue-600 p-2 text-white transition hover:bg-blue-700"><Plus className="h-4 w-4" /></button>
              </div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                {sessions.map((session) => {
                  const selected = session.id === activeSessionId;
                  return <div key={session.id} className={`flex w-full items-center rounded-xl border pr-1 transition ${selected ? 'border-blue-200 bg-blue-50 text-blue-950' : isFullscreen ? 'border-transparent text-slate-300 hover:bg-slate-900' : 'border-transparent text-slate-700 hover:bg-white'}`}>
                    <button type="button" aria-current={selected ? 'true' : undefined} onClick={() => selectSession(session)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                      <span className="block truncate text-xs font-extrabold">{translateSessionTitle(session.title)}</span>
                      <span className="mt-1 block truncate text-[10px] font-semibold opacity-60">{MODULE_CONFIG[session.module]?.label ?? session.module}</span>
                    </button>
                    {sessionActions(session, selected)}
                  </div>;
                })}
                {sessionCursor && <button type="button" disabled={loadingOlderSessions} onClick={() => void loadOlderSessions()} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-60">{loadingOlderSessions ? (lang === 'en' ? 'Loading…' : lang === 'kk' ? 'Жүктелуде…' : 'Загрузка…') : (lang === 'en' ? 'Load older' : lang === 'kk' ? 'Ескілерін жүктеу' : 'Загрузить ещё')}</button>}
              </div>
            </aside>
            {/* Top Bar with Saved Chats Switcher & New Chat Button */}
            <div
              className={`border-b px-4 py-2.5 flex items-center justify-between gap-2 shrink-0 lg:ml-64 ${
                isFullscreen ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50/90 border-slate-200/80'
              }`}
            >
              {/* Left: Current Active Chat Title & History Toggle Button */}
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setShowSessionsDrawer(!showSessionsDrawer)}
                  aria-expanded={showSessionsDrawer}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all lg:hidden ${
                    showSessionsDrawer
                      ? 'bg-blue-600 text-white'
                      : isFullscreen
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <History className="w-3.5 h-3.5 text-blue-400" />
                  <span>{t.chatsCount || 'Чаты'} ({sessions.length})</span>
                </button>

                <div className="font-extrabold text-xs truncate max-w-[150px] sm:max-w-[280px]">
                  {activeSession ? translateSessionTitle(activeSession.title) : (lang === 'kk' ? 'Инженерлік сеанс' : lang === 'en' ? 'Engineering Session' : 'Инженерный сеанс')}
                </div>
              </div>

              {/* Right: New Chat Button & Clear */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  ref={newChatButtonRef}
                  type="button"
                  onClick={handleCreateNewChat}
                  className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white px-3 py-1.5 rounded-xl text-xs font-black shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.newChat}</span>
                </button>
              </div>
            </div>

            {/* Multi-Chat Drawer Overlay (Slide Down / Expand) */}
            {showSessionsDrawer && (
              <div
                className={`p-3 border-b space-y-2 animate-fade-in lg:hidden ${
                  isFullscreen ? 'bg-slate-950 border-slate-800' : 'bg-slate-100/95 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-black text-slate-500 uppercase tracking-wider px-1">
                  <span className="flex items-center gap-1">
                    <FolderKanban className="w-3.5 h-3.5 text-blue-500" /> {lang === 'kk' ? `Пайдаланушының сақталған чаттары: ${user.username}` : lang === 'en' ? `Saved chats for ${user.username}` : `Сохраненные чаты пользователя ${user.username}`}
                  </span>
                  <button
                    onClick={() => setShowSessionsDrawer(false)}
                    className="p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                  {sessions.map((sess) => {
                    const isActive = sess.id === activeSessionId;
                    const modConfig = MODULE_CONFIG[sess.module] || MODULE_CONFIG.tutor;

                    return (
                      <div
                        key={sess.id}
                        onClick={() => {
                          selectSession(sess);
                        }}
                        className={`p-2.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                          isActive
                            ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                            : isFullscreen
                            ? 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-blue-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold text-xs truncate">{translateSessionTitle(sess.title)}</div>
                          <div
                            className={`text-[10px] font-medium mt-0.5 flex items-center gap-1.5 ${
                              isActive ? 'text-blue-100' : 'text-slate-400'
                            }`}
                          >
                            <span>{modConfig.label}</span>
                            <span>• {sess.messages.length} {lang === 'kk' ? 'хабарл.' : lang === 'en' ? 'msgs' : 'сообщ.'}</span>
                          </div>
                        </div>

                        {sessionActions(sess, isActive, isActive)}
                      </div>
                    );
                  })}
                </div>
                {sessionCursor && (
                  <button
                    type="button"
                    disabled={loadingOlderSessions}
                    onClick={() => void loadOlderSessions()}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-60"
                  >
                    {loadingOlderSessions
                      ? (lang === 'kk' ? 'Жүктелуде…' : lang === 'en' ? 'Loading…' : 'Загрузка…')
                      : (lang === 'kk' ? 'Ескі чаттарды жүктеу' : lang === 'en' ? 'Load older chats' : 'Загрузить старые чаты')}
                  </button>
                )}
              </div>
            )}

            {/* Chat Messages Timeline Scroll Box */}
            <div
              className={`flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 lg:ml-64 ${
                isFullscreen ? 'bg-slate-950/60' : 'bg-slate-50/30'
              }`}
            >
              {activeSessionId && messageCursors[activeSessionId] && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMessageSessions.has(activeSessionId)}
                    onClick={() => void loadOlderMessages()}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-60"
                  >
                    {loadingMessageSessions.has(activeSessionId)
                      ? (lang === 'kk' ? 'Жүктелуде…' : lang === 'en' ? 'Loading…' : 'Загрузка…')
                      : (lang === 'kk' ? 'Ескі хабарларды жүктеу' : lang === 'en' ? 'Load older messages' : 'Загрузить старые сообщения')}
                  </button>
                </div>
              )}
              {activeSessionId && loadingMessageSessions.has(activeSessionId) && messages.length === 0 && (
                <div className="text-center text-xs font-bold text-slate-400">
                  {lang === 'kk' ? 'Хабарлар жүктелуде…' : lang === 'en' ? 'Loading messages…' : 'Загрузка сообщений…'}
                </div>
              )}
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                const modConfig = MODULE_CONFIG[msg.module] || MODULE_CONFIG.tutor;
                const isSaved = savedNotes.some(
                  (n) => n.response === msg.text || (msg.queryForAi && n.query === msg.queryForAi)
                );

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
                  >
                    {!isUser && (
                      <div className="eq-ai-avatar">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-[88%] sm:max-w-[80%] rounded-xl p-4 sm:p-5 ${
                        isUser
                          ? 'bg-blue-700 text-white rounded-br-xs'
                          : isFullscreen
                          ? 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-xs space-y-3'
                          : 'bg-white border border-slate-200/90 border-l-[3px] border-l-teal-600 text-slate-800 rounded-bl-xs space-y-3'
                      }`}
                    >
                      {/* Top AI Message Header Bar */}
                      {!isUser && (
                        <div className="flex items-center justify-between border-b border-slate-200/30 pb-2 text-xs font-bold text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold text-white ${modConfig.badgeBg}`}>
                              {modConfig.label}
                            </span>
                            <span className="text-[11px] text-slate-400">{msg.timestamp}</span>
                          </div>

                          {msg.xpEarned && (
                            <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> +{msg.xpEarned} XP
                            </span>
                          )}
                        </div>
                      )}

                      {/* Markdown Text Content */}
                      <div
                        className={`text-xs sm:text-sm font-medium leading-relaxed ${
                          isUser ? 'text-white' : isFullscreen ? 'text-slate-100' : 'text-slate-900'
                        }`}
                      >
                        {isUser ? (
                          <div className="whitespace-pre-wrap">{translateMsgText(msg.text, msg.id)}</div>
                        ) : (
                          <div className="markdown-body space-y-2">
                            <ReactMarkdown>{translateMsgText(msg.text, msg.id)}</ReactMarkdown>
                          </div>
                        )}
                      </div>

                      {/* AI Action Buttons: Save & Copy */}
                      {!isUser && msg.id !== 'welcome-msg' && (
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/30">
                          <button
                            onClick={() => handleCopyText(translateMsgText(msg.text, msg.id), msg.id)}
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 ${
                              isFullscreen
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                <span className="text-emerald-500">{lang === 'kk' ? 'Көшірілді!' : lang === 'en' ? 'Copied!' : 'Скопировано!'}</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-slate-400" />
                                <span>{lang === 'kk' ? 'Көшіру' : lang === 'en' ? 'Copy' : 'Копировать'}</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() =>
                              handleSaveResponse(
                                msg.queryForAi || (lang === 'kk' ? 'Инженерлік сұраныс' : lang === 'en' ? 'Engineering Request' : 'Инженерный запрос'),
                                translateMsgText(msg.text, msg.id),
                                msg.module
                              )
                            }
                            className={`px-3 py-1 rounded-xl text-[11px] font-extrabold transition-all flex items-center gap-1 ${
                              isSaved
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                            }`}
                          >
                            {isSaved ? (
                              <>
                                <BookmarkCheck className="w-3.5 h-3.5 text-amber-600" />
                                <span>{lang === 'kk' ? 'Сақталды' : lang === 'en' ? 'Saved' : 'Сохранено'}</span>
                              </>
                            ) : (
                              <>
                                <Bookmark className="w-3.5 h-3.5 text-blue-600" />
                                <span>{lang === 'kk' ? 'Шешімді сақтау' : lang === 'en' ? 'Save Solution' : 'Сохранить решение'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {isUser && (
                        <div className="text-[10px] text-blue-200 font-semibold text-right mt-1.5">
                          {msg.timestamp}
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-2xl bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div className="flex gap-3 justify-start animate-fade-in">
                  <div className="eq-ai-avatar">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div
                    className={`rounded-xl p-4 text-xs font-bold flex items-center gap-2 ${
                      isFullscreen ? 'bg-slate-900 border border-slate-800 text-slate-300' : 'bg-white border border-slate-200/90 text-slate-600'
                    }`}
                  >
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span>{lang === 'kk' ? 'Шарттарды тексеріп, инженерлік жауап дайындап жатырмын…' : lang === 'en' ? 'Checking the given conditions and preparing an engineering answer…' : 'Проверяю условия и готовлю инженерный ответ…'}</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Chat Composer Input Area */}
            <div
              className={`p-3 sm:p-4 border-t shrink-0 lg:ml-64 ${
                isFullscreen ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/80'
              }`}
            >
              {(documentContext || imageContext.length > 0) && (
                <div className="mb-2 flex flex-wrap gap-2" aria-label={lang === 'kk' ? 'Таңдалған контекст' : lang === 'en' ? 'Selected context' : 'Выбранный контекст'}>
                  {documentContext && <span className="flex max-w-full items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-900"><span aria-hidden="true">📄</span><span className="min-w-0 truncate">{documentContext.name}</span><button type="button" onClick={() => { onClearDocumentContext?.(); onSelectDocumentContext?.(null); }} aria-label={`${lang === 'en' ? 'Remove' : lang === 'kk' ? 'Алып тастау' : 'Убрать'} ${documentContext.name}`} className="rounded p-0.5 hover:bg-blue-100"><X className="h-3.5 w-3.5" /></button></span>}
                  {imageContext.map((image) => <span key={image.id} className="flex max-w-full items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-900"><span aria-hidden="true">🖼</span><span className="min-w-0 truncate">{image.name}</span><button type="button" onClick={() => onSelectImageContext?.(imageContext.filter((item) => item.id !== image.id))} aria-label={`${lang === 'en' ? 'Remove' : lang === 'kk' ? 'Алып тастау' : 'Убрать'} ${image.name}`} className="rounded p-0.5 hover:bg-violet-100"><X className="h-3.5 w-3.5" /></button></span>)}
                </div>
              )}
              <div className="flex items-end gap-2">
                <AiAttachmentPicker
                  lang={lang}
                  disabled={loading}
                  document={documentContext ?? null}
                  images={imageContext}
                  onSelectDocument={(value) => onSelectDocumentContext?.(value)}
                  onSelectImages={(value) => onSelectImageContext?.(value)}
                />
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendPrompt();
                    }
                  }}
                  rows={1}
                  placeholder={lang === 'kk' ? 'Есепті, бастапқы деректерді немесе инженерлік сұрақты сипаттаңыз…' : lang === 'en' ? 'Describe the problem, given data, or engineering question…' : 'Опишите задачу, исходные данные или инженерный вопрос…'}
                  aria-label={lang === 'kk' ? 'ЖИ-ге хабарлама' : lang === 'en' ? 'Message AI Tutor' : 'Сообщение ИИ-тьютору'}
                  className={`min-h-11 min-w-0 flex-1 p-3 rounded-xl border outline-none text-xs sm:text-sm font-medium transition-all resize-none ${
                    isFullscreen
                      ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-blue-500'
                      : 'bg-white border-slate-200 text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20'
                  }`}
                />

                <button
                  onClick={() => handleSendPrompt()}
                  disabled={loading || !promptText.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black px-3 sm:px-4 py-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-xs shrink-0 min-h-[44px]"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">{lang === 'kk' ? 'Жіберу' : lang === 'en' ? 'Send' : 'Отправить'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Saved Notes & Solutions View */
        <div className="space-y-4 animate-fade-in">
          {/* Controls: Search & Module Filter Bar */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Search input */}
            <div className="relative w-full sm:max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lang === 'kk' ? 'Сақталғандардан іздеу...' : lang === 'en' ? 'Search saved...' : 'Поиск по сохраненным...'}
                className="w-full pl-9 pr-4 py-2 rounded-2xl border border-slate-200 text-xs font-medium focus:border-blue-600 outline-none transition-all"
              />
            </div>

            {/* Filter by Module */}
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <button
                onClick={() => setSavedFilterModule('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  savedFilterModule === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t.filterAll} ({savedNotes.length})
              </button>

              {Object.entries(MODULE_CONFIG).map(([modKey, modCfg]) => (
                <button
                  key={modKey}
                  onClick={() => setSavedFilterModule(modKey)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    savedFilterModule === modKey
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {modCfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Saved Cards Grid */}
          {filteredSavedNotes.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-200/80 shadow-2xs space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                <Bookmark className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-900 text-base">
                {savedNotes.length === 0 ? 'Нет сохраненных решений' : 'Ничего не найдено'}
              </h3>
              <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">
                {savedNotes.length === 0
                  ? 'Сохраняйте полезные ответы ИИ, нажав кнопку «Сохранить решение» в чате, чтобы обращаться к ним в любой момент.'
                  : 'Попробуйте изменить поисковый запрос или сбросить фильтр по модулям.'}
              </p>
              {savedNotes.length === 0 && (
                <button
                  onClick={() => setActiveSubView('chat')}
                  className="bg-blue-600 text-white text-xs font-extrabold px-5 py-2.5 rounded-2xl shadow-md shadow-blue-500/20"
                >
                  Задать вопрос ИИ
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSavedNotes.map((note) => {
                const modCfg = MODULE_CONFIG[note.module] || MODULE_CONFIG.tutor;
                const IconComp = modCfg.icon;

                return (
                  <div
                    key={note.id}
                    className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-2xs space-y-3 transition-all hover:border-blue-300"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-xl ${modCfg.badgeBg} text-white flex items-center justify-center font-bold text-xs`}
                        >
                          <IconComp className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-extrabold text-xs text-slate-900">
                          {modCfg.label}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400">
                          • {note.savedAt}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopyText(note.response, note.id)}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
                          title="Скопировать ответ"
                        >
                          {copiedId === note.id ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          onClick={() => handleDownloadNote(note)}
                          className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
                          title="Скачать файл .txt"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDeleteSavedNote(note.id)}
                          className="p-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-all"
                          title="Удалить из сохраненных"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Question */}
                    <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/60 text-xs font-bold text-slate-800">
                      <span className="text-blue-600 uppercase text-[10px] block font-black mb-0.5">Вопрос:</span>
                      {note.query}
                    </div>

                    {/* Response Solution in Markdown */}
                    <div className="text-xs sm:text-sm font-medium text-slate-800 leading-relaxed pt-1">
                      <div className="markdown-body space-y-2">
                        <ReactMarkdown>{note.response}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeManagementDialog(); }}>
          <form onSubmit={(event) => { event.preventDefault(); void handleRenameChat(renameTarget.id, newTitleInput); }} role="dialog" aria-modal="true" aria-labelledby="rename-chat-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 id="rename-chat-title" className="text-lg font-black text-slate-950">{managementCopy.renameTitle}</h2>
            <label className="mt-4 block text-xs font-bold text-slate-700">{managementCopy.titleLabel}
              <input autoFocus required maxLength={200} value={newTitleInput} onChange={(event) => setNewTitleInput(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
            </label>
            <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={sessionMutationPending} onClick={closeManagementDialog}>{managementCopy.cancel}</Button><Button type="submit" disabled={sessionMutationPending || !newTitleInput.trim()}>{managementCopy.rename}</Button></div>
          </form>
        </div>
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeManagementDialog(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="delete-chat-title" aria-describedby="delete-chat-description" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 id="delete-chat-title" className="text-lg font-black text-slate-950">{managementCopy.deleteTitle}</h2>
            <p className="mt-2 text-sm font-semibold text-slate-800">{translateSessionTitle(deleteTarget.title)}</p>
            <p id="delete-chat-description" className="mt-2 text-sm leading-6 text-slate-600">{managementCopy.deleteBody}</p>
            <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={sessionMutationPending} onClick={closeManagementDialog}>{managementCopy.cancel}</Button><Button type="button" variant="danger" disabled={sessionMutationPending} onClick={() => void handleDeleteChat(deleteTarget.id)}>{managementCopy.confirmDelete}</Button></div>
          </div>
        </div>
      )}
    </div>
  );
};
