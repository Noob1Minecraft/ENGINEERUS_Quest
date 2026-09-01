import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createImageUploadRateLimit, createVisionAiRateLimit } from "../server/middleware/authenticatedRateLimit";
import { withServer } from "./helpers";

test("image upload and vision inference have separate user-scoped conservative budgets", async () => {
  const app = express(); app.use(express.json());
  app.use((_request, response, next) => { response.locals.auth = { userId: "rate-user", accessToken: "test", claims: {} }; next(); });
  app.post("/upload", createImageUploadRateLimit(undefined, 1), (_request, response) => response.status(204).end());
  app.post("/ai", createVisionAiRateLimit(undefined, 1), (_request, response) => response.status(204).end());
  await withServer(app, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/upload`, { method: "POST" })).status, 204);
    const uploadRejected = await fetch(`${baseUrl}/upload`, { method: "POST" });
    assert.equal(uploadRejected.status, 429);
    assert.equal((await uploadRejected.json() as { error: { code: string } }).error.code, "image_upload_rate_limit_exceeded");

    assert.equal((await fetch(`${baseUrl}/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "text only" }) })).status, 204);
    assert.equal((await fetch(`${baseUrl}/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_ids: [crypto.randomUUID()] }) })).status, 204);
    const visionRejected = await fetch(`${baseUrl}/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_ids: [crypto.randomUUID()] }) });
    assert.equal(visionRejected.status, 429);
    assert.equal((await visionRejected.json() as { error: { code: string } }).error.code, "vision_rate_limit_exceeded");
  });
});
