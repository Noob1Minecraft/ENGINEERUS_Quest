import assert from 'node:assert/strict';
import test from 'node:test';
import { createGroqResponder } from '../server/ai/groqClient';
import { beginGroqUsageAttempt, withGroqStage, withGroqUsage } from '../server/ai/usageDiagnostics';
import { createTutorPipeline } from '../server/ai/tutor/pipeline';
import { planTutoring } from '../server/ai/tutor/taskRouter';
import { existingTutorKnowledge } from '../server/ai/tutor/knowledge';
import { runWithRequestId } from '../server/security/structuredLogger';

const counts = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 };
const content = JSON.stringify({ response: 'Electrical resistance opposes current.',
  calculations: [], revealsFinalAnswer: false, uncertain: false });
const input = { plan: planTutoring('Explain electrical resistance', []),
  knowledge: existingTutorKnowledge({ prompt: 'PRIVATE PROMPT', policy: 'PRIVATE POLICY', sources: [] }),
  language: 'en' as const };
const reply = (usage: unknown = counts) => Response.json({ choices: [{ message: { content } }], usage });

test('real pipeline plumbing logs draft/review and one total, never private response metadata', async () => {
  const entries: any[] = [];
  const generate = createGroqResponder({ apiKey: 'synthetic-credential', model: 'qwen/qwen3.8-27b',
    fetchImpl: async () => reply({ ...counts, email: 'private@example.invalid', prompt: 'PRIVATE PROMPT',
      authorization: 'PRIVATE TOKEN', nested: { content } }) });
  const id = '01234567-89ab-4cde-8fab-0123456789ab';
  const result = await runWithRequestId(id, () => withGroqUsage(() => createTutorPipeline(generate)(input),
    { enabled: true, sink: entry => entries.push(entry) }));
  assert.equal(result, 'Electrical resistance opposes current.');
  assert.deepEqual(entries.map(e => e.stage), ['draft', 'review', undefined]);
  assert.deepEqual(entries.map(e => e.total_tokens), [120, 120, 240]);
  assert.equal(entries[2].prompt_tokens, 200);
  assert.equal(entries[2].completion_tokens, 40);
  for (const entry of entries) {
    assert.equal(entry.request_id, id);
    assert.ok(Number.isInteger(entry.latency_ms) && entry.latency_ms >= 0);
    assert.deepEqual(Object.keys(entry).sort(), ['request_id', 'prompt_tokens', 'completion_tokens',
      'total_tokens', 'latency_ms', ...(entry.stage ? ['stage'] : [])].sort());
  }
  assert.doesNotMatch(JSON.stringify(entries), /PRIVATE|private@example|synthetic-credential|Electrical|authorization/);
});

test('missing/malformed usage is unknown, not zero or string-coerced; no unsafe fields escape', async () => {
  for (const usage of [undefined, null, { prompt_tokens: 'secret', completion_tokens: -1, total_tokens: Infinity }]) {
    const entries: any[] = [];
    await withGroqUsage(() => createGroqResponder({ apiKey: 'test', model: 'test',
      fetchImpl: async () => reply(usage === undefined ? {} : usage) })('private'), {
      enabled: true, sink: e => entries.push(e),
    });
    for (const e of entries) {
      assert.equal(e.prompt_tokens, null); assert.equal(e.completion_tokens, null); assert.equal(e.total_tokens, null);
    }
  }
});

test('failed fallback attempts do not fabricate zero cost and totals include repeated pipeline runs', async () => {
  const entries: any[] = [];
  let calls = 0;
  const generate = createGroqResponder({ apiKey: 'test', model: 'qwen/qwen3.8-27b',
    fetchImpl: async () => ++calls === 1 ? new Response('', { status: 404 }) : reply() });
  await withGroqUsage(async () => {
    await createTutorPipeline(generate)(input);
    await createTutorPipeline(generate)(input); // Existing standards regeneration.
  }, { enabled: true, sink: e => entries.push(e) });
  assert.equal(calls, 5);
  assert.equal(entries.length, 6);
  assert.deepEqual(entries.slice(0, 5).map(e => e.stage), ['draft', 'draft', 'review', 'draft', 'review']);
  assert.equal(entries.at(-1).total_tokens, null); // Failed attempt's cost is not reported by Groq.
});

test('review failure still emits available draft usage and one unknown total', async () => {
  const entries: any[] = [];
  let calls = 0;
  const generate = createGroqResponder({ apiKey: 'test', model: 'qwen/qwen3.8-27b',
    fetchImpl: async () => ++calls === 1 ? reply() : new Response('', { status: 500 }) });
  await assert.rejects(withGroqUsage(() => createTutorPipeline(generate)(input),
    { enabled: true, sink: e => entries.push(e) }));
  assert.deepEqual(entries.map(e => e.total_tokens), [120, null, null]);
  assert.deepEqual(entries.map(e => e.stage), ['draft', 'review', undefined]);
});

test('concurrent requests are isolated and raw context identifiers are never logged', async () => {
  const entries: any[] = [];
  await Promise.all([1, 2].map(n => runWithRequestId('private@example.invalid', () => withGroqUsage(async () => {
    await withGroqStage('review', async () => {
      const finish = beginGroqUsageAttempt();
      await new Promise(resolve => setTimeout(resolve, n));
      finish({ prompt_tokens: n, completion_tokens: n, total_tokens: 2 * n });
      finish(counts); // Duplicate completion ignored.
    });
  }, { enabled: true, sink: e => entries.push(e) }))));
  assert.equal(new Set(entries.map(e => e.request_id)).size, 2);
  assert.doesNotMatch(JSON.stringify(entries), /private@example/);
  assert.deepEqual(entries.filter(e => !e.stage).map(e => e.total_tokens).sort(), [2, 4]);
});

test('disabled diagnostics, no-provider requests and failed sinks preserve behavior', async () => {
  const entries: any[] = [];
  const generate = createGroqResponder({ apiKey: 'test', model: 'test', fetchImpl: async () => reply() });
  assert.equal(await withGroqUsage(() => generate('private'), { enabled: false, sink: e => entries.push(e) }), content);
  await withGroqUsage(async () => 'idempotent replay or off-topic refusal', { enabled: true, sink: e => entries.push(e) });
  assert.equal(entries.length, 0);
  assert.equal(await withGroqUsage(() => generate('private'), {
    enabled: true, sink: () => { throw new Error('broken sink'); },
  }), content);
});

test('late provider completion after scope exit cannot produce a misleading partial total', async () => {
  const entries: any[] = [];
  let finish: ReturnType<typeof beginGroqUsageAttempt>;
  await withGroqUsage(async () => { finish = beginGroqUsageAttempt(); },
    { enabled: true, sink: e => entries.push(e) });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].total_tokens, null);
  finish!(counts);
  assert.equal(entries.length, 1);
});
