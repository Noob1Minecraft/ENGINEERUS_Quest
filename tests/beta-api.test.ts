import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import { createBetaRouter } from '../server/routes/beta';
import type { BetaParticipant, BetaRepository } from '../server/persistence/beta';
import { withServer } from './helpers';

const USER_ID = 'ba000000-0000-4000-8000-000000000001';
const participant: BetaParticipant = {
  status: 'active', cohort: 'controlled-beta-2026', source: null,
  onboarding_started_at: null, onboarding_completed_at: null,
  created_at: '2026-08-26T00:00:00.000Z', updated_at: '2026-08-26T00:00:00.000Z',
};

function repository(overrides: Partial<BetaRepository> = {}): BetaRepository {
  return {
    ensureParticipant: async () => participant,
    startOnboarding: async () => ({ ...participant, onboarding_started_at: participant.created_at }),
    completeOnboarding: async () => ({ ...participant, onboarding_started_at: participant.created_at, onboarding_completed_at: participant.created_at }),
    submitFeedback: async () => ({ id: 'fb000000-0000-4000-8000-000000000001', created_at: participant.created_at }),
    recordEvent: async () => undefined,
    ...overrides,
  };
}

function appFor(repo: BetaRepository, authenticated = true) {
  const app = express();
  app.use(express.json());
  const auth: RequestHandler = (_request, response, next) => {
    if (!authenticated) { response.status(401).json({ error: { code: 'auth_required' } }); return; }
    response.locals.auth = { userId: USER_ID, accessToken: 'safe-test-token', claims: {} };
    next();
  };
  app.use(createBetaRouter(auth, (_request, _response, next) => next(), repo));
  return app;
}

test('beta state and onboarding are authenticated and persisted per verified user', async () => {
  const calls: string[] = [];
  const repo = repository({
    ensureParticipant: async (userId) => { calls.push(`state:${userId}`); return participant; },
    startOnboarding: async (userId) => { calls.push(`start:${userId}`); return participant; },
    completeOnboarding: async (userId) => { calls.push(`complete:${userId}`); return participant; },
  });
  await withServer(appFor(repo), async (base) => {
    assert.equal((await fetch(`${base}/api/beta/state`)).status, 200);
    assert.equal((await fetch(`${base}/api/beta/onboarding/start`, { method: 'POST' })).status, 200);
    assert.equal((await fetch(`${base}/api/beta/onboarding/complete`, { method: 'POST' })).status, 200);
  });
  assert.deepEqual(calls, [`state:${USER_ID}`, `start:${USER_ID}`, `complete:${USER_ID}`]);
  await withServer(appFor(repository(), false), async (base) => {
    assert.equal((await fetch(`${base}/api/beta/state`)).status, 401);
  });
});

test('feedback is bounded, strictly validated, and cannot spoof identity', async () => {
  let submitted: unknown;
  const repo = repository({ submitFeedback: async (userId, input) => {
    submitted = { userId, input }; return { id: 'fb000000-0000-4000-8000-000000000001', created_at: participant.created_at };
  } });
  await withServer(appFor(repo), async (base) => {
    const valid = await fetch(`${base}/api/beta/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      category: 'bug', rating: 4, product_area: 'projects', message: 'The empty state needs a clearer next action.',
    }) });
    assert.equal(valid.status, 201);
    assert.deepEqual(submitted, { userId: USER_ID, input: { category: 'bug', rating: 4, product_area: 'projects', message: 'The empty state needs a clearer next action.' } });

    for (const invalid of [
      { category: 'bug', rating: 4, product_area: 'projects', message: 'x'.repeat(2001) },
      { category: 'unknown', rating: 4, product_area: 'projects', message: 'Invalid category' },
      { category: 'bug', rating: 4, product_area: 'projects', message: 'Spoof', user_id: 'ba000000-0000-4000-8000-000000000002' },
    ]) {
      assert.equal((await fetch(`${base}/api/beta/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invalid) })).status, 400);
    }
  });
});

test('client analytics accepts only low-noise view events with a server daily dedupe key', async () => {
  const calls: unknown[] = [];
  const repo = repository({ recordEvent: async (...args) => { calls.push(args); } });
  await withServer(appFor(repo), async (base) => {
    for (let i = 0; i < 2; i += 1) {
      assert.equal((await fetch(`${base}/api/beta/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_name: 'engimatch_viewed' }) })).status, 204);
    }
    for (const body of [
      { event_name: 'ai_message_sent' },
      { event_name: 'direct_chat_opened', prompt: 'private content' },
      { event_name: 'anything' },
    ]) assert.equal((await fetch(`${base}/api/beta/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, 400);
  });
  assert.equal(calls.length, 2);
  assert.equal((calls[0] as unknown[])[0], USER_ID);
  assert.equal((calls[0] as unknown[])[1], 'engimatch_viewed');
  assert.match((calls[0] as unknown[])[3] as string, /^daily:\d{4}-\d{2}-\d{2}$/u);
  assert.equal((calls[0] as unknown[])[3], (calls[1] as unknown[])[3]);
});
