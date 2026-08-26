export const DIRECT_CHAT_POLL_BASE_MS = 15_000;
export const DIRECT_CHAT_POLL_MAX_MS = 60_000;

export function directChatPollDelay(consecutiveFailures: number): number {
  const exponent = Math.max(0, Math.min(2, Math.floor(consecutiveFailures)));
  return Math.min(DIRECT_CHAT_POLL_MAX_MS, DIRECT_CHAT_POLL_BASE_MS * (2 ** exponent));
}
