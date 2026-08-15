import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS middleware (ПЕРЕД всеми роутами)
app.use(cors({
  origin: [
    'https://engineerus-quest.vercel.app',
    'https://engineerus-quest-git-main-enginnerus.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// === GROQ CLIENT ===
const getGroqKey = () => process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_2;
const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.6-27b";

// Функция автоматического определения языка запроса
function detectLanguage(text: string, requestedLang: string = "ru"): string {
  if (!text) return requestedLang;
  
  // Казахские специфические буквы
  const kazakhRegex = /[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/;
  // Любые кириллические буквы (русский язык)
  const cyrillicRegex = /[а-яА-ЯёЁ]/;
  // Латинские буквы (английский язык)
  const latinRegex = /[a-zA-Z]/;

  // Приоритет: если есть казахские буквы — казахский
  if (kazakhRegex.test(text)) {
    return "kk";
  }
  // Если есть кириллица — русский
  if (cyrillicRegex.test(text)) {
    return "ru";
  }
  // Если есть латиница — английский
  if (latinRegex.test(text)) {
    return "en";
  }
  
  // Если в тексте только цифры/символы, оставляем запрошенный язык
  return requestedLang;
}

// Prompts for Kazakhstan Engineering Tutor
const SYSTEM_PROMPTS: Record<string, string> = {
  ru: `Ты — инженерный ИИ-репетитор (Engineerus Quest) для студентов вузов Казахстана (КазНИТУ, КазНУ, ЕНУ, Назарбаев Университет, АУЭС, САТБАЕВ ИНЖЕНЕРИНГ). 

СТРОГОЕ ПРАВИЛО ЯЗЫКА:
Отвечай ИСКЛЮЧИТЕЛЬНО НА РУССКОМ ЯЗЫКЕ. Категорически запрещено использовать английский язык для ответа (за исключением терминов и аббревиатур XP, ISO, ГОСТ).

Требования к ответу:
1. Отвечай кратко, структурированно и по существу (120-180 слов).
2. Используй четкие маркированные списки, жирный шрифт и понятный формат формул.
3. ОБЯАТЕЛЬНО ссылайся на действующие государственные стандарты Республики Казахстан (ГОСТ РК, СТ РК, ЕСКД, СП РК, ТР ТС) при расчетах, оформлении и выборе материалов.
4. Приводи актуальные инженерные примеры с адаптацией к казахстанским условиям (Алматы, Астана, Шымкент, инфраструктура, промышленность).
5. Поддерживай студента в его инженерном квесте и мотивируй получать XP!`,

  kk: `Сен — Қазақстан жоғары оқу орындарының (ҚазҰТЗУ, ҚазҰУ, ЕҰУ, Назарбаев Университеті, АЭЖУ) инженерлік студенттеріне арналған Engineerus Quest ИИ-репетиторысың.

ТІЛ БОЙЫНША ҚАТАҢ ТАЛАП:
Міндетті түрде ТЕК ҚАЗАҚ ТІЛІНДЕ жауап бер! Ағылшын тілін қолдануға ТЫЙЫМ САЛЫНАДЫ (XP, ISO, МЕМСТ сияқты аббревиатуралардан басқа).

Талаптар:
1. Жауапты МАКСИМАЛДЫ ТҮРДЕ ҚЫСҚА әрі нақты бер (120-180 сөз).
2. Нақты маркерленген тізімдер мен қалың қаріпті қолдан.
3. Жауаптарда Қазақстан Республикасының мемлекеттік стандарттарына (ҚР МЕМСТ, ҚР СТ, АҚЖҚ/ЕСКД) міндетті түрде сілтеме жаса.
4. Қазақстан өнеркәсібі мен инфрақұрылымынан нақты инженерлік мысалдар келтір.
5. Студентті инженерлік квестте қолдап, XP жинауға ынталандыр!`,

  en: `You are Engineerus Quest — an AI engineering tutor for university students in Kazakhstan (Satbayev University, Nazarbayev University, KazNU, ENU, AUES).

STRICT LANGUAGE RULE:
Answer STRICTLY and EXCLUSIVELY in ENGLISH.

Requirements:
1. Provide concise, clear, and structured answers (120-180 words).
2. Use bullet points, bold text, and clear mathematical expressions.
3. ALWAYS align answers and engineering calculations with state standards of Republic of Kazakhstan (GOST RK, ST RK, ESKD norms).
4. Include relevant real-world engineering examples adapted to Kazakhstan's industrial context.
5. Encourage the student in their engineering quest and praise their XP gains!`,
};

const MODULE_PROMPTS: Record<string, string> = {
  tutor: "Репетитор по общеинженерным дисциплинам (Сопромат, Термех, Математика, Физика). Выполняет точные расчеты по формулам со ссылками на соответствующие ГОСТы и нормы ЕСКД.",
  material: "MaterialSwap: Умный подбор инженерных материалов (стали, сплавы, композиты, бетоны) с учетом стандартов Казахстана (ГОСТ РК, СТ РК, ISO) и доступности на местном рынке.",
  patent: "PatentCraft: Анализ патентной чистоты, составление заявок на патент в Казпатент (NIIP KZ) и генерация формулы изобретения согласно законам РК и ГОСТам оформления.",
  engi_legal: "EngiLegal: Проверка инженерных договоров, ГОСТов, СНиП, ТР ТС и регламентов промышленной безопасности Казахстана.",
  engi_match: "EngiMatch: Поиск единомышленников, распределение ролей в инженерном стартапе/дипломном проекте (Mechanical, Electrical, Software, Civil).",
};

// In-Memory Database Store
interface UserState {
  id: number;
  telegram_id: number;
  username: string;
  email: string;
  xp: number;
  level: number;
  streak: number;
  completed_quests: string[];
  achievements: string[];
  requests_count: number;
  material_count: number;
  patent_count: number;
  modules_used: string[];
  preferred_lang: string;
}

const usersDb: Map<string, UserState> = new Map();

interface ChatMessageData {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  module: string;
  timestamp: string;
  xpEarned?: number;
  queryForAi?: string;
}

interface ChatSessionData {
  id: string;
  title: string;
  module: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageData[];
}

const userChatsDb: Map<string, ChatSessionData[]> = new Map();

const getOrCreateUserChats = (email: string): ChatSessionData[] => {
  if (!userChatsDb.has(email)) {
    const defaultSession: ChatSessionData = {
      id: 'session_default_1',
      title: 'Инженерный консилиум (Главный)',
      module: 'tutor',
      createdAt: new Date().toLocaleDateString('ru-RU'),
      updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      messages: [
        {
          id: 'welcome-msg',
          sender: 'ai',
          module: 'tutor',
          text: 'Здравствуйте! Я ваш инженерный ИИ-тьютор **Engineerus**. Выберите модуль выше или задайте вопрос по сопромату, ГОСТ РК, материалам или патентам.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    };
    userChatsDb.set(email, [defaultSession]);
  }
  return userChatsDb.get(email)!;
};

const getLevel = (xp: number) => Math.floor(xp / 100) + 1;

const getOrCreateUser = (emailOrTg: string | number): UserState => {
  const key = String(emailOrTg);
  if (!usersDb.has(key)) {
    usersDb.set(key, {
      id: Math.floor(Math.random() * 90000) + 10000,
      telegram_id: typeof emailOrTg === 'number' ? emailOrTg : 777001,
      username: typeof emailOrTg === 'string' && emailOrTg.includes('@') ? emailOrTg.split('@')[0] : "Student_Engineer",
      email: typeof emailOrTg === 'string' && emailOrTg.includes('@') ? emailOrTg : "student@engineerus.kz",
      xp: 40,
      level: 1,
      streak: 3,
      completed_quests: ["first_contact"],
      achievements: ["first_step"],
      requests_count: 2,
      material_count: 1,
      patent_count: 0,
      modules_used: ["tutor", "material"],
      preferred_lang: "ru",
    });
  }
  return usersDb.get(key)!;
};

const LEADERBOARD_SEED = [
  { rank: 1, name: "Арман Сериков (Satbayev Univ)", xp: 1450, level: 15, streak: 18 },
  { rank: 2, name: "Алина Киимбаева (AUES)", xp: 1220, level: 13, streak: 14 },
  { rank: 3, name: "Данияр Касымов (NU)", xp: 980, level: 10, streak: 9 },
  { rank: 4, name: "Темирлан Беков (KazNU)", xp: 750, level: 8, streak: 7 },
  { rank: 5, name: "Аружан Муратова (ENU)", xp: 620, level: 7, streak: 5 },
];

// === AI RESPONSE GENERATOR ===
async function generateAIResponse(prompt: string, moduleName = "tutor", requestedLang = "ru"): Promise<string> {
  const apiKey = getGroqKey();
  
  // Автоматическое определение языка запроса (гарантирует отклики на нужном языке при вводе символов)
  const lang = detectLanguage(prompt, requestedLang);

  if (!apiKey) {
    console.log(" GROQ KEY NOT FOUND. Using Fallback.");
    return ` **Engineerus AI (Demo Mode)**\n\nЗапрос: "${prompt.slice(0, 50)}..."\n\n• Анализ: Демо-ответ. Проверьте расчёты.\n• XP: +15`;
  }

  try {
    const baseSystemPrompt = SYSTEM_PROMPTS[lang] || SYSTEM_PROMPTS.ru;
    const moduleInfo = MODULE_PROMPTS[moduleName] || MODULE_PROMPTS.tutor;
    
    // Формируем жесткую инструкцию с фиксацией языка
    const languageInstruction = lang === 'kk' 
      ? 'ЖАУАПТЫ ТЕК ҚАЗАҚ ТІЛІНДЕ ЖАЗ!' 
      : lang === 'en' 
      ? 'WRITE THE ENTIRE RESPONSE ONLY IN ENGLISH!' 
      : 'НАПИШИ ВЕСЬ ОТВЕТ ИСКЛЮЧИТЕЛЬНО НА РУССКОМ ЯЗЫКЕ!';

    const systemInstruction = `${baseSystemPrompt}\n\nСпециализация модуля: ${moduleInfo}\n\n[ЯЗЫКОВОЙ ПРИКАЗ]: ${languageInstruction}`;
    
    console.log(` Sending request to Groq API (${GROQ_MODEL}) in language: [${lang}]...`);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemInstruction },
          { 
            role: "user", 
            // Дублируем приказ на языке ответа прямо в пользовательском промпте для надежности
            content: `${prompt}\n\n[SYSTEM INSTRUCTION: You MUST reply in ${lang === 'ru' ? 'Russian' : lang === 'kk' ? 'Kazakh' : 'English'} language only. Do not use any other language.]`
          }
        ],
        temperature: 0.2,
        max_tokens: 600
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(" Groq API Error:", response.status, errorData);
      throw new Error(`Groq API failed: ${response.status}`);
    }

    const data = await response.json();
    const aiText = data.choices?.[0]?.message?.content?.trim();

    if (aiText) {
      return aiText;
    } else {
      throw new Error("Empty response");
    }

  } catch (error: any) {
    console.error(" Error during fetch:", error.message);
    const cleanPrompt = prompt.trim().slice(0, 50);
    return ` **Engineerus AI (Fallback)**\n\nЗапрос: "${cleanPrompt}..."\n\n• Анализ: Не удалось получить ответ от ИИ.\n• Рекомендация: Повторите попытку.`;
  }
}

// Роут диагностики
app.get("/api/debug-groq", async (req, res) => {
  const key = getGroqKey();
  if (!key) return res.json({ error: "API Key not found" });

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: "Ответь ровно одним словом по-русски: Готов" }],
        max_tokens: 10
      })
    });

    const data = await response.json();
    return res.json({
      status: response.status,
      ok: response.ok,
      model_used: GROQ_MODEL,
      response: data.choices?.[0]?.message?.content || "EMPTY"
    });
  } catch (e: any) {
    return res.json({ error: e.message });
  }
});

