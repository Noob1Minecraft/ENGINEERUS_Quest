import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalAiRequestId,
  createOptimisticUserMessage,
  markOptimisticMessageFailed,
  mergeCanonicalMessages,
  persistedUserMessageFromError,
} from "../src/ai/messageFlow";
import { ApiError } from "../src/utils/api";

const clientRequestId = "123e4567-e89b-42d3-a456-426614174002";
const requestId = canonicalAiRequestId("tutor", clientRequestId);
const canonicalUser = {
  id: "123e4567-e89b-42d3-a456-426614174010",
  sender: "user" as const,
  text: "What is torque?",
  module: "tutor",
  timestamp: "2026-09-20T10:00:00.000Z",
  requestId,
};

test("optimistic user message renders immediately and canonical persistence replaces it without duplicates", () => {
  const optimistic = createOptimisticUserMessage({
    requestId,
    text: canonicalUser.text,
    module: canonicalUser.module,
    timestamp: canonicalUser.timestamp,
  });
  assert.equal(optimistic.deliveryState, "sending");
  assert.equal(optimistic.text, canonicalUser.text);

  const reconciled = mergeCanonicalMessages([optimistic], [canonicalUser]);
  assert.deepEqual(reconciled, [canonicalUser]);
  assert.equal(reconciled.filter((message) => message.requestId === requestId).length, 1);
});

test("failed request keeps the visible question and exposes a retryable failed state", () => {
  const optimistic = createOptimisticUserMessage({
    requestId,
    text: canonicalUser.text,
    module: canonicalUser.module,
    timestamp: canonicalUser.timestamp,
  });
  const failed = markOptimisticMessageFailed([optimistic], requestId);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].text, canonicalUser.text);
  assert.equal(failed[0].deliveryState, "failed");
});

test("structured AI failure exposes only the already-persisted canonical user message", () => {
  const error = new ApiError(503, "ai_provider_unavailable", "safe", {
    error: { code: "ai_provider_unavailable", message: "safe" },
    user_message: canonicalUser,
    assistant_message: null,
  });
  assert.deepEqual(persistedUserMessageFromError(error), canonicalUser);
  assert.equal(persistedUserMessageFromError(new Error("network")), null);
});

test("same idempotency key never creates duplicate user or assistant render rows", () => {
  const assistant = {
    id: "123e4567-e89b-42d3-a456-426614174011",
    sender: "ai" as const,
    text: "Torque is the turning effect of a force.",
    module: "tutor",
    timestamp: "2026-09-20T10:00:01.000Z",
    requestId,
  };
  const merged = mergeCanonicalMessages(
    [canonicalUser, assistant],
    [canonicalUser, assistant],
  );
  assert.deepEqual(merged, [canonicalUser, assistant]);
});
