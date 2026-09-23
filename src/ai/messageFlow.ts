import type { ChatMessage } from "../types";
import { ApiError } from "../utils/api";

export type FailedAiSubmission = {
  requestId: string;
  sessionId: string;
  text: string;
  module: string;
  lang: "ru" | "kk" | "en";
  documentId?: string;
  imageIds?: string[];
};

export function canonicalAiRequestId(module: string, requestId: string): string {
  return `ai:${module}:${requestId}`;
}

export function createOptimisticUserMessage(input: {
  requestId: string;
  text: string;
  module: string;
  timestamp?: string;
}): ChatMessage {
  return {
    id: `pending-user-${input.requestId}`,
    sender: "user",
    text: input.text,
    module: input.module,
    timestamp: input.timestamp ?? new Date().toISOString(),
    requestId: input.requestId,
    deliveryState: "sending",
    transient: true,
  };
}

function messageRequestKey(message: ChatMessage): string | null {
  return message.requestId ? `${message.sender}:${message.requestId}` : null;
}

export function mergeCanonicalMessages(...groups: readonly ChatMessage[][]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  const byRequest = new Map<string, string>();

  for (const message of groups.flat()) {
    const requestKey = messageRequestKey(message);
    const previousId = requestKey ? byRequest.get(requestKey) : undefined;
    const previous = previousId ? byId.get(previousId) : undefined;

    // A database-backed row always replaces its optimistic counterpart. An
    // older optimistic update must never replace a canonical row afterward.
    if (previous && previous.deliveryState === undefined && message.deliveryState !== undefined) {
      continue;
    }
    if (previousId && previousId !== message.id) byId.delete(previousId);
    byId.set(message.id, message);
    if (requestKey) byRequest.set(requestKey, message.id);
  }

  return [...byId.values()].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id));
}

export function markOptimisticMessageFailed(
  messages: readonly ChatMessage[],
  requestId: string,
): ChatMessage[] {
  return messages.map((message) => message.sender === "user" && message.requestId === requestId
    && message.deliveryState !== undefined
    ? { ...message, deliveryState: "failed" }
    : message);
}

export function persistedUserMessageFromError(error: unknown): ChatMessage | null {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== "object") return null;
  const candidate = (error.body as { user_message?: unknown }).user_message;
  if (!candidate || typeof candidate !== "object") return null;
  const message = candidate as Partial<ChatMessage>;
  if (typeof message.id !== "string" || message.sender !== "user" || typeof message.text !== "string"
      || typeof message.module !== "string" || typeof message.timestamp !== "string") return null;
  return message as ChatMessage;
}
