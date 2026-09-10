import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import type { AdminRepository } from '../server/persistence/admin';
import { createAdminRouter } from '../server/routes/admin';
import { withServer } from './helpers';

const ADMIN = 'a1000000-0000-4000-8000-000000000001';
const TARGET = 'a1000000-0000-4000-8000-000000000002';
const FEEDBACK = 'a2000000-0000-4000-8000-000000000001';
const NOW = '2026-09-10T08:00:00.000Z';

function repository(overrides: Partial<AdminRepository> = {}): AdminRepository {
  return {
    isAdmin: async () => true,
    listFeedback: async () => ({ feedback: [], next_cursor: null }),
    getFeedback: async () => ({ id: FEEDBACK, category: 'bug', rating: 4, product_area: 'dashboard', message: 'Safe feedback', status: 'new', created_at: NOW, reviewed_at: null, reviewed_by: null, submitter_id: TARGET, submitter_username: 'engineer', submitter_display_name: 'Engineer', submitter_avatar_url: null }),
    updateFeedbackStatus: async (_token, _id, status) => ({ id: FEEDBACK, category: 'bug', rating: 4, product_area: 'dashboard', message: 'Safe feedback', status, created_at: NOW, reviewed_at: NOW, reviewed_by: ADMIN, submitter_id: TARGET, submitter_username: 'engineer', submitter_display_name: 'Engineer', submitter_avatar_url: null }),
    listAdmins: async () => [], searchUsers: async () => [],
    grantAdmin: async () => ({ user_id: TARGET, role: 'admin', granted_at: NOW, granted_by: ADMIN, username: 'engineer', display_name: 'Engineer', avatar_url: null }),
    revokeAdmin: async () => undefined,
    ...overrides,
  };
}

function appFor(repo: AdminRepository, authenticated = true) {
  const app = express(); app.use(express.json());
  const auth: RequestHandler = (_request, response, next) => {
    if (!authenticated) return response.status(401).json({ error: { code: 'missing_bearer_token' } });
    response.locals.auth = { userId: ADMIN, accessToken: 'verified-token', claims: {} }; next();
  };
  app.use(createAdminRouter(auth, (_request, _response, next) => next(), repo));
  return app;
}

test('anonymous callers are denied before any admin repository operation', async () => {
  let checked = false;
  await withServer(appFor(repository({ isAdmin: async () => { checked = true; return true; } }), false), async (base) => {
    assert.equal((await fetch(`${base}/api/admin/feedback`)).status, 401);
  });
  assert.equal(checked, false);
});

test('normal users receive 403 and no admin data method is called', async () => {
  let listed = false;
  await withServer(appFor(repository({ isAdmin: async () => false, listFeedback: async () => { listed = true; return { feedback: [], next_cursor: null }; } })), async (base) => {
    const response = await fetch(`${base}/api/admin/feedback`);
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'admin_forbidden');
  });
  assert.equal(listed, false);
});

test('access endpoint returns only the current verified token role check', async () => {
  let token = '';
  await withServer(appFor(repository({ isAdmin: async (value) => { token = value; return true; } })), async (base) => {
    const response = await fetch(`${base}/api/admin/access`);
    assert.deepEqual(await response.json(), { is_admin: true });
  });
  assert.equal(token, 'verified-token');
});

test('admin feedback list, detail, and status update use validated inputs', async () => {
  const calls: unknown[] = [];
  const repo = repository({
    listFeedback: async (token, limit, cursor) => { calls.push(['list', token, limit, cursor]); return { feedback: [], next_cursor: null }; },
    getFeedback: async (token, id) => { calls.push(['get', token, id]); return repository().getFeedback(token, id); },
    updateFeedbackStatus: async (token, id, status) => { calls.push(['update', token, id, status]); return repository().updateFeedbackStatus(token, id, status); },
  });
  await withServer(appFor(repo), async (base) => {
    assert.equal((await fetch(`${base}/api/admin/feedback?limit=10`)).status, 200);
    assert.equal((await fetch(`${base}/api/admin/feedback/${FEEDBACK}`)).status, 200);
    assert.equal((await fetch(`${base}/api/admin/feedback/${FEEDBACK}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }) })).status, 200);
  });
  assert.deepEqual(calls, [['list', 'verified-token', 10, undefined], ['get', 'verified-token', FEEDBACK], ['update', 'verified-token', FEEDBACK, 'resolved']]);
});

test('admin mutations reject spoofed actor and unknown fields', async () => {
  await withServer(appFor(repository()), async (base) => {
    const status = await fetch(`${base}/api/admin/feedback/${FEEDBACK}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'reviewed', actor_id: ADMIN }) });
    const grant = await fetch(`${base}/api/admin/users/${TARGET}/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'admin', granted_by: ADMIN }) });
    assert.equal(status.status, 400);
    assert.equal(grant.status, 400);
  });
});

test('admin grant and revoke forward only target path identity and verified token', async () => {
  const calls: unknown[] = [];
  const repo = repository({ grantAdmin: async (token, id) => { calls.push(['grant', token, id]); return repository().grantAdmin(token, id); }, revokeAdmin: async (token, id) => { calls.push(['revoke', token, id]); } });
  await withServer(appFor(repo), async (base) => {
    assert.equal((await fetch(`${base}/api/admin/users/${TARGET}/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 201);
    assert.equal((await fetch(`${base}/api/admin/users/${TARGET}/admin`, { method: 'DELETE' })).status, 204);
  });
  assert.deepEqual(calls, [['grant', 'verified-token', TARGET], ['revoke', 'verified-token', TARGET]]);
});

test('admin API projections contain no auth, contact, token, chat, AI, or private project data', async () => {
  await withServer(appFor(repository({ listAdmins: async () => [await repository().grantAdmin('verified-token', TARGET)] })), async (base) => {
    const responses = await Promise.all([
      fetch(`${base}/api/admin/feedback/${FEEDBACK}`).then((response) => response.text()),
      fetch(`${base}/api/admin/admins`).then((response) => response.text()),
    ]);
    assert.doesNotMatch(responses.join(' '), /email|phone|telegram|password|token|provider_metadata|auth_metadata|chat_content|ai_prompt|project_description/i);
  });
});
