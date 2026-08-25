import assert from "node:assert/strict";
import test from "node:test";
import express, { type RequestHandler } from "express";
import type { ChatRepository } from "../server/persistence/chats";
import { createAiRouter } from "../server/routes/ai";
import { withServer } from "./helpers";

const SESSION_ID = "123e4567-e89b-42d3-a456-426614174000";
const USER_ID = "123e4567-e89b-42d3-a456-426614174001";
const TIMESTAMP = "2026-08-20T00:00:00.000Z";
const PROGRESS = {
  xp: 15,
  level: 1,
  streak: 1,
  requests_count: 1,
  material_count: 0,
  patent_count: 0,
  modules_used: ["tutor"],
};

test("never persists or returns think content and preserves the Russian final answer", async () => {
  const russianAnswer = "**Момент инерции** зависит от распределения массы относительно оси вращения.";
  let persistedAssistantText: string | null = null;
  const repository = {
    async beginExchange() {
      return {
        userMessage: {
          id: "user-message",
          sender: "user" as const,
          text: "Что такое момент инерции?",
          module: "tutor" as const,
          timestamp: TIMESTAMP,
        },
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
      persistedAssistantText = responseText;
      return {
        userMessage: {
          id: "user-message",
          sender: "user" as const,
          text: "Что такое момент инерции?",
          module: "tutor" as const,
          timestamp: TIMESTAMP,
        },
        assistantMessage: {
          id: "assistant-message",
          sender: "ai" as const,
          text: responseText,
          module: "tutor" as const,
          timestamp: TIMESTAMP,
          requestId,
          xpEarned: 15,
        },
        progress: PROGRESS,
        awarded: true,
      };
    },
  } as unknown as ChatRepository;
  const authenticate: RequestHandler = (_request, response, next) => {
    response.locals.auth = { userId: USER_ID, accessToken: "test-access-token", claims: {} };
    next();
  };
  const noLimit: RequestHandler = (_request, _response, next) => next();
  const app = express();
  app.use(express.json());
  app.use(createAiRouter(authenticate, noLimit, {
    repository,
    detectLanguage: () => "ru",
    generateResponse: async () => `<think>Here's a thinking process that must remain private.</think>\n\n${russianAnswer}`,
  }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/module`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "123e4567-e89b-42d3-a456-426614174002",
      },
      body: JSON.stringify({
        session_id: SESSION_ID,
        module: "tutor",
        text: "Что такое момент инерции?",
        lang: "ru",
      }),
    });
    const body = await response.json() as {
      response: string;
      assistant_message: { text: string };
    };

    assert.equal(response.status, 200);
    assert.equal(body.response, russianAnswer);
    assert.equal(body.assistant_message.text, russianAnswer);
  });

  assert.equal(persistedAssistantText, russianAnswer);
  assert.doesNotMatch(persistedAssistantText ?? "", /<\/?think\b|thinking process/iu);
});
