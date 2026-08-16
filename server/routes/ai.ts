import { Router, type RequestHandler } from "express";
import type { ChatModule, ChatRepository } from "../persistence/chats";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";
import { createIdempotencyKey } from "../services/progress";

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODULES: readonly ChatModule[] = ["tutor", "material", "patent", "engi_legal", "engi_match"];

type AiDependencies = {
  repository: ChatRepository;
  detectLanguage: (text: string, requestedLanguage: string) => string;
  generateResponse: (text: string, module: ChatModule, language: string) => Promise<string>;
};

export function createAiRouter(
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
  dependencies: AiDependencies,
): Router {
  const router = Router();

  async function handle(
    request: import("express").Request,
    response: import("express").Response,
    moduleName: ChatModule,
    xpAmount: 10 | 15,
  ) {
    const { text, lang = "ru", session_id: sessionId } = request.body;
    if (
      typeof text !== "string"
      || !text.trim()
      || text.length > 20_000
      || typeof sessionId !== "string"
      || !SESSION_ID_PATTERN.test(sessionId)
    ) {
      response.status(400).json({
        error: { code: "invalid_ai_request", message: "A valid chat session and prompt are required." },
      });
      return;
    }

    let requestId: string;
    try {
      requestId = createIdempotencyKey(request.header("idempotency-key"), `ai:${moduleName}`);
    } catch {
      response.status(400).json({
        error: { code: "invalid_idempotency_key", message: "Idempotency-Key is invalid." },
      });
      return;
    }

    try {
      const { userId, accessToken } = response.locals.auth;
      const started = await dependencies.repository.beginExchange(
        userId,
        accessToken,
        sessionId,
        requestId,
        text,
        moduleName,
      );
      const canonicalPrompt = started.userMessage.text;
      const detectedLanguage = dependencies.detectLanguage(canonicalPrompt, lang);

      if (started.assistantMessage) {
        response.json({
          status: "ok",
          response: started.assistantMessage.text,
          user_message: started.userMessage,
          assistant_message: started.assistantMessage,
          ...started.progress,
          lang: detectedLanguage,
          idempotent_replay: true,
        });
        return;
      }

      const responseText = await dependencies.generateResponse(canonicalPrompt, moduleName, detectedLanguage);
      const completed = await dependencies.repository.completeExchange(
        userId,
        accessToken,
        sessionId,
        requestId,
        responseText,
        moduleName,
        xpAmount,
      );

      response.json({
        status: "ok",
        response: completed.assistantMessage?.text ?? responseText,
        user_message: completed.userMessage,
        assistant_message: completed.assistantMessage,
        ...completed.progress,
        lang: detectedLanguage,
        idempotent_replay: completed.awarded === false,
      });
    } catch (error) {
      if (error instanceof PersistenceError) {
        sendPersistenceError(response, error);
        return;
      }
      response.status(503).json({
        error: { code: "ai_unavailable", message: "The AI service is temporarily unavailable." },
      });
    }
  }

  router.post("/api/ai", authenticate, rateLimiter, (request, response) => (
    handle(request, response, "tutor", 10)
  ));

  router.post("/api/module", authenticate, rateLimiter, (request, response) => {
    const moduleName = request.body?.module;
    if (typeof moduleName !== "string" || !MODULES.includes(moduleName as ChatModule)) {
      response.status(400).json({
        error: { code: "invalid_module_request", message: "A valid module is required." },
      });
      return;
    }
    return handle(request, response, moduleName as ChatModule, 15);
  });

  return router;
}
