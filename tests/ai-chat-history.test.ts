import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import express, { type RequestHandler } from 'express';
import type { ChatMessageCursor, ChatRepository, ChatSessionCursor } from '../server/persistence/chats';
import { createChatsRouter } from '../server/routes/chats';
import { withServer } from './helpers';

const USER_ID = '123e4567-e89b-42d3-a456-426614174001';
const SESSION_ID = '123e4567-e89b-42d3-a456-426614174002';
const OTHER_SESSION_ID = '123e4567-e89b-42d3-a456-426614174003';
const TIMESTAMP = '2026-08-26T10:00:00.000Z';

function testApp() {
  const calls: {
    session: Array<{ userId: string; limit: number; cursor?: ChatSessionCursor }>;
    messages: Array<{ userId: string; sessionId: string; limit: number; cursor?: ChatMessageCursor }>;
  } = { session: [], messages: [] };
  const repository = {
    async list(userId: string, _token: string, limit: number, cursor?: ChatSessionCursor) {
      calls.session.push({ userId, limit, cursor });
      return {
        items: [{ id: SESSION_ID, title: 'Owned', module: 'tutor', createdAt: TIMESTAMP, updatedAt: TIMESTAMP }],
        nextCursor: cursor ? null : { updatedAt: TIMESTAMP, id: OTHER_SESSION_ID },
      };
    },
    async messages(userId: string, _token: string, sessionId: string, limit: number, cursor?: ChatMessageCursor) {
      calls.messages.push({ userId, sessionId, limit, cursor });
      return {
        items: [{ id: OTHER_SESSION_ID, sender: 'ai' as const, text: 'answer', module: 'tutor' as const, timestamp: TIMESTAMP }],
        nextCursor: cursor ? null : { createdAt: TIMESTAMP, id: OTHER_SESSION_ID },
      };
    },
  } as unknown as ChatRepository;
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.auth = { userId: USER_ID, accessToken: 'test-token', claims: {} };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use(createChatsRouter(authenticate, (_request, _response, next) => next(), repository));
  return { app, calls };
}

test('chat session pagination is bounded, opaque, owner-derived, and backward compatible', async () => {
  const { app, calls } = testApp();
  await withServer(app, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/chats`);
    assert.equal(first.status, 200);
    const body = await first.json() as { items: unknown[]; sessions: unknown[]; next_cursor: string };
    assert.equal(body.items.length, 1);
    assert.deepEqual(body.sessions, body.items);
    assert.ok(body.next_cursor && !body.next_cursor.includes(TIMESTAMP));
    assert.deepEqual(calls.session[0], { userId: USER_ID, limit: 20, cursor: undefined });

    const second = await fetch(`${baseUrl}/api/chats?limit=50&cursor=${encodeURIComponent(body.next_cursor)}`);
    assert.equal(second.status, 200);
    assert.deepEqual(calls.session[1], {
      userId: USER_ID, limit: 50, cursor: { updatedAt: TIMESTAMP, id: OTHER_SESSION_ID },
    });
  });
});

test('message history is selected-session only, bounded, and cursor validated', async () => {
  const { app, calls } = testApp();
  await withServer(app, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/chats/${SESSION_ID}/messages`);
    assert.equal(first.status, 200);
    const body = await first.json() as { items: unknown[]; messages: unknown[]; next_cursor: string };
    assert.deepEqual(body.messages, body.items);
    assert.deepEqual(calls.messages[0], {
      userId: USER_ID, sessionId: SESSION_ID, limit: 50, cursor: undefined,
    });

    const second = await fetch(`${baseUrl}/api/chats/${SESSION_ID}/messages?limit=100&cursor=${encodeURIComponent(body.next_cursor)}`);
    assert.equal(second.status, 200);
    assert.deepEqual(calls.messages[1]?.cursor, { createdAt: TIMESTAMP, id: OTHER_SESSION_ID });

    assert.equal((await fetch(`${baseUrl}/api/chats?limit=51`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/chats/${SESSION_ID}/messages?limit=101`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/chats?cursor=not-a-cursor`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/chats/${SESSION_ID}/messages?cursor=not-a-cursor`)).status, 400);
  });
});

test('frontend hydrates one selected session instead of issuing an initial N+1 fan-out', () => {
  const source = readFileSync(new URL('../src/components/AIAssistantTab.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Promise\.all\(persistentSessions\.map/);
  assert.match(source, /Hydrate only the selected chat/);
  assert.match(source, /loadOlderSessions/);
  assert.match(source, /loadOlderMessages/);
  assert.match(source, /new Map<string, ChatMessage>/);
});