// API Routes
app.post("/api/ai", async (req, res) => {
  const { text, lang = "ru", email = "student@engineerus.kz" } = req.body;
  const user = getOrCreateUser(email);
  const detectedLang = detectLanguage(text, lang);
  const responseText = await generateAIResponse(text, "tutor", detectedLang);
  user.xp += 10;
  user.requests_count += 1;
  user.level = getLevel(user.xp);
  res.json({ status: "ok", response: responseText, xp: user.xp, level: user.level, streak: user.streak, lang: detectedLang });
});

app.post("/api/module", async (req, res) => {
  const { module: moduleName, text, lang = "ru", email = "student@engineerus.kz" } = req.body;
  const user = getOrCreateUser(email);
  if (!user.modules_used.includes(moduleName)) user.modules_used.push(moduleName);
  if (moduleName === "material") user.material_count += 1;
  if (moduleName === "patent") user.patent_count += 1;
  const detectedLang = detectLanguage(text, lang);
  const responseText = await generateAIResponse(text, moduleName, detectedLang);
  user.xp += 15;
  user.requests_count += 1;
  user.level = getLevel(user.xp);
  res.json({ status: "ok", response: responseText, xp: user.xp, level: user.level, lang: detectedLang });
});

app.get("/api/user/:idOrEmail", (req, res) => res.json(getOrCreateUser(req.params.idOrEmail)));
app.get("/api/user/by-email/:email", (req, res) => res.json(getOrCreateUser(req.params.email)));

