import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { currentRequestId } from '../security/structuredLogger';

type Stage = 'draft' | 'review';
type Counts = { prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null };
type Entry = Counts & { request_id: string; stage?: Stage; latency_ms: number };
type Sink = (entry: Entry) => void;
type State = { id: string; sink: Sink; totals: Counts; attempts: number; pending: number; closed: boolean };
const context = new AsyncLocalStorage<{ state: State; stage: Stage }>();
const empty = (): Counts => ({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
const unknown = (): Counts => ({ prompt_tokens: null, completion_tokens: null, total_tokens: null });
const keys = ['prompt_tokens', 'completion_tokens', 'total_tokens'] as const;
const milliseconds = (start: number) => Math.max(0, Math.round(performance.now() - start));
function emit(state: State, entry: Entry): void {
  try { state.sink(entry); } catch { /* Diagnostics must never change request behavior. */ }
}

/** Opt-in, backend-only. A summary has no stage field; no raw metadata is serialized. */
export async function withGroqUsage<T>(
  work: () => Promise<T>,
  options: { enabled?: boolean; sink?: Sink } = {},
): Promise<T> {
  if (!(options.enabled ?? process.env.GROQ_USAGE_DIAGNOSTICS === 'true')) return work();
  const candidate = currentRequestId();
  // Never log a client idempotency key or arbitrary header as an identifier.
  const id = candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate : randomUUID();
  const state: State = { id, sink: options.sink ?? ((entry) => console.log(JSON.stringify(entry))),
    totals: empty(), attempts: 0, pending: 0, closed: false };
  const start = performance.now();
  return context.run({ state, stage: 'draft' }, async () => {
    try { return await work(); } finally {
      state.closed = true;
      if (state.attempts) emit(state, { request_id: id,
        ...(state.pending ? unknown() : state.totals), latency_ms: milliseconds(start) });
    }
  });
}

export function withGroqStage<T>(stage: Stage, work: () => T): T {
  const active = context.getStore();
  return active ? context.run({ state: active.state, stage }, work) : work();
}

/** One completion per actual provider attempt, including failed/fallback attempts. */
export function beginGroqUsageAttempt(): (usage?: unknown) => void {
  const active = context.getStore();
  if (!active || active.state.closed) return () => {};
  const { state, stage } = active;
  state.attempts += 1;
  state.pending += 1;
  const start = performance.now();
  let done = false;
  return (usage) => {
    if (done) return;
    done = true;
    state.pending -= 1;
    if (state.closed) return; // A timed-out pipeline must not emit late/double summaries.
    const counts = unknown();
    if (usage && typeof usage === 'object') {
      for (const key of keys) {
        const value = (usage as Record<string, unknown>)[key];
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) counts[key] = value;
      }
    }
    for (const key of keys) {
      const a = state.totals[key], b = counts[key];
      state.totals[key] = a !== null && b !== null && Number.isSafeInteger(a + b) ? a + b : null;
    }
    emit(state, { request_id: state.id, stage, ...counts, latency_ms: milliseconds(start) });
  };
}
