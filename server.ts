import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createApp } from "./server/app";
import { loadServerEnv } from "./server/config/env";
import { createSupabaseAccessTokenVerifier } from "./server/auth/supabaseJwt";
import { createRequireAuth } from "./server/middleware/requireAuth";
import { createAuthenticatedRateLimit } from "./server/middleware/authenticatedRateLimit";
import { createChatRepository } from "./server/persistence/chats";
import { createQuestRepository } from "./server/persistence/quests";
import { createChatsRouter } from "./server/routes/chats";
import { createQuestsRouter } from "./server/routes/quests";
import { createAiRouter } from "./server/routes/ai";

// Load environment variables from .env for local development. Hosted platforms
// inject their environment variables directly.
dotenv.config();

const env = loadServerEnv(process.env);
const app = createApp(env);
const PORT = env.PORT;
const requireAuth = createRequireAuth(createSupabaseAccessTokenVerifier(env));
const authenticatedRateLimit = createAuthenticatedRateLimit();
const chatRepository = createChatRepository(env);
const questRepository = createQuestRepository(env);

app.use(createChatsRouter(requireAuth, authenticatedRateLimit, chatRepository));
app.use(createQuestsRouter(requireAuth, authenticatedRateLimit, questRepository));

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

app.use(createAiRouter(requireAuth, authenticatedRateLimit, {
  repository: chatRepository,
  detectLanguage,
  generateResponse: generateAIResponse,
}));

app.get("/api/leaderboard", (req, res) => res.json({ leaderboard: LEADERBOARD_SEED, total: LEADERBOARD_SEED.length }));

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