app.post("/api/auth/web/register", (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password) return res.status(400).json({ detail: "Email and password required" });
  const user = getOrCreateUser(email);
  if (username) user.username = username;
  res.json({ status: "ok", user });
});

app.post("/api/auth/web/login", (req, res) => {
  const { email } = req.body;
  res.json({ status: "ok", user: getOrCreateUser(email || "student@engineerus.kz") });
});

app.post("/api/auth/bind", (req, res) => {
  const { email, telegram_id } = req.body;
  const user = getOrCreateUser(email || "student@engineerus.kz");
  if (telegram_id) user.telegram_id = Number(telegram_id);
  res.json({ status: "ok", message: "Account bound successfully", user });
});

app.get("/api/chats/:email", (req, res) => {
  const email = req.params.email || "student@engineerus.kz";
  res.json({ status: "ok", chats: getOrCreateUserChats(email) });
});

app.post("/api/chats/save", (req, res) => {
  const { email = "student@engineerus.kz", session } = req.body;
  if (!session?.id) return res.status(400).json({ error: "Session required" });
  const chats = getOrCreateUserChats(email);
  const idx = chats.findIndex(s => s.id === session.id);
  if (idx >= 0) chats[idx] = session; else chats.unshift(session);
  userChatsDb.set(email, chats);
  res.json({ status: "ok", chats });
});

