import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createApp } from "./server/app";
import { loadServerEnv } from "./server/config/env";
import { createSupabaseAccessTokenVerifier } from "./server/auth/supabaseJwt";
import { createRequireAuth } from "./server/middleware/requireAuth";
import { createAiConcurrencyGuard, createAiRateLimit, createAuthenticatedRateLimit, createDocumentUploadRateLimit } from "./server/middleware/authenticatedRateLimit";
import { createChatRepository } from "./server/persistence/chats";
import { createQuestRepository } from "./server/persistence/quests";
import { createChatsRouter } from "./server/routes/chats";
import { createQuestsRouter } from "./server/routes/quests";
import { createAiRouter } from "./server/routes/ai";
import { createGroqResponder } from "./server/ai/groqClient";
import { resolveResponseLanguage } from "./server/ai/languagePolicy";
import { createKazStandardClient } from "./server/standards/kazStandardClient";
import { createStandardsService } from "./server/standards/standardsService";
import { apiErrorHandler } from "./server/middleware/apiErrorHandler";
import { mountProductionFrontend } from "./server/staticFrontend";
import { InMemoryAiCapacityStore } from "./server/security/securityControlStore";
import { securityLogger } from "./server/security/structuredLogger";
import { createBetaRepository } from "./server/persistence/beta";
import { createDocumentRepository } from "./server/persistence/documents";
import { createDocumentsRouter } from "./server/routes/documents";

// Load environment variables from .env for local development. Hosted platforms
// inject their environment variables directly.
dotenv.config();

const env = loadServerEnv(process.env);
const app = createApp(env);
const PORT = env.PORT;
const requireAuth = createRequireAuth(createSupabaseAccessTokenVerifier(env));
const authenticatedRateLimit = createAuthenticatedRateLimit();
const aiRateLimit = createAiRateLimit();
const aiConcurrencyGuard = createAiConcurrencyGuard(new InMemoryAiCapacityStore());
const chatRepository = createChatRepository(env);
const questRepository = createQuestRepository(env);
const betaRepository = createBetaRepository(env);
const documentRepository = createDocumentRepository(env);

app.use(createChatsRouter(requireAuth, authenticatedRateLimit, chatRepository, betaRepository.recordEvent));
app.use(createQuestsRouter(requireAuth, authenticatedRateLimit, questRepository, betaRepository.recordEvent));
app.use(createDocumentsRouter(
  requireAuth,
  authenticatedRateLimit,
  createDocumentUploadRateLimit(),
  documentRepository,
));

const detectLanguage = resolveResponseLanguage;
const generateAIResponse = createGroqResponder({
  apiKey: env.GROQ_API_KEY,
  secondaryApiKey: env.GROQ_API_KEY_2,
  model: env.GROQ_MODEL,
});
const standardsService = createStandardsService({
  enabled: env.KAZSTANDARD_LOOKUP_ENABLED,
  client: createKazStandardClient(),
});

const LEADERBOARD_SEED = [
  { rank: 1, name: "Арман Сериков (Satbayev Univ)", xp: 1450, level: 15, streak: 18 },
  { rank: 2, name: "Алина Киимбаева (AUES)", xp: 1220, level: 13, streak: 14 },
  { rank: 3, name: "Данияр Касымов (NU)", xp: 980, level: 10, streak: 9 },
  { rank: 4, name: "Темирлан Беков (KazNU)", xp: 750, level: 8, streak: 7 },
  { rank: 5, name: "Аружан Муратова (ENU)", xp: 620, level: 7, streak: 5 },
];

app.use(createAiRouter(requireAuth, aiRateLimit, {
  repository: chatRepository,
  detectLanguage,
  generateResponse: generateAIResponse,
  lookupStandards: standardsService.searchVerifiedStandards,
  concurrencyGuard: aiConcurrencyGuard,
  recordEvent: betaRepository.recordEvent,
  loadDocumentContext: documentRepository.loadAiContext,
}));

app.get("/api/leaderboard", (req, res) => res.json({ leaderboard: LEADERBOARD_SEED, total: LEADERBOARD_SEED.length }));

async function startServer() {
  if (env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    mountProductionFrontend(app);
  }
  app.use(apiErrorHandler);
  app.listen(PORT, "0.0.0.0", () => securityLogger.info("server_started", { port: PORT }));
}

startServer();
