import type { ChatMessage } from "../types";

export type ModuleResponseType = "completion" | "off_topic_redirect";

export type ModuleAiResponse = {
  status: string;
  response: string;
  response_type?: ModuleResponseType;
  user_message: ChatMessage;
  assistant_message: ChatMessage | null;
  xp: number;
  level: number;
  streak: number;
  requests_count: number;
  material_count: number;
  patent_count: number;
  modules_used: string[];
};

export function isOffTopicRedirectResponse(response: ModuleAiResponse): boolean {
  return response.status === "ok"
    && response.response_type === "off_topic_redirect"
    && response.assistant_message === null
    && response.response.trim().length > 0;
}

export function appendOffTopicTransientMessage(
  messages: readonly ChatMessage[],
  response: ModuleAiResponse,
  input: { requestId: string; module: string; timestamp: string },
): ChatMessage[] {
  if (!isOffTopicRedirectResponse(response)) return [...messages];
  const id = `off-topic-${input.requestId}`;
  if (messages.some((message) => message.id === id)) return [...messages];
  return [...messages, {
    id,
    sender: "ai",
    text: response.response,
    module: input.module,
    timestamp: input.timestamp,
    requestId: input.requestId,
    transient: true,
  }];
}
