import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createApp } from "./server/app";
import { loadServerEnv } from "./server/config/env";
import { createSupabaseAccessTokenVerifier } from "./server/auth/supabaseJwt";
import { createRequireAuth } from "./server/middleware/requireAuth";
import { createAuthenticatedRateLimit } from "./server/middleware/authenticatedRateLimit";
import { completeUserQuest, createIdempotencyKey, recordAiUsage } from "./server/services/progress";

// Load environment variables from .env for local development. Hosted platforms
// inject their environment variables directly.
dotenv.config();

const env = loadServerEnv(process.env);
const app = createApp(env);
const PORT = env.PORT;
const requireAuth = createRequireAuth(createSupabaseAccessTokenVerifier(env));
const authenticatedRateLimit = createAuthenticatedRateLimit();

// === GROQ CLIENT ===
const getGroqKey = () => env.GROQ_API_KEY || env.GROQ_API_KEY_2;
const GROQ_MODEL = env.GROQ_MODEL;
const GROQ_FALLBACK_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
];
const GROQ_MODEL_FALLBACK_STATUSES = new Set([400, 404]);

// === УЛУЧШЕННОЕ ОПРЕДЕЛЕНИЕ ЯЗЫКА ===
function detectLanguage(text: string, requestedLang: string = "ru"): string {
  if (!text) return requestedLang;
  
  // Считаем количество символов каждой раскладки
  const kazakhChars = (text.match(/[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/g) || []).length;
  const cyrillicChars = (text.match(/[а-яА-ЯёЁ]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;

  // Казахские буквы имеют высший приоритет
  if (kazakhChars > 0) {
    return "kk";
  }
  
  // Сравниваем кириллицу и латиницу по количеству
  // Если кириллицы больше — русский (даже если есть английские термины)
  if (cyrillicChars > latinChars) {
    return "ru";
  }
  
  // Если латиницы больше — английский
  if (latinChars > cyrillicChars) {
    return "en";
  }
  
  // Если поровну или нет букв — используем запрошенный язык
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
3. ОБЯЗАТЕЛЬНО ссылайся на действующие государственные стандарты Республики Казахстан (ГОСТ РК, СТ РК, ЕСКД, СП РК, ТР ТС) при расчетах, оформлении и выборе материалов.
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

// Temporary compatibility cache. It is keyed only by verified JWT sub and will
// be replaced by the already-defined PostgreSQL chat tables in the persistence block.
const userChatsDb: Map<string, ChatSessionData[]> = new Map();

const getOrCreateUserChats = (userId: string): ChatSessionData[] => {
  if (!userChatsDb.has(userId)) {
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
    userChatsDb.set(userId, [defaultSession]);
  }
  return userChatsDb.get(userId)!;
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
  
  // Автоматическое определение языка запроса
  const lang = detectLanguage(prompt, requestedLang);

  if (!apiKey) {
    console.log(" GROQ KEY NOT FOUND. Using Fallback.");
    return ` **Engineerus AI (Demo Mode)**\n\nЗапрос: "${prompt.slice(0, 50)}..."\n\n• Анализ: Демо-ответ. Проверьте расчёты.\n• XP: +15`;
  }

  const baseSystemPrompt = SYSTEM_PROMPTS[lang] || SYSTEM_PROMPTS.ru;
  const moduleInfo = MODULE_PROMPTS[moduleName] || MODULE_PROMPTS.tutor;

  // Жесткая инструкция с фиксацией языка
  const languageInstruction = lang === 'kk'
    ? 'ЖАУАПТЫ ТЕК ҚАЗАҚ ТІЛІНДЕ ЖАЗ! АҒЫЛШЫН ТІЛІН ҚОЛДАНУҒА ТЫЙЫМ САЛЫНАДЫ!'
    : lang === 'en'
      ? 'WRITE THE ENTIRE RESPONSE ONLY IN ENGLISH! DO NOT USE ANY OTHER LANGUAGE!'
      : 'НАПИШИ ВЕСЬ ОТВЕТ ИСКЛЮЧИТЕЛЬНО НА РУССКОМ ЯЗЫКЕ! ИСПОЛЬЗОВАНИЕ АНГЛИЙСКОГО ЯЗЫКА ЗАПРЕЩЕНО!';

  const systemInstruction = `${baseSystemPrompt}\n\nСпециализация модуля: ${moduleInfo}\n\n[ЯЗЫКОВОЙ ПРИКАЗ]: ${languageInstruction}`;
  const modelCandidates = [...new Set([GROQ_MODEL, ...GROQ_FALLBACK_MODELS])];

  for (let attempt = 0; attempt < modelCandidates.length; attempt++) {
    const model = modelCandidates[attempt];
    console.log(`📨 Sending request to Groq API (${model}) | Detected lang: [${lang}] | Attempt: ${attempt + 1}/${modelCandidates.length}`);

    let response: Response;
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemInstruction },
            {
              role: "user",
              content: `${prompt}\n\n[SYSTEM INSTRUCTION: You MUST reply in ${lang === 'ru' ? 'Russian' : lang === 'kk' ? 'Kazakh' : 'English'} language only. Do not use any other language.]`
            }
          ],
          temperature: 0.2,
          max_tokens: 600
        })
      });
    } catch (error: any) {
      // Network failures are not retried across models because they are not
      // model-specific and doing so would only multiply traffic and latency.
      console.error(`Groq network error [model=${model}]:`, error.message);
      break;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData?.error?.message || "Unknown Groq error";
      console.error(`Groq API error [model=${model}, status=${response.status}]:`, errorMessage);

      const hasAnotherModel = attempt < modelCandidates.length - 1;
      if (hasAnotherModel && GROQ_MODEL_FALLBACK_STATUSES.has(response.status)) {
        continue;
      }

      // Rate limits, server errors, permission errors, and all other statuses
      // are non-retryable here. In particular, a 429 is never retried blindly.
      break;
    }

    let data: any;
    try {
      data = await response.json();
    } catch (error: any) {
      // A malformed successful response is not model-specific, so do not retry
      // another model. Fall through to the existing user-facing fallback.
      console.error(`Groq returned malformed JSON [model=${model}]:`, error.message);
      break;
    }

    const aiText = data.choices?.[0]?.message?.content?.trim();

    if (aiText) {
      return aiText;
    }

    // An empty successful response is not assumed to be model-specific.
    console.error(`Groq returned an empty response [model=${model}].`);
    break;
  }

  const cleanPrompt = prompt.trim().slice(0, 50);
  return ` **Engineerus AI (Fallback)**\n\nЗапрос: "${cleanPrompt}..."\n\n• Анализ: Не удалось получить ответ от ИИ.\n• Рекомендация: Повторите попытку.`;
}

