import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { UserProfile, Language, SavedNote, ChatMessage, ChatSession } from '../types';
import { TRANSLATIONS } from '../data';
import { verifySystemIntegrity } from '../utils/integrity';
import {
  Sparkles,
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
  X,
  History,
  FolderKanban
} from 'lucide-react';

//  ДОБАВЛЕНО: Базовый URL для API (подтягивается из Vercel/локального .env)
const API_BASE = import.meta.env.VITE_API_URL || '';

interface AIAssistantTabProps {
  user: UserProfile;
  lang: Language;
  onUpdateUser: (updated: Partial<UserProfile>) => void;
  onCompleteQuest?: (questId: string) => void;
  initialModule?: string;
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
  tutor: { label: 'TUTOR AI', icon: Sparkles, color: 'text-blue-600', badgeBg: 'bg-blue-600' },
  material: { label: 'MaterialSwap', icon: Layers, color: 'text-emerald-600', badgeBg: 'bg-emerald-600' },
  patent: { label: 'PatentCraft', icon: Cpu, color: 'text-purple-600', badgeBg: 'bg-purple-600' },
  engi_legal: { label: 'EngiLegal', icon: ShieldCheck, color: 'text-amber-600', badgeBg: 'bg-amber-600' },
  engi_match: { label: 'EngiMatch', icon: Users, color: 'text-indigo-600', badgeBg: 'bg-indigo-600' },
};

