import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";
import { createSupabaseUserClient } from "../lib/supabaseUser";
import { PersistenceError } from "./errors";

export const CHAT_MODULES = ["tutor", "material", "patent", "engi_legal", "engi_match"] as const;
export type ChatModule = typeof CHAT_MODULES[number];

export type PersistedChatSession = {
  id: string;
  title: string;
  module: ChatModule;
  createdAt: string;
  updatedAt: string;
};

export type PersistedChatMessage = {
  id: string;
  sender: "user" | "ai";
  text: string;
  module: ChatModule;
  timestamp: string;
  xpEarned?: number;
  requestId?: string;
};

export type ChatSessionCursor = { updatedAt: string; id: string };
export type ChatMessageCursor = { createdAt: string; id: string };
export type ChatPage<T, TCursor> = { items: T[]; nextCursor: TCursor | null };

export type CanonicalProgress = {
  xp: number;
  level: number;
  streak: number;
  requests_count: number;
  material_count: number;
  patent_count: number;
  modules_used: string[];
};

type SessionRow = {
  id: string;
  title: string;
  module: ChatModule;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  module: ChatModule;
  xp_awarded: number;
  request_id: string | null;
  created_at: string;
};

type ProgressRow = {
  total_xp: number;
  level: number;
  streak_days: number;
  requests_count: number;
  material_count: number;
  patent_count: number;
  modules_used: string[];
};