// API Routes
app.post("/api/ai", requireAuth, authenticatedRateLimit, async (req, res) => {
  const { text, lang = "ru" } = req.body;
  if (typeof text !== "string" || !text.trim() || text.length > 20_000) {
    return res.status(400).json({ error: { code: "invalid_prompt", message: "A valid prompt is required." } });
  }

  let idempotencyKey: string;
  try {
    idempotencyKey = createIdempotencyKey(req.header("idempotency-key"), "ai:tutor");
  } catch {
    return res.status(400).json({ error: { code: "invalid_idempotency_key", message: "Idempotency-Key is invalid." } });
  }

  try {
    const detectedLang = detectLanguage(text, lang);
    const responseText = await generateAIResponse(text, "tutor", detectedLang);
    const progress = await recordAiUsage(
      env,
      res.locals.auth.userId,
      "tutor",
      10,
      idempotencyKey,
    );
    return res.json({ status: "ok", response: responseText, ...progress, lang: detectedLang });
  } catch {
    return res.status(503).json({ error: { code: "ai_unavailable", message: "The AI service is temporarily unavailable." } });
  }
});

app.post("/api/module", requireAuth, authenticatedRateLimit, async (req, res) => {
  const { module: moduleName, text, lang = "ru" } = req.body;
  const allowedModules = new Set(["tutor", "material", "patent", "engi_legal", "engi_match"]);
  if (typeof text !== "string" || !text.trim() || text.length > 20_000 || !allowedModules.has(moduleName)) {
    return res.status(400).json({ error: { code: "invalid_module_request", message: "A valid module request is required." } });
  }

  let idempotencyKey: string;
  try {
    idempotencyKey = createIdempotencyKey(req.header("idempotency-key"), `ai:${moduleName}`);
  } catch {
    return res.status(400).json({ error: { code: "invalid_idempotency_key", message: "Idempotency-Key is invalid." } });
  }

  try {
    const detectedLang = detectLanguage(text, lang);
    const responseText = await generateAIResponse(text, moduleName, detectedLang);
    const progress = await recordAiUsage(
      env,
      res.locals.auth.userId,
      moduleName,
      15,
      idempotencyKey,
    );
    return res.json({ status: "ok", response: responseText, ...progress, lang: detectedLang });
  } catch {
    return res.status(503).json({ error: { code: "ai_unavailable", message: "The AI service is temporarily unavailable." } });
  }
});

