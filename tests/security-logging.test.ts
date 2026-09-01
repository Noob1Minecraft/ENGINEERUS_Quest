import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { apiErrorHandler } from "../server/middleware/apiErrorHandler";
import { createRequestContext, REQUEST_ID_HEADER } from "../server/middleware/requestContext";
import { createStructuredLogger, redactLogValue } from "../server/security/structuredLogger";
import { withServer } from "./helpers";

test("structured log redaction removes sensitive keys and embedded credentials", () => {
  const sanitized = redactLogValue({
    authorization: "Bearer should-never-appear",
    nested: {
      access_token: "secret-access",
      refreshToken: "secret-refresh",
      password: "secret-password",
      api_key: "secret-api-key",
      cookie: "session=secret-cookie",
    },
    message: "authorization=hidden Bearer hidden-token eyJabcdefghijk.abcdefghijk.abcdefghijk",
    safe: "provider timeout",
  });
  const serialized = JSON.stringify(sanitized);

  for (const secret of ["should-never-appear", "secret-access", "secret-refresh", "secret-password", "secret-api-key", "secret-cookie", "hidden-token", "eyJabcdefghijk"]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.match(serialized, /\[REDACTED\]/u);
  assert.match(serialized, /provider timeout/u);
});

test("request IDs are server generated, distinct, and correlated with structured logs", async () => {
  const lines: string[] = [];
  const logger = createStructuredLogger((line) => lines.push(line));
  const app = express();
  app.use(createRequestContext(logger));
  app.get("/health", (_request, response) => response.json({ status: "ok" }));

  await withServer(app, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/health`, { headers: { "X-Request-ID": "attacker-controlled-log-injection" } });
    const second = await fetch(`${baseUrl}/health`);
    const firstId = first.headers.get(REQUEST_ID_HEADER);
    const secondId = second.headers.get(REQUEST_ID_HEADER);

    assert.match(firstId ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
    assert.match(secondId ?? "", /^[0-9a-f-]{36}$/iu);
    assert.notEqual(firstId, secondId);
    assert.notEqual(firstId, "attacker-controlled-log-injection");
    await new Promise((resolve) => setTimeout(resolve, 10));

    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    const firstEntry = entries.find((entry) => entry.request_id === firstId);
    assert.equal(firstEntry?.event, "http_request_completed");
    assert.equal(firstEntry?.method, "GET");
    assert.equal(firstEntry?.route, "/health");
    assert.equal(firstEntry?.status, 200);
    assert.equal(typeof firstEntry?.duration_ms, "number");
    assert.equal(lines.some((line) => line.includes("log-injection")), false);
  });
});

test("sanitized 5xx responses contain the same request ID without stack details", async () => {
  const lines: string[] = [];
  const app = express();
  app.use(createRequestContext(createStructuredLogger((line) => lines.push(line))));
  app.get("/failure", () => { throw new Error("sensitive internal detail"); });
  app.use(apiErrorHandler);

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/failure`);
    const requestId = response.headers.get(REQUEST_ID_HEADER);
    const body = await response.json() as { error: { request_id: string; message: string } };
    assert.equal(response.status, 500);
    assert.equal(body.error.request_id, requestId);
    assert.equal(JSON.stringify(body).includes("sensitive internal detail"), false);
    assert.equal(JSON.stringify(body).includes("stack"), false);
  });
});
