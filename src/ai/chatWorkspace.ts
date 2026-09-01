const TITLE_LIMIT = 72;
const inMemoryDrafts = new Map<string, string>();

function accountKey(userId: string | null): string {
  return userId ?? "signed-out";
}

export function buildConversationTitle(message: string): string {
  const normalized = message.trim().replace(/\s+/gu, " ");
  if (normalized.length <= TITLE_LIMIT) return normalized;
  return `${normalized.slice(0, TITLE_LIMIT - 1).trimEnd()}…`;
}

export function activeChatStorageKey(userId: string | null): string {
  return `engineerus:ai:active-chat:${accountKey(userId)}`;
}

function chatDraftKey(userId: string | null, sessionId: string): string {
  return `engineerus:ai:draft:${accountKey(userId)}:${sessionId || "new"}`;
}

export function loadChatDraft(userId: string | null, sessionId: string): string {
  return inMemoryDrafts.get(chatDraftKey(userId, sessionId)) ?? "";
}

export function storeChatDraft(userId: string | null, sessionId: string, draft: string): void {
  const key = chatDraftKey(userId, sessionId);
  if (draft) inMemoryDrafts.set(key, draft);
  else inMemoryDrafts.delete(key);
}

export function clearChatDraft(userId: string | null, sessionId: string): void {
  inMemoryDrafts.delete(chatDraftKey(userId, sessionId));
}

export function isUntitledConversation(title: string): boolean {
  return title === "New conversation";
}
