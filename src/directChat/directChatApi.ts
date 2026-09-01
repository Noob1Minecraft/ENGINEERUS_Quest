import { apiFetch } from '../utils/api';
export type DirectChatFetcher = <T>(endpoint: string, options?: RequestInit) => Promise<T>;

export type DirectChatProfile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
export type DirectMessage = {
  id: string; conversation_id: string; sender_id: string; client_message_id: string;
  content: string; created_at: string; edited_at: string | null;
};
export type DirectMessagePreview = Pick<DirectMessage, 'id' | 'conversation_id' | 'sender_id' | 'content' | 'created_at'>;
export type DirectConversation = {
  id: string; other_user: DirectChatProfile | null; created_from_project_id: string | null;
  created_at: string; updated_at: string; last_message: DirectMessagePreview | null; unread_count: number;
};

export async function createDirectConversation(targetProfileId: string, projectId?: string | null, fetcher: DirectChatFetcher = apiFetch) {
  return fetcher<{ conversation_id: string }>('/api/direct-conversations', {
    method: 'POST', body: JSON.stringify({ target_profile_id: targetProfileId, project_id: projectId ?? null }),
  });
}
export async function listDirectConversations(cursor?: string | null, fetcher: DirectChatFetcher = apiFetch) {
  const query = new URLSearchParams({ limit: '25' }); if (cursor) query.set('cursor', cursor);
  return fetcher<{ conversations: DirectConversation[]; next_cursor: string | null }>(`/api/direct-conversations?${query}`);
}
export async function listDirectMessages(conversationId: string, cursor?: string | null, fetcher: DirectChatFetcher = apiFetch) {
  const query = new URLSearchParams({ limit: '50' }); if (cursor) query.set('cursor', cursor);
  return fetcher<{ messages: DirectMessage[]; next_cursor: string | null }>(`/api/direct-conversations/${conversationId}/messages?${query}`);
}
export async function sendDirectMessage(conversationId: string, content: string, clientMessageId = crypto.randomUUID(), fetcher: DirectChatFetcher = apiFetch) {
  return fetcher<{ message: DirectMessage }>(`/api/direct-conversations/${conversationId}/messages`, {
    method: 'POST', body: JSON.stringify({ content, client_message_id: clientMessageId }),
  });
}
export async function markDirectConversationRead(conversationId: string, fetcher: DirectChatFetcher = apiFetch) {
  return fetcher<{ read_at: string }>(`/api/direct-conversations/${conversationId}/read`, { method: 'POST' });
}
export async function blockDirectChatUser(profileId: string, fetcher: DirectChatFetcher = apiFetch) {
  return fetcher<void>(`/api/direct-chat/blocks/${profileId}`, { method: 'POST' });
}
export async function unblockDirectChatUser(profileId: string, fetcher: DirectChatFetcher = apiFetch) {
  return fetcher<void>(`/api/direct-chat/blocks/${profileId}`, { method: 'DELETE' });
}
