import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

//  CORS middleware (ПЕРЕД всеми роутами)
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

//  Улучшенная инициализация 
// === GROQ CLIENT ===
const getGroqClient = () => {
  // Пробуем взять основной ключ, если нет — резервный
  const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_2;
  if (!apiKey) {
    console.warn(" GROQ_API_KEY not found. Using fallback mode.");
    return null;
  }
  return new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: apiKey,
  });
};

// Prompts for Kazakhstan Engineering Tutor
const SYSTEM_PROMPTS: Record<string, string> = {
  ru: `Ты — инженерный ИИ-репетитор (Engineerus Quest) для студентов вузов Казахстана (КазНИТУ, КазНУ, ЕНУ, Назарбаев Университет, АУЭС, САТБАЕВ ИНЖЕНЕРИНГ). 
Отвечай СТРОГО на РУССКОМ языке.
Требования:
1. Отвечай кратко, емко и по существу (120-180 слов).
2. Используй четкие маркированные списки, жирный шрифт и формулы в понятном текстовом виде.
3. Приводи актуальные инженерные примеры с адаптацией к казахстанским условиям (Алматы, Астана, Шымкент, инфраструктура, промышленность).
4. Поддерживай студента в его инженерном квесте и мотивируй получать XP!`,

  kk: `Сен — Қазақстан жоғары оқу орындарының (ҚазҰТЗУ, ҚазҰУ, ЕҰУ, Назарбаев Университеті, АЭЖУ) инженерлік студенттеріне арналған Engineerus Quest ИИ-репетиторысың.
Міндетті түрде тек ҚАЗАҚ ТІЛІНДЕ жауап бер!
Талаптар:
1. МАКСИМАЛДЫ ТҮРДЕ ҚЫСҚА әрі нақты жауап бер (120-180 сөз).
2. Нақты маркерленген тізімдер мен қалың қаріпті қолдан.
3. Қазақстан өнеркәсібі мен инфрақұрылымынан (Алматы, Астана) нақты инженерлік мысалдар келтір.
4. Студентті инженерлік квестте қолдап, XP жинауға ынталандыр!`,

  en: `You are Engineerus Quest — an AI engineering tutor for university students in Kazakhstan (Satbayev University, Nazarbayev University, KazNU, ENU, AUES).
Answer STRICTLY in ENGLISH.
Requirements:
1. Provide concise, clear, and structured answers (120-180 words).
2. Use bullet points, bold text, and clear mathematical expressions.
3. Include relevant real-world engineering examples adapted to Kazakhstan's industrial context.
4. Encourage the student in their engineering quest and praise their XP gains!`,
};

const MODULE_PROMPTS: Record<string, string> = {
  tutor: "Репетитор по общеинженерным дисциплинам (Сопромат, Термех, Математика, Физика).",
  material: "MaterialSwap: Умный подбор инженерных материалов (стали, сплавы, композиты, бетоны) с учетом стандартов Казахстана (ГОСТ, СТ РК, ISO) и доступности на местном рынке.",
  patent: "PatentCraft: Анализ патентной чистоты, составление заявок на патент в Казпатент (NIIP KZ) и генерация формулы изобретения.",
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

//  УЛУЧШЕННАЯ функция генерации ответов ИИ
// === AI RESPONSE GENERATOR (GROQ + FALLBACK) ===
async function generateAIResponse(prompt: string, moduleName = "tutor", lang = "ru"): Promise<string> {
  const client = getGroqClient();

  // 1. Попытка получить ответ от Groq
  if (client) {
    try {
      const systemInstruction = `${SYSTEM_PROMPTS[lang] || SYSTEM_PROMPTS.ru}\n\nСпециализация модуля: ${MODULE_PROMPTS[moduleName] || ""}`;

      const completion = await client.chat.completions.create({
        model: "llama3-70b-8192", // Быстрая и умная модель
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 600, // Ограничение длины
      });

      const aiText = completion.choices[0]?.message?.content?.trim();
      if (aiText) {
        console.log(" Groq response OK");
        return aiText;
      }
    } catch (err: any) {
      console.error(" Groq API Error:", err.message || err);
      // Если ошибка, код упадет вниз к fallback
    }
  }

  // 2. Fallback (если ключа нет или API упал)
  // Возвращаем умный шаблонный ответ, чтобы сайт не ломался
  const cleanPrompt = prompt.trim().slice(0, 100);
  const moduleLabel = MODULE_PROMPTS[moduleName] || "Инженерный разбор";

  if (lang === "kk") {
    return ` **Engineerus AI (Demo Mode)**\n\nСұраныс: "${cleanPrompt}..."\n\n• **Талдау:** Қазақстан стандарттары (ГОСТ/СТ РК) бойынша қаралды.\n• **Кеңес:** Есептеулерді қайта тексеріңіз.\n• **XP:** +15`;
  } else if (lang === "en") {
    return ` **Engineerus AI (Demo Mode)**\n\nQuery: "${cleanPrompt}..."\n\n• **Analysis:** Reviewed per Kazakhstan standards (ISO/ST RK).\n• **Advice:** Double-check your calculations.\n• **XP:** +15`;
  } else {
    return ` **Engineerus AI (Demo Mode)**\n\nЗапрос: "${cleanPrompt}..."\n\n• **Анализ:** Рассмотрено в контексте норм РК (ГОСТ/СТ РК).\n• **Рекомендация:** Проверьте расчёты и коэффициенты запаса.\n• **XP:** +15`;
  }
}

// API Routes
app.post("/api/ai", async (req, res) => {
  const { text, lang = "ru", email = "student@engineerus.kz" } = req.body;
  const user = getOrCreateUser(email);
  const responseText = await generateAIResponse(text, "tutor", lang);
  user.xp += 10;
  user.requests_count += 1;
  user.level = getLevel(user.xp);
  res.json({ status: "ok", response: responseText, xp: user.xp, level: user.level, streak: user.streak, lang });
});

app.post("/api/module", async (req, res) => {
  const { module: moduleName, text, lang = "ru", email = "student@engineerus.kz" } = req.body;
  const user = getOrCreateUser(email);
  if (!user.modules_used.includes(moduleName)) user.modules_used.push(moduleName);
  if (moduleName === "material") user.material_count += 1;
  if (moduleName === "patent") user.patent_count += 1;
  const responseText = await generateAIResponse(text, moduleName, lang);
  user.xp += 15;
  user.requests_count += 1;
  user.level = getLevel(user.xp);
  res.json({ status: "ok", response: responseText, xp: user.xp, level: user.level, lang });
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