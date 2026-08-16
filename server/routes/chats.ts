import { Router, type RequestHandler } from "express";
import {
  CHAT_MODULES,
  type ChatModule,
  type ChatRepository,
} from "../persistence/chats";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseSessionId(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new PersistenceError(400, "invalid_session_id", "Chat session ID is invalid.");
  return value;
}

function parseModule(value: unknown): ChatModule {
  if (typeof value !== "string" || !CHAT_MODULES.includes(value as ChatModule)) {
    throw new PersistenceError(400, "invalid_chat_module", "Chat module is invalid.");
  }
  return value as ChatModule;
}

function parseTitle(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 200) {
    throw new PersistenceError(400, "invalid_chat_title", "Chat title must contain 1 to 200 characters.");
  }
  return value.trim();
}

export function createChatsRouter(
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
  repository: ChatRepository,
): Router {
  const router = Router();

  router.get("/api/chats", authenticate, rateLimiter, async (_request, response) => {
    try {
      const { userId, accessToken } = response.locals.auth;
      response.json({ sessions: await repository.list(userId, accessToken) });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.post("/api/chats", authenticate, rateLimiter, async (request, response) => {
    try {
      const { userId, accessToken } = response.locals.auth;
      const session = await repository.create(
        userId,
        accessToken,
        parseTitle(request.body?.title),
        parseModule(request.body?.module ?? "tutor"),
      );
      response.status(201).json({ session });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.get("/api/chats/:sessionId/messages", authenticate, rateLimiter, async (request, response) => {
    try {
      const { userId, accessToken } = response.locals.auth;
      const messages = await repository.messages(
        userId,
        accessToken,
        parseSessionId(request.params.sessionId),
      );
      response.json({ messages });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.patch("/api/chats/:sessionId", authenticate, rateLimiter, async (request, response) => {
    try {
      const changes: { title?: string; module?: ChatModule } = {};
      if (request.body?.title !== undefined) changes.title = parseTitle(request.body.title);
      if (request.body?.module !== undefined) changes.module = parseModule(request.body.module);
      if (!changes.title && !changes.module) {
        throw new PersistenceError(400, "empty_chat_update", "No supported chat changes were provided.");
      }
      const { userId, accessToken } = response.locals.auth;
      const session = await repository.update(
        userId,
        accessToken,
        parseSessionId(request.params.sessionId),
        changes,
      );
      response.json({ session });
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  router.delete("/api/chats/:sessionId", authenticate, rateLimiter, async (request, response) => {
    try {
      const { userId, accessToken } = response.locals.auth;
      await repository.remove(userId, accessToken, parseSessionId(request.params.sessionId));
      response.status(204).end();
    } catch (error) {
      sendPersistenceError(response, error);
    }
  });

  return router;
}