export const AIAssistantTab: React.FC<AIAssistantTabProps> = ({
  user,
  lang,
  onUpdateUser,
  onCompleteQuest,
  initialModule,
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

  // User Multi-Chat Sessions
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [newTitleInput, setNewTitleInput] = useState<string>('');

  // Saved Notes Library
  const [savedNotes, setSavedNotes] = useState<SavedNote[]>(() => {
    const saved = localStorage.getItem('eq_saved_ai_notes');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [
      {
        id: 'sample-saved-1',
        module: 'material',
        query: 'Сравни конструкционную сталь 09Г2С и Сталь 45 для северного Казахстана',
        response: `**Сравнение Стали 09Г2С и Стали 45 для северных регионов РК:**\n\n` +
          `1. **Сталь 09Г2С (Низколегированная)**:\n` +
          `   - **Предел текучести**: ~345 МПа\n` +
          `   - **Хладноломкость**: Сохраняет ударную вязкость при температурах до -70°C (ГОСТ 19281).\n` +
          `   - **Свариваемость**: Без ограничений.\n` +
          `2. **Сталь 45 (Качественная углеродистая)**:\n` +
          `   - **Предел текучести**: ~355 МПа\n` +
          `   - **Хладноломкость**: Склонна к хрупкому разрушению при температурах ниже -20°C.\n` +
          `   - **Вывод**: Для уличных несущих металлоконструкций рекомендована **Сталь 09Г2С**.`,
        savedAt: '22 Июля 2026, 11:30',
      },
    ];
  });

  // UI Toast & Search States
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [savedFilterModule, setSavedFilterModule] = useState<string>('all');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Assert system integrity across modules
    verifySystemIntegrity(t.attributionCaption);
  }, [lang, t]);

  // Load chats for user from server
  useEffect(() => {
    const userEmail = user.email || 'student@engineerus.kz';
    //  ИСПРАВЛЕНО: Добавлен API_BASE
    fetch(`${API_BASE}/api/chats/${encodeURIComponent(userEmail)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.chats && data.chats.length > 0) {
          setSessions(data.chats);
          setActiveSessionId(data.chats[0].id);
        } else {
          // create default
          const defaultSession: ChatSession = {
            id: 'session_' + Date.now(),
            title: 'Инженерный консилиум (Главный)',
            module: 'tutor',
            createdAt: new Date().toLocaleDateString('ru-RU'),
            updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            messages: [
              {
                id: 'welcome-msg',
                sender: 'ai',
                module: 'tutor',
                text: 'Здравствуйте! Я ваш инженерный ИИ-тьютор **Engineerus**. Задайте вопрос по сопромату, ГОСТ РК, материалам или патентам.',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ],
          };
          setSessions([defaultSession]);
          setActiveSessionId(defaultSession.id);
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }, [user.email]);

  // Sync saved notes to local storage
  useEffect(() => {
    localStorage.setItem('eq_saved_ai_notes', JSON.stringify(savedNotes));
  }, [savedNotes]);

  // Active Chat Session
  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const messages = activeSession ? activeSession.messages : [];

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

  // Save current session to server
  const syncSessionToServer = async (updatedSession: ChatSession) => {
    try {
      //  ИСПРАВЛЕНО: Добавлен API_BASE
      await fetch(`${API_BASE}/api/chats/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          session: updatedSession,
        }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateNewChat = async () => {
    try {
      //  ИСПРАВЛЕНО: Добавлен API_BASE
      const res = await fetch(`${API_BASE}/api/chats/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          module: selectedModule,
          title: `Квест ${MODULE_CONFIG[selectedModule]?.label || 'ИИ'} (#${sessions.length + 1})`,
        }),
      });
      const data = await res.json();
      if (data.status === 'ok' && data.newSession) {
        setSessions(data.chats);
        setActiveSessionId(data.newSession.id);
        setShowSessionsDrawer(false);
      }
    } catch (e) {
      console.error(e);
      // fallback local
      const newSess: ChatSession = {
        id: 'sess_' + Date.now(),
        title: `Чат #${sessions.length + 1}`,
        module: selectedModule,
        createdAt: new Date().toLocaleDateString('ru-RU'),
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        messages: [
          {
            id: 'welc_' + Date.now(),
            sender: 'ai',
            module: selectedModule,
            text: 'Создан новый диалог! Чем я могу помочь?',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ],
      };
      setSessions((prev) => [newSess, ...prev]);
      setActiveSessionId(newSess.id);
      setShowSessionsDrawer(false);
    }
  };

  const handleDeleteChat = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmMsg = lang === 'kk'
      ? 'Таңдалған чатты жою керек пе?'
      : lang === 'en'
      ? 'Are you sure you want to delete the selected chat?'
      : 'Удалить выбранный чат?';
    if (confirm(confirmMsg)) {
      try {
        //  ИСПРАВЛЕНО: Добавлен API_BASE
        const res = await fetch(`${API_BASE}/api/chats/${encodeURIComponent(user.email)}/${sessionId}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (data.status === 'ok') {
          setSessions(data.chats);
          if (activeSessionId === sessionId) {
            setActiveSessionId(data.chats[0]?.id || '');
          }
        }
      } catch (err) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    }
  };

  const handleRenameChat = async (sessionId: string, title: string) => {
    if (!title.trim()) return;
    try {
      // ИСПРАВЛЕНО: Добавлен API_BASE
      const res = await fetch(`${API_BASE}/api/chats/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          sessionId,
          newTitle: title,
        }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setSessions(data.chats);
      }
    } catch (err) {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
      );
    } finally {
      setEditingSessionId(null);
    }
  };

  const handleSendPrompt = async (textToSend?: string) => {
    const query = textToSend || promptText;
    if (!query.trim() || loading || !activeSession) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsgId = 'usr_' + Date.now();
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: query,
      module: selectedModule,
      timestamp: timeStr,
    };

    // Update active session locally
    const updatedMessages = [...activeSession.messages, userMsg];
    const updatedSession: ChatSession = {
      ...activeSession,
      messages: updatedMessages,
      updatedAt: timeStr,
      // Auto-update title if it was generic default
      title:
        activeSession.messages.length <= 1
          ? query.slice(0, 30) + (query.length > 30 ? '...' : '')
          : activeSession.title,
    };

    setSessions((prev) =>
      prev.map((s) => (s.id === activeSession.id ? updatedSession : s))
    );

    setPromptText('');
    setLoading(true);

    try {
      //  ИСПРАВЛЕНО: Добавлен API_BASE
      const res = await fetch(`${API_BASE}/api/module`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: selectedModule,
          text: query,
          lang,
          email: user.email,
        }),
      });

      const data = await res.json();
      if (data.status === 'ok') {
        const aiMsg: ChatMessage = {
          id: 'ai_' + Date.now(),
          sender: 'ai',
          text: data.response,
          module: selectedModule,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          xpEarned: 15,
          queryForAi: query,
        };

        const finalMessages = [...updatedMessages, aiMsg];
        const finalSession: ChatSession = {
          ...updatedSession,
          messages: finalMessages,
        };

        setSessions((prev) =>
          prev.map((s) => (s.id === activeSession.id ? finalSession : s))
        );

        syncSessionToServer(finalSession);

        onUpdateUser({
          xp: data.xp,
          level: data.level,
        });

        if (onCompleteQuest) {
          // 1. First contact quest (Ask 1st question to AI tutor)
          onCompleteQuest('first_contact');

          // 2. Material scout quest (Use MaterialSwap module)
          if (selectedModule === 'material') {
            onCompleteQuest('material_scout');
          }

          // 3. Module explorer quest (Track used modules)
          try {
            const usedRaw = localStorage.getItem('eq_used_modules');
            const usedList: string[] = usedRaw ? JSON.parse(usedRaw) : [];
            if (!usedList.includes(selectedModule)) {
              const newList = [...usedList, selectedModule];
              localStorage.setItem('eq_used_modules', JSON.stringify(newList));
              if (newList.length >= 5) {
                onCompleteQuest('module_explorer');
              }
            } else if (usedList.length >= 5) {
              onCompleteQuest('module_explorer');
            }
          } catch (err) {
            console.error(err);
          }

          // 4. XP hunter quest
          if (data.xp >= 100) {
            onCompleteQuest('xp_hunter');
          }

          // 5. Streak master quest
          if (user.streak >= 3) {
            onCompleteQuest('streak_master');
          }
        }
      } else {
        const errAiMsg: ChatMessage = {
          id: 'ai_err_' + Date.now(),
          sender: 'ai',
          text: 'Произошла ошибка при обращении к ИИ. Пожалуйста, попробуйте еще раз.',
          module: selectedModule,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        const finalSession = {
          ...updatedSession,
          messages: [...updatedMessages, errAiMsg],
        };
        setSessions((prev) =>
          prev.map((s) => (s.id === activeSession.id ? finalSession : s))
        );
      }
    } catch (err) {
      console.error(err);
      const errAiMsg: ChatMessage = {
        id: 'ai_err_' + Date.now(),
        sender: 'ai',
        text: 'Ошибка сети или сервера. Проверьте соединение.',
        module: selectedModule,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const finalSession = {
        ...updatedSession,
        messages: [...updatedMessages, errAiMsg],
      };
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSession.id ? finalSession : s))
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveResponse = (query: string, response: string, moduleName: string) => {
    const isAlreadySaved = savedNotes.some(
      (note) => note.query === query && note.response === response
    );

    if (isAlreadySaved) {
      setSavedNotes((prev) =>
        prev.filter((note) => !(note.query === query && note.response === response))
      );
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

    setSavedNotes((prev) => [newNote, ...prev]);
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

  return (
    <div
      className={`space-y-5 md:space-y-6 transition-all ${
        isFullscreen
          ? 'fixed inset-0 z-[100] bg-slate-950 text-slate-100 p-3 sm:p-6 overflow-hidden flex flex-col m-0 rounded-none'
          : ''
      }`}
    >
      {/* Top Banner & Sub-View Switcher Bar */}
      <div className={`relative overflow-hidden shrink-0 transition-all ${
        isFullscreen
          ? 'bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl text-slate-100 shadow-lg'
          : 'bg-gradient-to-br from-slate-50 via-slate-100/40 to-blue-50/25 text-slate-800 rounded-2xl p-5 sm:p-6 md:p-8 shadow-xs border border-slate-200/50'
      }`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className={`flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider mb-1 ${
              isFullscreen ? 'text-blue-400' : 'text-blue-600'
            }`}>
              <Sparkles className="w-4 h-4 text-amber-500" /> {t.aiCoreTitle || 'Engineerus AI Core'}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3 shrink-0">
            {Object.entries(MODULE_CONFIG).map(([key, config]) => {
              const IconComp = config.icon;
              const isSelected = selectedModule === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedModule(key)}
                  className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all ${
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
            <div className="bg-white rounded-3xl p-3.5 sm:p-4 border border-slate-200/80 shadow-2xs space-y-2 shrink-0">
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
                    className="text-xs font-bold text-slate-700 bg-slate-100/80 hover:bg-blue-50 hover:text-blue-700 border border-slate-200/80 hover:border-blue-300 px-3 py-1 rounded-2xl transition-all text-left shadow-2xs flex items-center gap-1.5"
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
            className={`bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col ${
              isFullscreen ? 'flex-1 min-h-0 bg-slate-900 border-slate-800 text-slate-100' : 'min-h-[420px] max-h-[650px]'
            }`}
          >
            {/* Top Bar with Saved Chats Switcher & New Chat Button */}
            <div
              className={`border-b px-4 py-2.5 flex items-center justify-between gap-2 shrink-0 ${
                isFullscreen ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50/90 border-slate-200/80'
              }`}
            >
              {/* Left: Current Active Chat Title & History Toggle Button */}
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setShowSessionsDrawer(!showSessionsDrawer)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
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
                className={`p-3 border-b space-y-2 animate-fade-in ${
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
                    const isEditing = editingSessionId === sess.id;
                    const modConfig = MODULE_CONFIG[sess.module] || MODULE_CONFIG.tutor;

                    return (
                      <div
                        key={sess.id}
                        onClick={() => {
                          setActiveSessionId(sess.id);
                          setShowSessionsDrawer(false);
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
                          {isEditing ? (
                            <input
                              type="text"
                              value={newTitleInput}
                              onChange={(e) => setNewTitleInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameChat(sess.id, newTitleInput);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full text-xs font-bold bg-white text-slate-900 px-2 py-1 rounded-md border border-blue-500 outline-none"
                              autoFocus
                            />
                          ) : (
                            <div className="font-extrabold text-xs truncate">{translateSessionTitle(sess.title)}</div>
                          )}
                          <div
                            className={`text-[10px] font-medium mt-0.5 flex items-center gap-1.5 ${
                              isActive ? 'text-blue-100' : 'text-slate-400'
                            }`}
                          >
                            <span>{modConfig.label}</span>
                            <span>• {sess.messages.length} {lang === 'kk' ? 'хабарл.' : lang === 'en' ? 'msgs' : 'сообщ.'}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isEditing) {
                                handleRenameChat(sess.id, newTitleInput);
                              } else {
                                setEditingSessionId(sess.id);
                                setNewTitleInput(sess.title);
                              }
                            }}
                            className={`p-1 rounded-lg transition-all ${
                              isActive ? 'hover:bg-blue-500 text-white' : 'hover:bg-slate-200 text-slate-500'
                            }`}
                            title={lang === 'kk' ? 'Атын ауыстыру' : lang === 'en' ? 'Rename' : 'Переименовать'}
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>

                          {sessions.length > 1 && (
                            <button
                              onClick={(e) => handleDeleteChat(sess.id, e)}
                              className={`p-1 rounded-lg transition-all ${
                                isActive ? 'hover:bg-blue-500 text-red-200' : 'hover:bg-red-50 text-red-500'
                              }`}
                              title={lang === 'kk' ? 'Чатты жою' : lang === 'en' ? 'Delete chat' : 'Удалить чат'}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Chat Messages Timeline Scroll Box */}
            <div
              className={`flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 ${
                isFullscreen ? 'bg-slate-950/60' : 'bg-slate-50/30'
              }`}
            >
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
                      <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-md">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-[88%] sm:max-w-[80%] rounded-3xl p-4 sm:p-5 shadow-2xs ${
                        isUser
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-xs'
                          : isFullscreen
                          ? 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-xs space-y-3'
                          : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-xs space-y-3'
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
                  <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-md">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div
                    className={`rounded-3xl p-4 shadow-2xs text-xs font-bold flex items-center gap-2 ${
                      isFullscreen ? 'bg-slate-900 border border-slate-800 text-slate-300' : 'bg-white border border-slate-200/90 text-slate-600'
                    }`}
                  >
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span>{lang === 'kk' ? 'Engineerus ЖИ есепті шығаруда...' : lang === 'en' ? 'Engineerus AI is solving the problem...' : 'Engineerus AI решает задачу и форматирует ответ...'}</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Chat Composer Input Area */}
            <div
              className={`p-3 sm:p-4 border-t shrink-0 ${
                isFullscreen ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/80'
              }`}
            >
              <div className="flex items-center gap-2">
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendPrompt();
                    }
                  }}
                  rows={2}
                  placeholder={lang === 'kk' ? 'Инженерлік сұрағыңызды қойыңыз (Markdown қолдайды)...' : lang === 'en' ? 'Ask any engineering question (supports Markdown formulas)...' : 'Задайте любой инженерный вопрос (поддерживает Markdown формулы)...'}
                  className={`flex-1 p-3 rounded-2xl border outline-none text-xs sm:text-sm font-medium transition-all resize-none ${
                    isFullscreen
                      ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-blue-500'
                      : 'bg-white border-slate-200 text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20'
                  }`}
                />

                <button
                  onClick={() => handleSendPrompt()}
                  disabled={loading || !promptText.trim()}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-black px-4 sm:px-5 py-3.5 rounded-2xl shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 text-xs shrink-0 h-full min-h-[44px]"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">{lang === 'kk' ? 'Жіберу (+15 XP)' : lang === 'en' ? 'Send (+15 XP)' : 'Отправить (+15 XP)'}</span>
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
                          onClick={() =>
                            setSavedNotes((prev) => prev.filter((n) => n.id !== note.id))
                          }
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
    </div>
  );
};