function mapSession(row: SessionRow): PersistedChatSession {
  return {
    id: row.id,
    title: row.title,
    module: row.module,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): PersistedChatMessage {
  return {
    id: row.id,
    sender: row.role === "assistant" ? "ai" : "user",
    text: row.content,
    module: row.module,
    timestamp: row.created_at,
    ...(row.xp_awarded > 0 ? { xpEarned: row.xp_awarded } : {}),
    ...(row.request_id ? { requestId: row.request_id } : {}),
  };
}

function mapProgress(row: ProgressRow): CanonicalProgress {
  return {
    xp: Number(row.total_xp),
    level: Number(row.level),
    streak: Number(row.streak_days),
    requests_count: Number(row.requests_count),
    material_count: Number(row.material_count),
    patent_count: Number(row.patent_count),
    modules_used: row.modules_used ?? [],
  };
}

export type AiExchange = {
  userMessage: PersistedChatMessage;
  assistantMessage: PersistedChatMessage | null;
  progress: CanonicalProgress;
  awarded?: boolean;
};

export function createChatRepository(env: ServerEnv) {
  async function requireOwnedSession(userId: string, accessToken: string, sessionId: string) {
    const client = createSupabaseUserClient(env, accessToken);
    const result = await client
      .from("chat_sessions")
      .select("id,title,module,created_at,updated_at")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (result.error) throw new PersistenceError(503, "chat_unavailable", "Chat storage is temporarily unavailable.");
    if (!result.data) throw new PersistenceError(404, "chat_not_found", "Chat session was not found.");
    return result.data as SessionRow;
  }

  function mapExchange(data: Record<string, unknown>): AiExchange {
    const userMessage = data.user_message as MessageRow;
    const assistantMessage = data.assistant_message as MessageRow | null;
    const progress = data.progress as ProgressRow;
    return {
      userMessage: mapMessage(userMessage),
      assistantMessage: assistantMessage ? mapMessage(assistantMessage) : null,
      progress: mapProgress(progress),
      ...(typeof data.awarded === "boolean" ? { awarded: data.awarded } : {}),
    };
  }

  return {
    async list(
      userId: string,
      accessToken: string,
      limit: number,
      cursor?: ChatSessionCursor,
    ): Promise<ChatPage<PersistedChatSession, ChatSessionCursor>> {
      const client = createSupabaseUserClient(env, accessToken);
      let query = client
        .from("chat_sessions")
        .select("id,title,module,created_at,updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit + 1);
      if (cursor) {
        query = query.or(
          `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`,
        );
      }
      const result = await query;
      if (result.error) throw new PersistenceError(503, "chat_unavailable", "Chat storage is temporarily unavailable.");
      const rows = result.data as SessionRow[];
      const page = rows.slice(0, limit);
      const boundary = rows.length > limit ? page.at(-1) : undefined;
      return {
        items: page.map(mapSession),
        nextCursor: boundary ? { updatedAt: boundary.updated_at, id: boundary.id } : null,
      };
    },

    async create(
      userId: string,
      accessToken: string,
      title: string,
      module: ChatModule,
    ): Promise<PersistedChatSession> {
      const client = createSupabaseUserClient(env, accessToken);
      const result = await client
        .from("chat_sessions")
        .insert({ user_id: userId, title, module })
        .select("id,title,module,created_at,updated_at")
        .single();
      if (result.error) throw new PersistenceError(503, "chat_create_failed", "Chat session could not be created.");
      return mapSession(result.data as SessionRow);
    },

    async messages(
      userId: string,
      accessToken: string,
      sessionId: string,
      limit: number,
      cursor?: ChatMessageCursor,
    ): Promise<ChatPage<PersistedChatMessage, ChatMessageCursor>> {
      await requireOwnedSession(userId, accessToken, sessionId);
      const client = createSupabaseUserClient(env, accessToken);
      let query = client
        .from("chat_messages")
        .select("id,role,content,module,xp_awarded,request_id,created_at")
        .eq("session_id", sessionId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit + 1);
      if (cursor) {
        query = query.or(
          `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
        );
      }
      const result = await query;
      if (result.error) throw new PersistenceError(503, "messages_unavailable", "Chat messages are temporarily unavailable.");
      const rows = result.data as MessageRow[];
      const page = rows.slice(0, limit);
      const boundary = rows.length > limit ? page.at(-1) : undefined;
      return {
        items: page.map(mapMessage).reverse(),
        nextCursor: boundary ? { createdAt: boundary.created_at, id: boundary.id } : null,
      };
    },

    async update(
      userId: string,
      accessToken: string,
      sessionId: string,
      changes: { title?: string; module?: ChatModule },
    ): Promise<PersistedChatSession> {
      await requireOwnedSession(userId, accessToken, sessionId);
      const client = createSupabaseUserClient(env, accessToken);
      const result = await client
        .from("chat_sessions")
        .update(changes)
        .eq("id", sessionId)
        .eq("user_id", userId)
        .select("id,title,module,created_at,updated_at")
        .single();
      if (result.error) throw new PersistenceError(503, "chat_update_failed", "Chat session could not be updated.");
      return mapSession(result.data as SessionRow);
    },

    async remove(userId: string, accessToken: string, sessionId: string): Promise<void> {
      await requireOwnedSession(userId, accessToken, sessionId);
      const client = createSupabaseUserClient(env, accessToken);
      const result = await client
        .from("chat_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", userId);
      if (result.error) throw new PersistenceError(503, "chat_delete_failed", "Chat session could not be deleted.");
    },

    async beginExchange(
      userId: string,
      accessToken: string,
      sessionId: string,
      requestId: string,
      content: string,
      module: ChatModule,
    ): Promise<AiExchange> {
      await requireOwnedSession(userId, accessToken, sessionId);
      const client = createSupabaseAdminClient(env);
      const result = await client.rpc("begin_ai_exchange", {
        p_user_id: userId,
        p_session_id: sessionId,
        p_request_id: requestId,
        p_content: content,
        p_module: module,
      });
      if (result.error) throw new PersistenceError(503, "message_persist_failed", "The message could not be persisted.");
      return mapExchange(result.data as Record<string, unknown>);
    },

    async completeExchange(
      userId: string,
      accessToken: string,
      sessionId: string,
      requestId: string,
      responseText: string,
      module: ChatModule,
      xpAmount: 10 | 15,
    ): Promise<AiExchange> {
      await requireOwnedSession(userId, accessToken, sessionId);
      const client = createSupabaseAdminClient(env);
      const result = await client.rpc("complete_ai_exchange", {
        p_user_id: userId,
        p_session_id: sessionId,
        p_request_id: requestId,
        p_content: responseText,
        p_module: module,
        p_xp_amount: xpAmount,
      });
      if (result.error) throw new PersistenceError(503, "response_persist_failed", "The AI response could not be persisted.");
      return mapExchange(result.data as Record<string, unknown>);
    },
  };
}

export type ChatRepository = ReturnType<typeof createChatRepository>;
