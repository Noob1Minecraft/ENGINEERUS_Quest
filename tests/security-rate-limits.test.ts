import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import express, { type RequestHandler } from "express";
import { MemoryStore } from "express-rate-limit";
import {
  createAiConcurrencyGuard,
  createAiRateLimit,
  createAuthenticatedRateLimit,
  createDirectChatReadRateLimit,
  createPreAuthRateLimit,
} from "../server/middleware/authenticatedRateLimit";
import {
  InMemoryAiCapacityStore,
  type RateLimitStoreFactory,
} from "../server/security/securityControlStore";
import { withServer } from "./helpers";

const USER_ID = "123e4567-e89b-42d3-a456-426614174001";
const authenticate: RequestHandler = (_request, response, next) => {
  response.locals.auth = { userId: USER_ID, accessToken: "test-access-token", claims: {} };
  next();
};

test("pre-auth limiting protects API work before authentication and returns a safe 429", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.get("/health", (_request, response) => response.json({ status: "ok" }));
  app.use("/api", createPreAuthRateLimit(undefined, 2));
  app.get("/api/protected", (_request, response) => response.json({ ok: true }));

  await withServer(app, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/protected`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/protected`)).status, 200);
    const limited = await fetch(`${baseUrl}/api/protected`);
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get("ratelimit"));
    assert.ok(limited.headers.get("ratelimit-policy"));
    assert.deepEqual(await limited.json(), {
      error: { code: "pre_auth_rate_limit_exceeded", message: "Too many API requests. Try again later." },
    });
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
  });
});

test("AI uses a smaller authenticated budget than the general endpoint pool", async () => {
  const app = express();
  const authenticateFromHeader: RequestHandler = (request, response, next) => {
    response.locals.auth = { userId: request.header("x-test-user") ?? USER_ID, accessToken: "test", claims: {} };
    next();
  };
  app.post("/api/ai", authenticateFromHeader, createAiRateLimit(undefined, 2), (_request, response) => response.json({ ok: true }));
  await withServer(app, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/ai`, { method: "POST" })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/ai`, { method: "POST" })).status, 200);
    const limited = await fetch(`${baseUrl}/api/ai`, { method: "POST" });
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), {
      error: { code: "ai_rate_limit_exceeded", message: "AI request budget exceeded. Try again later." },
    });
    assert.equal((await fetch(`${baseUrl}/api/ai`, { method: "POST", headers: { "x-test-user": "other-user" } })).status, 200);
  });
});

test("AI concurrency allows one request per user, rejects overlap, and releases capacity", async () => {
  const store = new InMemoryAiCapacityStore();
  const app = express();
  let entered!: () => void;
  const didEnter = new Promise<void>((resolve) => { entered = resolve; });
  let finish!: () => void;
  const canFinish = new Promise<void>((resolve) => { finish = resolve; });
  let first = true;
  app.post("/api/ai", authenticate, createAiConcurrencyGuard(store), async (_request, response) => {
    if (first) {
      first = false;
      entered();
      await canFinish;
    }
    response.json({ ok: true });
  });

  await withServer(app, async (baseUrl) => {
    const firstRequest = fetch(`${baseUrl}/api/ai`, { method: "POST" });
    await didEnter;
    const overlapping = await fetch(`${baseUrl}/api/ai`, { method: "POST" });
    assert.equal(overlapping.status, 429);
    assert.equal(overlapping.headers.get("retry-after"), "2");
    assert.equal((await overlapping.json() as { error: { code: string } }).error.code, "ai_concurrency_exceeded");
    finish();
    assert.equal((await firstRequest).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/ai`, { method: "POST" })).status, 200);
  });
});

test("in-memory AI capacity enforces both per-user and global bounds", async () => {
  const store = new InMemoryAiCapacityStore();
  const limits = { maxPerUser: 1, maxGlobal: 2, leaseMs: 60_000 };
  const first = await store.tryAcquire("user-a", limits);
  assert.ok(first);
  assert.equal(await store.tryAcquire("user-a", limits), null);
  const second = await store.tryAcquire("user-b", limits);
  assert.ok(second);
  assert.equal(await store.tryAcquire("user-c", limits), null);
  await first.release();
  assert.ok(await store.tryAcquire("user-c", limits));
  await second.release();
});

test("a shared-store factory receives isolated namespaces without provisioning a store", () => {
  const namespaces: string[] = [];
  const factory: RateLimitStoreFactory = {
    create(namespace) {
      namespaces.push(namespace);
      return new MemoryStore();
    },
  };
  createPreAuthRateLimit(factory);
  createAuthenticatedRateLimit(factory);
  createAiRateLimit(factory);
  createDirectChatReadRateLimit(factory);
  assert.deepEqual(namespaces, [
    "pre-auth",
    "authenticated-general",
    "authenticated-ai",
    "authenticated-direct-chat-read",
  ]);
});

test("the application wires pre-auth protection and dedicated AI controls", () => {
  const appSource = readFileSync(path.resolve("server/app.ts"), "utf8");
  const serverSource = readFileSync(path.resolve("server.ts"), "utf8");
  assert.match(appSource, /app\.use\("\/api", createPreAuthRateLimit/);
  assert.match(serverSource, /const aiRateLimit = createAiRateLimit\(\)/);
  assert.match(serverSource, /createAiConcurrencyGuard\(new InMemoryAiCapacityStore\(\)\)/);
  assert.match(serverSource, /createAiRouter\(requireAuth, aiRateLimit/);
  assert.doesNotMatch(serverSource, /createAiRouter\(requireAuth, authenticatedRateLimit/);
});
