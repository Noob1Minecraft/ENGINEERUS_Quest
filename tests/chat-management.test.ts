import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import type { ChatRepository } from '../server/persistence/chats';
import { createChatsRouter } from '../server/routes/chats';
import { withServer } from './helpers';

const USER_ID = '123e4567-e89b-42d3-a456-426614174001';
const SESSION_ID = '123e4567-e89b-42d3-a456-426614174002';
const NOW = '2026-08-30T00:00:00.000Z';

function source(file: string): string {
  return readFileSync(path.resolve(file), 'utf8');
}

test('chat rename and delete routes use verified identity and enforce bounded non-empty titles', async () => {
  const calls: unknown[] = [];
  const repository = {
    async update(userId: string, accessToken: string, sessionId: string, changes: { title?: string }) {
      calls.push({ operation: 'update', userId, accessToken, sessionId, changes });
      return { id: sessionId, title: changes.title ?? 'Owned', module: 'tutor', createdAt: NOW, updatedAt: NOW };
    },
    async remove(userId: string, accessToken: string, sessionId: string) {
      calls.push({ operation: 'remove', userId, accessToken, sessionId });
    },
  } as unknown as ChatRepository;
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.auth = { userId: USER_ID, accessToken: 'owner-token', claims: {} };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use(createChatsRouter(authenticate, (_request, _response, next) => next(), repository));

  await withServer(app, async (baseUrl) => {
    const renamed = await fetch(`${baseUrl}/api/chats/${SESSION_ID}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '  Beam notes  ' }),
    });
    assert.equal(renamed.status, 200);
    assert.equal((await renamed.json() as { session: { title: string } }).session.title, 'Beam notes');
    for (const title of ['', ' '.repeat(4), 'x'.repeat(201)]) {
      const response = await fetch(`${baseUrl}/api/chats/${SESSION_ID}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      });
      assert.equal(response.status, 400);
    }
    assert.equal((await fetch(`${baseUrl}/api/chats/${SESSION_ID}`, { method: 'DELETE' })).status, 204);
  });

  assert.deepEqual(calls, [
    { operation: 'update', userId: USER_ID, accessToken: 'owner-token', sessionId: SESSION_ID, changes: { title: 'Beam notes' } },
    { operation: 'remove', userId: USER_ID, accessToken: 'owner-token', sessionId: SESSION_ID },
  ]);
});

test('AI Tutor exposes accessible localized management without deleting attachment-library records', () => {
  const assistant = source('src/components/AIAssistantTab.tsx');
  const repository = source('server/persistence/chats.ts');
  for (const required of [
    'aria-haspopup="menu"', 'role="menu"', 'role="menuitem"', 'aria-modal="true"',
    "event.key !== 'Escape'", 'maxLength=\\{200\\}', 'sessionStorage.removeItem', 'clearChatDraft',
    'managementCopy.rename', 'managementCopy.delete', 'dialogReturnFocusRef.current?.focus',
  ]) assert.match(assistant, new RegExp(required.replace(/[?.()]/g, '\\$&')));
  assert.match(repository, /requireOwnedSession\(userId, accessToken, sessionId\)/u);
  assert.match(repository, /\.eq\("user_id", userId\)/u);
  assert.doesNotMatch(assistant, /\/api\/(?:documents|images)\/[^{`]*["'`][^\n]*method:\s*['"]DELETE/u);
});
