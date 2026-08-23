import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRequireAuth } from "../server/middleware/requireAuth";
import { createMeRouter, type CanonicalUser } from "../server/routes/me";
import { withServer } from "./helpers";

const USER_ID = "70000000-0000-4000-8000-000000000001";

const unusedLoader = async (): Promise<CanonicalUser> => {
  throw new Error("unused");
};

test("POST /api/me/daily-activity uses the verified token and returns authoritative streaks", async () => {
  let receivedToken = "";
  const authenticate = createRequireAuth(async () => ({ userId: USER_ID, claims: { sub: USER_ID } }));
  const noLimit: express.RequestHandler = (_request, _response, next) => next();
  const app = express();
  app.use(express.json());
  app.use(createMeRouter(authenticate, noLimit, unusedLoader, async (accessToken) => {
    receivedToken = accessToken;
    return { current_streak: 1, longest_streak: 3, last_active_date: "2026-08-23" };
  }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/me/daily-activity`, {
      method: "POST",
      headers: { Authorization: "Bearer verified-token", "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: "80000000-0000-4000-8000-000000000001", current_streak: 99 }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      activity: { current_streak: 1, longest_streak: 3, last_active_date: "2026-08-23" },
    });
    assert.equal(receivedToken, "verified-token");
  });
});

test("POST /api/me/daily-activity rejects unauthenticated callers", async () => {
  const authenticate = createRequireAuth(async () => ({ userId: USER_ID, claims: { sub: USER_ID } }));
  const noLimit: express.RequestHandler = (_request, _response, next) => next();
  const app = express();
  app.use(createMeRouter(authenticate, noLimit, unusedLoader, async () => {
    throw new Error("must not run");
  }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/me/daily-activity`, { method: "POST" });
    assert.equal(response.status, 401);
  });
});
