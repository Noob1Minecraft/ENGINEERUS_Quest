import { AiProviderError } from './groqClient';

export const STAGING_AI_LIMITS = Object.freeze({
  maxCharacters: 8_000, maxEstimatedTokens: 4_000,
  burst: 3, burstMs: 30_000, requests: 20, windowMs: 15 * 60_000,
  maxUsers: 5_000, timeoutMs: 90_000,
});

export function stagingAiLimitsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.STAGING_AI_USAGE_LIMITS === 'true'
    && env.RENDER_SERVICE_ID === 'srv-da1b9qe1egvs73adf810';
}

// Deliberately conservative heuristic, NOT measured provider usage or a tokenizer.
export function inputTooLarge(text: string): boolean {
  return text.length > STAGING_AI_LIMITS.maxCharacters
    || Math.ceil(Buffer.byteLength(text, 'utf8') / 2) > STAGING_AI_LIMITS.maxEstimatedTokens;
}

export function createStagingAiBudget(now = Date.now) {
  const users = new Map<string, number[]>();
  return {
    consume(userId: string): number {
      const time = now();
      // At most 5000 * 20 timestamps; no unbounded timers or eviction of active budgets.
      for (const [id, timestamps] of users) {
        const active = timestamps.filter(t => t > time - STAGING_AI_LIMITS.windowMs);
        if (active.length) users.set(id, active);
        else users.delete(id);
      }
      const timestamps = users.get(userId) ?? [];
      const burst = timestamps.filter(t => t > time - STAGING_AI_LIMITS.burstMs);
      let wait = 0;
      if (timestamps.length >= STAGING_AI_LIMITS.requests) wait = timestamps[0] + STAGING_AI_LIMITS.windowMs - time;
      if (burst.length >= STAGING_AI_LIMITS.burst) wait = Math.max(wait, burst[0] + STAGING_AI_LIMITS.burstMs - time);
      if (!users.has(userId) && users.size >= STAGING_AI_LIMITS.maxUsers) wait = STAGING_AI_LIMITS.windowMs;
      if (wait > 0) return Math.max(1, Math.ceil(wait / 1000));
      timestamps.push(time);
      users.set(userId, timestamps);
      return 0;
    },
  };
}

export function createAiDeadline(parent?: AbortSignal, timeoutMs: number = STAGING_AI_LIMITS.timeoutMs) {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('AI deadline exceeded', 'TimeoutError')), timeoutMs);
  return {
    signal: controller.signal,
    dispose() { clearTimeout(timer); parent?.removeEventListener('abort', abort); },
  };
}

/** Bound even a non-cooperative promise; signal-aware fetch also stops upstream work. */
export async function withinAiDeadline<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  const error = () => new AiProviderError(signal.reason?.name === 'TimeoutError' ? 'timeout' : 'aborted', 'Tutor unavailable');
  if (signal.aborted) throw error();
  let onAbort: () => void;
  const canceled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(error());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([work(), canceled]); }
  finally { signal.removeEventListener('abort', onAbort!); }
}
