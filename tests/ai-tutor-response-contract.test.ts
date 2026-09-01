import assert from "node:assert/strict";
import test from "node:test";
import { appendOffTopicTransientMessage, isOffTopicRedirectResponse, type ModuleAiResponse } from "../src/ai/moduleResponse";

const userMessage = {
  id: "user-message",
  sender: "user" as const,
  text: "prompt",
  module: "tutor",
  timestamp: "2026-08-31T00:00:00.000Z",
};

function response(text: string, responseType: "completion" | "off_topic_redirect" = "off_topic_redirect"): ModuleAiResponse {
  return {
    status: "ok",
    response: text,
    response_type: responseType,
    user_message: userMessage,
    assistant_message: null,
    xp: 0,
    level: 1,
    streak: 1,
    requests_count: 0,
    material_count: 0,
    patent_count: 0,
    modules_used: [],
  };
}

test("off-topic redirects render as one transient assistant message in RU, KK, and EN without a persisted assistant row", () => {
  for (const text of [
    "Я сфокусирован на инженерных задачах.",
    "Мен инженерлік тапсырмаларға бағытталғанмын.",
    "I’m focused on engineering tasks.",
  ]) {
    const redirect = response(text);
    assert.equal(isOffTopicRedirectResponse(redirect), true);
    const messages = appendOffTopicTransientMessage([userMessage], redirect, {
      requestId: "request-1", module: "tutor", timestamp: "10:00",
    });
    assert.equal(messages.length, 2);
    assert.equal(messages[1].text, text);
    assert.equal(messages[1].transient, true);
    assert.equal(messages[1].requestId, "request-1");
    assert.equal(appendOffTopicTransientMessage(messages, redirect, {
      requestId: "request-1", module: "tutor", timestamp: "10:00",
    }).length, 2);
  }
});

test("only the explicit off-topic response type turns a null assistant into a transient success", () => {
  const incomplete = response("", "completion");
  assert.equal(isOffTopicRedirectResponse(incomplete), false);
  assert.deepEqual(appendOffTopicTransientMessage([userMessage], incomplete, {
    requestId: "request-2", module: "tutor", timestamp: "10:00",
  }), [userMessage]);
});
