import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";
import { createSupabaseUserClient } from "../lib/supabaseUser";
import { PersistenceError } from "./errors";

export type DirectChatProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type DirectMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_message_id: string;
  content: string;
  created_at: string;
  edited_at: string | null;
};
export type DirectMessagePreview = Pick<DirectMessage, "id" | "conversation_id" | "sender_id" | "content" | "created_at">;

export type DirectConversation = {
  id: string;
  other_user: DirectChatProfile | null;
  created_from_project_id: string | null;
  created_at: string;
  updated_at: string;
  last_message: DirectMessagePreview | null;
  unread_count: number;
};

type ConversationRow = {
  id: string;
  other_user_id: string;
  created_from_project_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_id: string | null;
  last_message_content: string | null;
  last_message_sender_id: string | null;
  last_message_created_at: string | null;
  unread_count: number | string;
};

function failure(error: { code?: string; message?: string } | null): never {
  const code = error?.message?.split("\n")[0]?.trim() || "direct_chat_unavailable";
  if (code.includes("not_found") || error?.code === "P0002") {
    throw new PersistenceError(404, code, "The direct conversation was not found.");
  }
  if (code.includes("forbidden") || code.includes("blocked") || code.includes("disabled")
    || code.includes("relationship_required") || error?.code === "42501") {
    throw new PersistenceError(403, code, "Direct messaging is not allowed for this account relationship.");
  }
  if (code.includes("idempotency") || error?.code === "23505") {
    throw new PersistenceError(409, code, "The message idempotency key conflicts with another request.");
  }
  if (code.includes("invalid") || error?.code === "22023" || error?.code === "23514") {
    throw new PersistenceError(400, code, "The direct-message input is invalid.");
  }
  throw new PersistenceError(503, "direct_chat_unavailable", "Direct messaging is temporarily unavailable.");
}

export type ConversationCursor = { updatedAt: string; id: string };
export type MessageCursor = { createdAt: string; id: string };

export type DirectChatRepository = {
  getOrCreate(accessToken: string, targetProfileId: string, projectId?: string | null): Promise<{ conversation_id: string }>;
  list(accessToken: string, limit: number, cursor?: ConversationCursor): Promise<{ conversations: DirectConversation[]; next_cursor: ConversationCursor | null }>;
  listMessages(accessToken: string, conversationId: string, limit: number, cursor?: MessageCursor): Promise<{ messages: DirectMessage[]; next_cursor: MessageCursor | null }>;
  send(accessToken: string, conversationId: string, clientMessageId: string, content: string): Promise<DirectMessage>;
  markRead(accessToken: string, conversationId: string): Promise<{ read_at: string }>;
  block(accessToken: string, profileId: string): Promise<void>;
  unblock(accessToken: string, profileId: string): Promise<void>;
};

export function createDirectChatRepository(env: ServerEnv): DirectChatRepository {
  const admin = createSupabaseAdminClient(env);
  return {
    async getOrCreate(accessToken, targetProfileId, projectId = null) {
      const client = createSupabaseUserClient(env, accessToken);
      const { data, error } = await client.rpc("get_or_create_direct_conversation", {
        p_target_profile_id: targetProfileId, p_project_id: projectId,
      });
      if (error || typeof data !== "string") failure(error);
      return { conversation_id: data };
    },

    async list(accessToken, limit, cursor) {
      const client = createSupabaseUserClient(env, accessToken);
      const { data, error } = await client.rpc("list_direct_conversations", {
        p_limit: limit,
        p_before_updated_at: cursor?.updatedAt ?? null,
        p_before_id: cursor?.id ?? null,
      });
      if (error) failure(error);
      const rows = (data ?? []) as ConversationRow[];
      const profileIds = [...new Set(rows.map((row) => row.other_user_id))];
      const { data: profiles, error: profileError } = profileIds.length
        // The trusted server receives only the existing PublicProfile-safe
        // column grant; private settings and auth identity data are excluded.
        ? await admin.from("profiles").select("id,username,display_name,avatar_url").in("id", profileIds)
        : { data: [], error: null };
      if (profileError) failure(profileError);
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile as DirectChatProfile]));
      const conversations = rows.map((row): DirectConversation => ({
        id: row.id,
        other_user: profileById.get(row.other_user_id) ?? null,
        created_from_project_id: row.created_from_project_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_message: row.last_message_id ? {
          id: row.last_message_id, conversation_id: row.id,
          sender_id: row.last_message_sender_id!,
          content: row.last_message_content ?? "", created_at: row.last_message_created_at!,
        } : null,
        unread_count: Number(row.unread_count),
      }));
      const last = rows.length === limit ? rows.at(-1) : undefined;
      return { conversations, next_cursor: last ? { updatedAt: last.updated_at, id: last.id } : null };
    },

    async listMessages(accessToken, conversationId, limit, cursor) {
      const client = createSupabaseUserClient(env, accessToken);
      const { data, error } = await client.rpc("list_direct_messages", {
        p_conversation_id: conversationId, p_limit: limit,
        p_before_created_at: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null,
      });
      if (error) failure(error);
      const descending = (data ?? []) as DirectMessage[];
      const last = descending.length === limit ? descending.at(-1) : undefined;
      return {
        messages: [...descending].reverse(),
        next_cursor: last ? { createdAt: last.created_at, id: last.id } : null,
      };
    },

    async send(accessToken, conversationId, clientMessageId, content) {
      const client = createSupabaseUserClient(env, accessToken);
      const { data, error } = await client.rpc("send_direct_message", {
        p_conversation_id: conversationId, p_client_message_id: clientMessageId, p_content: content,
      });
      if (error || !Array.isArray(data) || !data[0]) failure(error);
      return data[0] as DirectMessage;
    },

    async markRead(accessToken, conversationId) {
      const client = createSupabaseUserClient(env, accessToken);
      const { data, error } = await client.rpc("mark_direct_conversation_read", { p_conversation_id: conversationId });
      if (error || typeof data !== "string") failure(error);
      return { read_at: data };
    },

    async block(accessToken, profileId) {
      const { error } = await createSupabaseUserClient(env, accessToken)
        .rpc("block_direct_chat_user", { p_blocked_profile_id: profileId });
      if (error) failure(error);
    },

    async unblock(accessToken, profileId) {
      const { error } = await createSupabaseUserClient(env, accessToken)
        .rpc("unblock_direct_chat_user", { p_blocked_profile_id: profileId });
      if (error) failure(error);
    },
  };
}
