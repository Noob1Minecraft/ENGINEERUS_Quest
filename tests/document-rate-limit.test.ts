import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createDocumentUploadRateLimit } from "../server/middleware/authenticatedRateLimit";
import { withServer } from "./helpers";

test("document upload limiter is user-scoped and returns the dedicated safe error", async () => {
  const app = express();
  app.use((_request, response, next) => { response.locals.auth = { userId: "rate-user", accessToken: "test", claims: {} }; next(); });
  app.post("/upload", createDocumentUploadRateLimit(undefined, 1), (_request, response) => response.status(204).end());
  await withServer(app, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/upload`, { method: "POST" })).status, 204);
    const rejected = await fetch(`${baseUrl}/upload`, { method: "POST" });
    assert.equal(rejected.status, 429);
    assert.deepEqual(await rejected.json(), { error: { code: "document_upload_rate_limit_exceeded", message: "Too many document uploads. Try again later." } });
  });
});
