import assert from "node:assert/strict";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { ChatRepository } from "../server/persistence/chats";
import { apiErrorHandler } from "../server/middleware/apiErrorHandler";
import { createAiRouter } from "../server/routes/ai";
import { withServer } from "./helpers";

const SESSION_ID = "123e4567-e89b-42d3-a456-426614174000";
const USER_ID = "123e4567-e89b-42d3-a456-426614174001";
const TIMESTAMP = "2026-08-24T00:00:00.000Z";
const PROGRESS = {
  xp: 10, level: 1, streak: 1, requests_count: 1,
  material_count: 0, patent_count: 0, modules_used: ["tutor"],
};

function testApp(generateResponse: () => Promise<string> = async () => "Безопасный ответ.") {
  const state = { beginCalls: 0, completeCalls: 0 };
  const repository = {
    async beginExchange(
      _userId: string,
      _accessToken: string,
      _sessionId: string,
      _requestId: string,
      text: string,
    ) {
      state.beginCalls += 1;
      return {
        userMessage: { id: "user-message", sender: "user" as const, text, module: "tutor" as const, timestamp: TIMESTAMP },
        assistantMessage: null,
        progress: PROGRESS,
      };
    },
    async completeExchange(
      _userId: string,
      _accessToken: string,
      _sessionId: string,
      requestId: string,
      responseText: string,
    ) {
      state.completeCalls += 1;
      return {
        userMessage: { id: "user-message", sender: "user" as const, text: "Что такое момент?", module: "tutor" as const, timestamp: TIMESTAMP },
        assistantMessage: { id: "assistant-message", sender: "ai" as const, text: responseText, module: "tutor" as const, timestamp: TIMESTAMP, requestId, xpEarned: 10 },
        progress: PROGRESS,
        awarded: true,
      };
    },
  } as unknown as ChatRepository;
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.auth = { userId: USER_ID, accessToken: "test-access-token", claims: {} };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use(createAiRouter(authenticate, (_request, _response, next) => next(), {
    repository,
    detectLanguage: () => "ru",
    generateResponse,
  }));
  app.use(apiErrorHandler);
  return { app, state };
}

async function postJson(baseUrl: string, value: unknown, path = "/api/ai") {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "123e4567-e89b-42d3-a456-426614174002" },
    body: JSON.stringify(value),
  });
}

test("AI routes reject null, arrays, primitives, empty objects, and missing fields without persistence", async () => {
  const { app, state } = testApp();
  const invalidBodies: Array<{ value: unknown; code: "invalid_json" | "invalid_ai_request" }> = [
    { value: null, code: "invalid_json" },
    { value: [], code: "invalid_ai_request" },
    { value: "prompt", code: "invalid_json" },
    { value: 42, code: "invalid_json" },
    { value: true, code: "invalid_json" },
    { value: {}, code: "invalid_ai_request" },
    { value: { text: "Что такое момент?" }, code: "invalid_ai_request" },
    { value: { session_id: SESSION_ID }, code: "invalid_ai_request" },
  ];

  await withServer(app, async (baseUrl) => {
    for (const { value, code } of invalidBodies) {
      const response = await postJson(baseUrl, value);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: code === "invalid_json"
          ? { code, message: "The request body must contain valid JSON." }
          : { code, message: "A valid chat session and prompt are required." },
      });
    }
  });
  assert.equal(state.beginCalls, 0);
  assert.equal(state.completeCalls, 0);
});

test("AI schema rejects invalid language, UUID, excessive text, and module values while stripping forged fields", async () => {
  const { app, state } = testApp();
  const invalidTutorBodies = [
    { session_id: SESSION_ID, text: "Вопрос", lang: "de" },
    { session_id: "not-a-uuid", text: "Вопрос", lang: "ru" },
    { session_id: SESSION_ID, text: "x".repeat(20_001), lang: "ru" },
  ];

  await withServer(app, async (baseUrl) => {
    for (const body of invalidTutorBodies) {
      assert.equal((await postJson(baseUrl, body)).status, 400);
    }
    const invalidModule = await postJson(baseUrl, {
      session_id: SESSION_ID, text: "Вопрос", lang: "ru", module: "unknown",
    }, "/api/module");
    assert.equal(invalidModule.status, 400);
    assert.equal((await invalidModule.json() as { error: { code: string } }).error.code, "invalid_module_request");

    const forgedFields = await postJson(baseUrl, {
      session_id: SESSION_ID,
      text: "Вопрос",
      lang: "ru",
      owner_id: USER_ID,
      xp: 999_999,
      email: "forged@example.test",
    });
    assert.equal(forgedFields.status, 200);
  });
  assert.equal(state.beginCalls, 1);
  assert.equal(state.completeCalls, 1);
});

test("malformed JSON receives a structured 400 response", async () => {
  const { app, state } = testApp();
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { code: "invalid_json", message: "The request body must contain valid JSON." },
    });
  });
  assert.equal(state.beginCalls, 0);
});

test("a null request cannot create an unhandled rejection and a subsequent valid request succeeds", async () => {
  const { app, state } = testApp();
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", listener);
  try {
    await withServer(app, async (baseUrl) => {
      assert.equal((await postJson(baseUrl, null)).status, 400);
      const response = await postJson(baseUrl, {
        session_id: SESSION_ID, text: "Что такое момент?", lang: "ru",
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json() as { response: string }).response, "Безопасный ответ.");
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  } finally {
    process.off("unhandledRejection", listener);
  }
  assert.deepEqual(unhandled, []);
  assert.equal(state.beginCalls, 1);
  assert.equal(state.completeCalls, 1);
});

test("async provider failure returns a safe structured 503 without completing persistence", async () => {
  const { app, state } = testApp(async () => { throw new Error("provider details must not escape"); });
  await withServer(app, async (baseUrl) => {
    const response = await postJson(baseUrl, {
      session_id: SESSION_ID, text: "Что такое момент?", lang: "ru",
    });
    assert.equal(response.status, 503);
    const body = await response.json() as { error: { code: string; message: string } };
    assert.deepEqual(body, {
      error: { code: "ai_unavailable", message: "The AI service is temporarily unavailable." },
    });
    assert.doesNotMatch(JSON.stringify(body), /provider details|stack|token|secret/iu);
  });
  assert.equal(state.beginCalls, 1);
  assert.equal(state.completeCalls, 0);
});