app.post("/api/chats/new", (req, res) => {
  const { email = "student@engineerus.kz", module = "tutor", title } = req.body;
  const chats = getOrCreateUserChats(email);
  const newSession: ChatSessionData = {
    id: 'session_' + Date.now(),
    title: title || `Новый сеанс (${chats.length + 1})`,
    module,
    createdAt: new Date().toLocaleDateString('ru-RU'),
    updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    messages: [{ id: 'welcome_' + Date.now(), sender: 'ai', module, text: 'Новый чат создан! Пожалуйста, напишите ваш инженерный вопрос.', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }],
  };
  chats.unshift(newSession);
  userChatsDb.set(email, chats);
  res.json({ status: "ok", newSession, chats });
});

app.delete("/api/chats/:email/:sessionId", (req, res) => {
  const { email, sessionId } = req.params;
  let chats = getOrCreateUserChats(email).filter(s => s.id !== sessionId);
  if (chats.length === 0) chats = getOrCreateUserChats(email);
  userChatsDb.set(email, chats);
  res.json({ status: "ok", chats });
});

app.patch("/api/chats/rename", (req, res) => {
  const { email = "student@engineerus.kz", sessionId, newTitle } = req.body;
  const chats = getOrCreateUserChats(email);
  const target = chats.find(s => s.id === sessionId);
  if (target && newTitle) { target.title = newTitle; target.updatedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  res.json({ status: "ok", chats });
});

app.get("/api/leaderboard", (req, res) => res.json({ leaderboard: LEADERBOARD_SEED, total: LEADERBOARD_SEED.length }));

app.get("/api/quests", (req, res) => {
  const QUESTS = {
    first_contact: { id: "first_contact", name: "Первый контакт", name_kk: "Алғашқы байланыс", name_en: "First Contact", desc: "Задай вопрос ИИ-репетитору", desc_kk: "ЖИ-репетиторға алғашқы сұрауды жібер", desc_en: "Ask your first question to AI Tutor", xp: 20, reward: "Бейдж Новичок" },
    material_scout: { id: "material_scout", name: "Поиск материала", name_kk: "Материал іздеу", name_en: "Material Scout", desc: "Используй модуль MaterialSwap", desc_kk: "MaterialSwap модулін қолдан", desc_en: "Use the MaterialSwap module", xp: 30, reward: "Бейдж Исследователь" },
    streak_master: { id: "streak_master", name: "Серия побед", name_kk: "Жеңіс сериясы", name_en: "Streak Master", desc: "Удерживай стрик 3 дня подряд", desc_kk: "3 күн қатарынан кір", desc_en: "Maintain a 3-day streak", xp: 50, reward: "Бейдж Постоянец" },
    xp_hunter: { id: "xp_hunter", name: "Охотник за XP", name_kk: "XP аңшысы", name_en: "XP Hunter", desc: "Набери 100 XP", desc_kk: "100 XP жина", desc_en: "Earn 100 XP", xp: 40, reward: "Бейдж Опытный" },
    module_explorer: { id: "module_explorer", name: "Инженер-универсал", name_kk: "Модуль зерттеушісі", name_en: "Module Explorer", desc: "Используй все 5 инженерных модулей", desc_kk: "Барлық 5 модульді қолдан", desc_en: "Try all 5 engineering modules", xp: 100, reward: "Бейдж Мастер" },
  };
  res.json({ quests: QUESTS, total: 5 });
});

const QUEST_BADGES: Record<string, string> = {
  first_contact: 'Бейдж Новичок', material_scout: 'Бейдж Исследователь', streak_master: 'Бейдж Постоянец', xp_hunter: 'Бейдж Опытный', module_explorer: 'Бейдж Универсал',
};

app.post("/api/quests/complete", (req, res) => {
  const { quest_id, email = "student@engineerus.kz" } = req.body;
  const user = getOrCreateUser(email);
  if (!user.completed_quests.includes(quest_id)) {
    user.completed_quests.push(quest_id);
    const badge = QUEST_BADGES[quest_id];
    if (badge && !user.achievements.includes(badge)) user.achievements.push(badge);
    user.xp += 30; user.level = getLevel(user.xp);
  }
  res.json({ status: "ok", message: "Квест выполнен! +30 XP", new_xp: user.xp, new_level: user.level, achievements: user.achievements, completed_quests: user.completed_quests });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Engineerus Quest server running on http://0.0.0.0:${PORT}`));
}

startServer();