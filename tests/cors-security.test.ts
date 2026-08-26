import assert from "node:assert/strict";
import test from "node:test";
import { createAllowedOrigins, createApp } from "../server/app";
import { loadServerEnv } from "../server/config/env";
import { withServer } from "./helpers";

const productionEnv = loadServerEnv({
  NODE_ENV: "production",
  FRONTEND_ORIGIN: "https://engineerus-quest.vercel.app",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-publishable-placeholder",
  SUPABASE_SECRET_KEY: "test-secret-placeholder",
});

test("production CORS allowlist contains deployed origins but no localhost", () => {
  const origins = createAllowedOrigins(productionEnv);
  assert.ok(origins.has("https://engineerus-quest.vercel.app"));
  assert.ok(origins.has("https://engineerus-quest-git-feat-supabase-foundation-enginnerus.vercel.app"));
  assert.equal([...origins].some((origin) => /localhost|127\.0\.0\.1/u.test(origin)), false);
  assert.equal(origins.has("*"), false);
});

test("localhost is restricted to explicit development and test environments", () => {
  for (const NODE_ENV of ["development", "test"] as const) {
    const origins = createAllowedOrigins(loadServerEnv({ NODE_ENV }));
    assert.ok(origins.has("http://localhost:5173"));
    assert.ok(origins.has("http://localhost:3000"));
  }
  const productionWithMisconfiguredLoopback = createAllowedOrigins(loadServerEnv({
    NODE_ENV: "production",
    FRONTEND_ORIGIN: "http://localhost:4173,https://preview.example.test",
  }));
  assert.equal(productionWithMisconfiguredLoopback.has("http://localhost:4173"), false);
  assert.ok(productionWithMisconfiguredLoopback.has("https://preview.example.test"));
});

test("allowed deployed origins receive CORS without credentialed-cookie support", async () => {
  await withServer(createApp(productionEnv), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "https://engineerus-quest.vercel.app" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://engineerus-quest.vercel.app");
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  });
});

test("a disallowed origin is rejected and never reflected", async () => {
  await withServer(createApp(productionEnv), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "https://attacker.example" },
    });
    assert.equal(response.status, 200, "the server remains reachable but the browser receives no CORS grant");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  });
});