app.get("/api/chats", requireAuth, authenticatedRateLimit, (_req, res) => {
  res.json({ status: "ok", chats: getOrCreateUserChats(res.locals.auth.userId) });
});

app.post("/api/chats/save", requireAuth, authenticatedRateLimit, (req, res) => {
  const { session } = req.body;
  if (!session?.id) return res.status(400).json({ error: "Session required" });
  const userId = res.locals.auth.userId;
  const chats = getOrCreateUserChats(userId);
  const idx = chats.findIndex(s => s.id === session.id);
  if (idx >= 0) chats[idx] = session; else chats.unshift(session);
  userChatsDb.set(userId, chats);
  res.json({ status: "ok", chats });
});

app.post("/api/chats/new", requireAuth, authenticatedRateLimit, (req, res) => {
  const { module = "tutor", title } = req.body;
  const userId = res.locals.auth.userId;
  const chats = getOrCreateUserChats(userId);
  const newSession: ChatSessionData = {
    id: 'session_' + Date.now(),
    title: title || `Новый сеанс (${chats.length + 1})`,
    module,
    createdAt: new Date().toLocaleDateString('ru-RU'),
    updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    messages: [{ id: 'welcome_' + Date.now(), sender: 'ai', module, text: 'Новый чат создан! Пожалуйста, напишите ваш инженерный вопрос.', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }],
  };
  chats.unshift(newSession);
  userChatsDb.set(userId, chats);
  res.json({ status: "ok", newSession, chats });
});

app.delete("/api/chats/:sessionId", requireAuth, authenticatedRateLimit, (req, res) => {
  const { sessionId } = req.params;
  const userId = res.locals.auth.userId;
  const chats = getOrCreateUserChats(userId).filter(s => s.id !== sessionId);
  userChatsDb.set(userId, chats);
  res.json({ status: "ok", chats });
});

app.patch("/api/chats/rename", requireAuth, authenticatedRateLimit, (req, res) => {
  const { sessionId, newTitle } = req.body;
  const chats = getOrCreateUserChats(res.locals.auth.userId);
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

app.post("/api/quests/complete", requireAuth, authenticatedRateLimit, async (req, res) => {
  const { quest_id: questId } = req.body;
  if (typeof questId !== "string" || !/^[a-z0-9_-]{1,100}$/.test(questId)) {
    return res.status(400).json({ error: { code: "invalid_quest", message: "A valid quest is required." } });
  }

  try {
    const result = await completeUserQuest(env, res.locals.auth.userId, questId);
    return res.json({ status: "ok", ...result });
  } catch {
    return res.status(503).json({ error: { code: "quest_unavailable", message: "Quest completion is temporarily unavailable." } });
  }
});

async function startServer() {
  if (env.NODE_ENV !== "production") {
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
