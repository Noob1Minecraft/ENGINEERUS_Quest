import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";
import type { ConversationCursor, DirectChatRepository, MessageCursor } from "../persistence/directChats";

const uuid = z.string().uuid();
const createSchema = z.object({ target_profile_id: uuid, project_id: uuid.nullish() }).strict();
const sendSchema = z.object({ client_message_id: uuid, content: z.string().trim().min(1).max(4000) }).strict();
const pageSchema = z.object({ limit: z.coerce.number().int().min(1).max(25).default(25), cursor: z.string().optional() }).strict();
const messagePageSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().optional() }).strict();

function encode(value: object | null) {
  return value ? Buffer.from(JSON.stringify(value), "utf8").toString("base64url") : null;
}
function decode<T>(value: string | undefined, fields: string[]): T | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (!fields.every((field) => typeof parsed[field] === "string")) throw new Error();
    return parsed as T;
  } catch {
    throw new PersistenceError(400, "invalid_direct_chat_cursor", "The pagination cursor is invalid.");
  }
}

export function createDirectChatsRouter(
  authenticate: RequestHandler,
  readRateLimit: RequestHandler,
  createRateLimit: RequestHandler,
  writeRateLimit: RequestHandler,
  repository: DirectChatRepository,
): Router {
  const router = Router();
  router.post("/api/direct-conversations", authenticate, createRateLimit, async (request, response) => {
    try {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) throw new PersistenceError(400, "invalid_direct_conversation", "A valid target profile is required.");
      response.status(201).json(await repository.getOrCreate(response.locals.auth.accessToken, parsed.data.target_profile_id, parsed.data.project_id));
    } catch (error) { sendPersistenceError(response, error); }
  });
  router.get("/api/direct-conversations", authenticate, readRateLimit, async (request, response) => {
    try {
      const parsed = pageSchema.safeParse(request.query);
      if (!parsed.success) throw new PersistenceError(400, "invalid_direct_chat_query", "Direct conversation parameters are invalid.");
      const result = await repository.list(response.locals.auth.accessToken, parsed.data.limit,
        decode<ConversationCursor>(parsed.data.cursor, ["updatedAt", "id"]));
      response.json({ ...result, next_cursor: encode(result.next_cursor) });
    } catch (error) { sendPersistenceError(response, error); }
  });
  router.get("/api/direct-conversations/:conversationId/messages", authenticate, readRateLimit, async (request, response) => {
    try {
      const conversationId = uuid.safeParse(request.params.conversationId);
      const parsed = messagePageSchema.safeParse(request.query);
      if (!conversationId.success || !parsed.success) throw new PersistenceError(400, "invalid_direct_message_query", "Direct message parameters are invalid.");
      const result = await repository.listMessages(response.locals.auth.accessToken, conversationId.data, parsed.data.limit,
        decode<MessageCursor>(parsed.data.cursor, ["createdAt", "id"]));
      response.json({ ...result, next_cursor: encode(result.next_cursor) });
    } catch (error) { sendPersistenceError(response, error); }
  });
  router.post("/api/direct-conversations/:conversationId/messages", authenticate, writeRateLimit, async (request, response) => {
    try {
      const conversationId = uuid.safeParse(request.params.conversationId);
      const parsed = sendSchema.safeParse(request.body);
      if (!conversationId.success || !parsed.success) throw new PersistenceError(400, "invalid_direct_message", "A valid message is required.");
      response.status(201).json({ message: await repository.send(response.locals.auth.accessToken, conversationId.data, parsed.data.client_message_id, parsed.data.content) });
    } catch (error) { sendPersistenceError(response, error); }
  });
  router.post("/api/direct-conversations/:conversationId/read", authenticate, writeRateLimit, async (request, response) => {
    try {
      const id = uuid.safeParse(request.params.conversationId);
      if (!id.success) throw new PersistenceError(400, "invalid_direct_conversation", "A valid conversation is required.");
      response.json(await repository.markRead(response.locals.auth.accessToken, id.data));
    } catch (error) { sendPersistenceError(response, error); }
  });
  router.post("/api/direct-chat/blocks/:profileId", authenticate, writeRateLimit, async (request, response) => {
    try {
      const id = uuid.safeParse(request.params.profileId);
      if (!id.success) throw new PersistenceError(400, "invalid_block_target", "A valid profile is required.");
      await repository.block(response.locals.auth.accessToken, id.data); response.status(204).end();
    } catch (error) { sendPersistenceError(response, error); }
  });
  router.delete("/api/direct-chat/blocks/:profileId", authenticate, writeRateLimit, async (request, response) => {
    try {
      const id = uuid.safeParse(request.params.profileId);
      if (!id.success) throw new PersistenceError(400, "invalid_block_target", "A valid profile is required.");
      await repository.unblock(response.locals.auth.accessToken, id.data); response.status(204).end();
    } catch (error) { sendPersistenceError(response, error); }
  });
  return router;
}
