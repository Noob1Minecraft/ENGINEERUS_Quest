import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createAiRouter } from '../server/routes/ai';
import type { ChatRepository } from '../server/persistence/chats';
import { createGroqResponder } from '../server/ai/groqClient';
import { createAiDeadline, createStagingAiBudget, inputTooLarge, stagingAiLimitsEnabled, withinAiDeadline, STAGING_AI_LIMITS } from '../server/ai/stagingUsageLimits';
import { withGroqUsage } from '../server/ai/usageDiagnostics';
import { createTutorPipeline } from '../server/ai/tutor/pipeline';
import { existingTutorKnowledge } from '../server/ai/tutor/knowledge';
import { planTutoring } from '../server/ai/tutor/taskRouter';
import { withServer } from './helpers';

const session = '123e4567-e89b-42d3-a456-426614174000';
function fixture(enabled = true, generate?: (...args: any[]) => Promise<string>, timeoutMs = 1000) {
  let time = 0;
  const state = { calls: 0, releases: 0, budget: 0, rows: new Map<string, any>() };
  const repository = {
    async beginExchange(user: string, _token: string, _session: string, id: string, text: string) {
      const key = `${user}:${id}`;
      if (!state.rows.has(key)) state.rows.set(key, {
        userMessage: { id: key, text, sender: 'user', module: 'tutor', timestamp: new Date(0).toISOString() },
        assistantMessage: null, progress: {},
      });
      return state.rows.get(key);
    },
    async completeExchange(user: string, _token: string, _session: string, id: string, text: string) {
      const row = state.rows.get(`${user}:${id}`);
      row.assistantMessage = { id: `${id}:assistant`, text, xpEarned: 10 };
      return { ...row, awarded: true };
    },
  } as unknown as ChatRepository;
  const app = express(); app.use(express.json());
  app.use(createAiRouter((_req, res, next) => {
    // Test-only stand-in for verified auth; body user_id is deliberately ignored.
    res.locals.auth = { userId: _req.header('x-test-principal') ?? 'A', accessToken: 'synthetic', claims: {} }; next();
  }, (_req, _res, next) => { state.budget++; next(); }, {
    repository, detectLanguage: () => 'en',
    generateResponse: async (...args) => { state.calls++; return generate ? generate(...args) : 'Ohm law relates voltage and current.'; },
    stagingUsageLimits: { enabled, now: () => time, timeoutMs },
    concurrencyGuard: (_req, res, next) => {
      res.locals.aiCapacityLease = { release: () => { state.releases++; } }; next();
    },
  }));
  return { app, state, setTime: (value: number) => { time = value; } };
}
function post(base: string, id: string, text = 'Explain Ohm law', user = 'A', path = '/api/ai') {
  return fetch(`${base}${path}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'Idempotency-Key': id, 'x-test-principal': user,
  }, body: JSON.stringify({ session_id: session, text, lang: 'en', module: 'tutor', user_id: 'forged', usage: 0 }) });
}

test('opt-in requires exact staging service; disabled/production remains unchanged', async () => {
  assert.equal(stagingAiLimitsEnabled({}), false);
  assert.equal(stagingAiLimitsEnabled({ STAGING_AI_USAGE_LIMITS: 'true', RENDER_SERVICE_ID: 'production' }), false);
  assert.equal(stagingAiLimitsEnabled({ STAGING_AI_USAGE_LIMITS: 'true', RENDER_SERVICE_ID: 'srv-da1b9qe1egvs73adf810' }), true);
  const { app, state } = fixture(false);
  await withServer(app, async base => {
    for (let i = 0; i < 4; i++) assert.equal((await post(base, `disabled-${i}`, 'Explain Ohm law ' + 'x'.repeat(9000))).status, 200);
  });
  assert.equal(state.calls, 4);
});

test('normal request, user isolation, burst 429, Retry-After and completed replay', async () => {
  const { app, state, setTime } = fixture();
  await withServer(app, async base => {
    for (let i = 0; i < 3; i++) assert.equal((await post(base, `normal-${i}`)).status, 200);
    const denied = await post(base, 'burst-denied', undefined, 'A', '/api/module');
    assert.equal(denied.status, 429); assert.equal(denied.headers.get('retry-after'), '30');
    const body = await denied.json() as any;
    assert.equal(body.error.code, 'ai_rate_limit_exceeded');
    assert.ok(body.user_message); assert.equal(body.assistant_message, null);
    const replay = await post(base, 'normal-0');
    assert.equal(replay.status, 200); assert.equal((await replay.json() as any).idempotent_replay, true);
    assert.equal(state.calls, 3); assert.equal(state.budget, 3);
    assert.equal((await post(base, 'normal-0', undefined, 'B')).status, 200);
    setTime(30_000);
    assert.equal((await post(base, 'burst-denied')).status, 200);
  });
  assert.equal(state.calls, 5); assert.equal(state.releases, 5);
  assert.equal(state.rows.size, 5);
});

test('oversized characters and UTF-8 estimate rejected before provider; persisted question retained', async () => {
  assert.equal(inputTooLarge('a'.repeat(8000)), false);
  assert.equal(inputTooLarge('界'.repeat(2700)), true);
  const { app, state } = fixture();
  await withServer(app, async base => {
    for (const [i, text] of ['a'.repeat(8001), '界'.repeat(2700), 'a'.repeat(20001)].entries()) {
      const response = await post(base, `oversize-${i}`, text);
      assert.equal(response.status, 413);
      assert.equal((await response.json() as any).error.code, 'ai_input_too_large');
    }
  });
  assert.equal(state.calls, 0); assert.equal(state.budget, 0); assert.equal(state.rows.size, 2);
});

test('sustained budget expires and bounded map does not evict active users', () => {
  let time = 0; const limiter = createStagingAiBudget(() => time);
  for (let i = 0; i < 20; i++) { time = i * 31_000; assert.equal(limiter.consume('A'), 0); }
  assert.ok(limiter.consume('A') > 0); assert.equal(limiter.consume('B'), 0);
  time = 15 * 60_000; assert.equal(limiter.consume('A'), 0);
  const full = createStagingAiBudget(() => time);
  for (let i = 0; i < STAGING_AI_LIMITS.maxUsers; i++) assert.equal(full.consume(String(i)), 0);
  assert.ok(full.consume('overflow') > 0);
  time += STAGING_AI_LIMITS.windowMs;
  assert.equal(full.consume('overflow'), 0);
});

test('sustained limit returns HTTP 429 even when requests are outside the burst window', async () => {
  const { app, state, setTime } = fixture();
  await withServer(app, async base => {
    for (let i = 0; i < 20; i++) {
      setTime(i * 31_000);
      assert.equal((await post(base, `sustained-${i}`)).status, 200);
    }
    setTime(620_000);
    const response = await post(base, 'sustained-denied');
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '280');
    assert.equal(state.calls, 20);
    assert.equal(state.budget, 20);
  });
});

test('timeout aborts provider, preserves question, releases lease and never persists a late answer', async () => {
  let signal: AbortSignal;
  let finish: (text: string) => void;
  const { app, state } = fixture(true, async (...args) => {
    signal = args[5];
    return new Promise<string>(resolve => { finish = resolve; });
  }, 15);
  await withServer(app, async base => {
    const response = await post(base, 'timeout-request');
    assert.equal(response.status, 503);
    const body = await response.json() as any;
    assert.ok(body.user_message); assert.equal(body.assistant_message, null);
    assert.equal(signal!.aborted, true);
    finish!('late answer'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.releases, 1);
    assert.equal([...state.rows.values()][0].assistantMessage, null);
  });
});

test('shared deadline bounds sequential stages/retries and prevents calls after expiry', async () => {
  const deadline = createAiDeadline(undefined, 10);
  let calls = 0;
  try {
    assert.equal(await withinAiDeadline(deadline.signal, async () => ++calls), 1);
    await assert.rejects(withinAiDeadline(deadline.signal, () => new Promise(resolve => setTimeout(resolve, 25))), { category: 'timeout' });
    await assert.rejects(withinAiDeadline(deadline.signal, async () => ++calls), { category: 'timeout' });
    assert.equal(calls, 1);
  } finally { deadline.dispose(); }
});

test('staging Groq uses existing 1600 output cap, retains real usage and cancels stalled body reads', async () => {
  const previous = { flag: process.env.STAGING_AI_USAGE_LIMITS, service: process.env.RENDER_SERVICE_ID };
  process.env.STAGING_AI_USAGE_LIMITS = 'true'; process.env.RENDER_SERVICE_ID = 'srv-da1b9qe1egvs73adf810';
  try {
    const entries: any[] = [];
    const generate = createGroqResponder({ apiKey: 'synthetic', model: 'qwen/qwen3.8-27b', fetchImpl: async (_url, init) => {
      assert.equal(JSON.parse(init!.body as string).max_tokens, 1600);
      const content = JSON.stringify({ response: 'Safe answer', calculations: [], revealsFinalAnswer: false, uncertain: false });
      return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } });
    } });
    await withGroqUsage(() => createTutorPipeline(generate)({
      plan: planTutoring('Explain Ohm law', []), language: 'en',
      knowledge: existingTutorKnowledge({ prompt: 'synthetic', policy: '', sources: [] }),
    }), { enabled: true, sink: entry => entries.push(entry) });
    assert.deepEqual(entries.map(e => e.total_tokens), [20, 20, 40]);
    assert.deepEqual(entries.map(e => e.stage), ['draft', 'review', undefined]);
    let aborted = false;
    const stalled = createGroqResponder({ apiKey: 'synthetic', model: 'qwen/qwen3.8-27b', timeoutMs: 10, fetchImpl: async (_url, init) => {
      init!.signal!.addEventListener('abort', () => { aborted = true; });
      return { ok: true, json: () => new Promise(() => {}) } as unknown as Response;
    } });
    await assert.rejects(stalled('synthetic'), { category: 'timeout' }); assert.equal(aborted, true);
    let attempted = 0;
    const canceled = createGroqResponder({ apiKey: 'synthetic', model: 'qwen/qwen3.8-27b',
      fetchImpl: async () => { attempted++; return new Response('', { status: 404 }); } });
    await assert.rejects(canceled('synthetic', 'tutor', 'en', undefined, [], AbortSignal.abort()), { category: 'aborted' });
    assert.equal(attempted, 0);
  } finally {
    if (previous.flag === undefined) delete process.env.STAGING_AI_USAGE_LIMITS; else process.env.STAGING_AI_USAGE_LIMITS = previous.flag;
    if (previous.service === undefined) delete process.env.RENDER_SERVICE_ID; else process.env.RENDER_SERVICE_ID = previous.service;
  }
});
